'use server';

import { revalidatePath } from 'next/cache';
import { friendlyError } from '@/lib/errors';
import { validateGift } from '@/lib/gifts';
import { isUuid } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionState } from './types';

/**
 * All gift actions call database functions that re-check every permission.
 * The checks here only exist to give quick, friendly messages.
 */

function refresh() {
  revalidatePath('/', 'layout');
}

export async function addGift(_: ActionState, form: FormData): Promise<ActionState> {
  const recipientId = form.get('recipientId');
  if (!isUuid(recipientId)) return fail(friendlyError('not_found'));
  const v = validateGift({ title: form.get('title'), url: form.get('url'), notes: form.get('notes') });
  if (!v.ok) return fail(v.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc('add_gift', {
    p_recipient_id: recipientId,
    p_title: v.value.title,
    p_url: v.value.url,
    p_notes: v.value.notes,
  });
  if (error) return fail(friendlyError(error));
  refresh();
  return ok('Added!');
}

export async function updateGift(_: ActionState, form: FormData): Promise<ActionState> {
  const giftId = form.get('giftId');
  if (!isUuid(giftId)) return fail(friendlyError('not_found'));
  const v = validateGift({ title: form.get('title'), url: form.get('url'), notes: form.get('notes') });
  if (!v.ok) return fail(v.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc('update_gift', {
    p_gift_id: giftId,
    p_title: v.value.title,
    p_url: v.value.url,
    p_notes: v.value.notes,
  });
  if (error) return fail(friendlyError(error));
  refresh();
  return ok('Saved.');
}

/**
 * The database decides between soft- and hard-delete. The response is the
 * same either way, so the recipient learns nothing (SPEC §5.3).
 */
export async function deleteGift(_: ActionState, form: FormData): Promise<ActionState> {
  const giftId = form.get('giftId');
  if (!isUuid(giftId)) return fail(friendlyError('not_found'));
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_gift', { p_gift_id: giftId });
  if (error) return fail(friendlyError(error));
  refresh();
  return ok('Removed from the list.');
}
