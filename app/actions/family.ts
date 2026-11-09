'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { clean, LIMITS } from '@/lib/gifts';
import { INVITE_CODE_PATTERN, isUuid, normalizeInviteCode } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionState } from './types';

export async function createFamily(_: ActionState, form: FormData): Promise<ActionState> {
  const name = clean(form.get('name'));
  if (!name || name.length > LIMITS.familyName)
    return fail(`Please enter a family name (up to ${LIMITS.familyName} characters).`);
  const supabase = await createClient();
  const { error } = await supabase.rpc('create_family', { p_name: name });
  if (error) return fail(friendlyError(error));
  redirect('/family?created=1');
}

export async function joinFamily(_: ActionState, form: FormData): Promise<ActionState> {
  const code = normalizeInviteCode(clean(form.get('code')));
  if (!INVITE_CODE_PATTERN.test(code))
    return fail('Invite codes are 8 letters and numbers, like XMAS2345.');
  const supabase = await createClient();
  const { error } = await supabase.rpc('join_family', { p_code: code });
  if (error) return fail(friendlyError(error));
  redirect('/?joined=1');
}

export async function regenerateInviteCode(_: ActionState): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('regenerate_invite_code');
  if (error) return fail(friendlyError(error));
  revalidatePath('/family');
  return ok('New code created. The old code and link no longer work.');
}

export async function removeMember(_: ActionState, form: FormData): Promise<ActionState> {
  const userId = form.get('userId');
  if (!isUuid(userId)) return fail(friendlyError('not_found'));
  const supabase = await createClient();
  const { error } = await supabase.rpc('remove_member', { p_user_id: userId });
  if (error) return fail(friendlyError(error));
  revalidatePath('/', 'layout');
  return ok('Removed from the family.');
}
