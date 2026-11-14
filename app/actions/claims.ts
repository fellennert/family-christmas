'use server';

import { revalidatePath } from 'next/cache';
import { friendlyError } from '@/lib/errors';
import { isUuid } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionState } from './types';

/**
 * One action behind the ClaimControl button: op = claim | unclaim | dismiss.
 * "dismiss" is unclaiming a gift that was removed from the list; the database
 * then deletes the gift too (see unclaim_gift()).
 */
export async function claimOrUnclaim(_: ActionState, form: FormData): Promise<ActionState> {
  const giftId = form.get('giftId');
  const op = form.get('op');
  if (!isUuid(giftId)) return fail(friendlyError('not_found'));

  const supabase = await createClient();

  if (op === 'claim') {
    const { data, error } = await supabase.rpc('claim_gift', { p_gift_id: giftId });
    // Refresh even on failure so the page shows who claimed it.
    revalidatePath('/', 'layout');
    if (error) return fail(friendlyError(error));
    if (data === 'already_claimed') return fail('Someone just claimed this. Pick something else!');
    return ok('You’re getting this! It’s on your shopping list.');
  }

  if (op === 'unclaim' || op === 'dismiss') {
    const { error } = await supabase.rpc('unclaim_gift', { p_gift_id: giftId });
    revalidatePath('/', 'layout');
    if (error) return fail(friendlyError(error));
    return ok(op === 'dismiss' ? 'Dismissed.' : 'Unclaimed. Someone else can pick it now.');
  }

  return fail(friendlyError('invalid_input'));
}

/** Shopping list: the claimer's own "Got it" tick (private to them). */
export async function setPurchased(_: ActionState, form: FormData): Promise<ActionState> {
  const giftId = form.get('giftId');
  if (!isUuid(giftId)) return fail(friendlyError('not_found'));
  const purchased = form.get('purchased') === 'true';
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_purchased', { p_gift_id: giftId, p_purchased: purchased });
  revalidatePath('/shopping');
  if (error) return fail(friendlyError(error));
  return ok(purchased ? 'Marked as got.' : 'Marked as still to get.');
}

/** Shopping list: the claimer's private note. Empty clears it. */
export async function saveClaimNote(_: ActionState, form: FormData): Promise<ActionState> {
  const giftId = form.get('giftId');
  if (!isUuid(giftId)) return fail(friendlyError('not_found'));
  const note = typeof form.get('note') === 'string' ? (form.get('note') as string).trim() : '';
  if (note.length > 500) return fail('Please keep your note under 500 characters.');
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_claim_note', { p_gift_id: giftId, p_note: note || null });
  revalidatePath('/shopping');
  if (error) return fail(friendlyError(error));
  return ok(note ? 'Note saved.' : 'Note removed.');
}
