'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CURRENT_FAMILY_COOKIE } from '@/lib/data';
import { friendlyError } from '@/lib/errors';
import { clean, LIMITS } from '@/lib/gifts';
import { INVITE_CODE_PATTERN, isUuid, normalizeInviteCode } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionState } from './types';

/** Remember which family the person is looking at (a preference only; see lib/data.ts). */
async function rememberFamily(familyId: string) {
  (await cookies()).set(CURRENT_FAMILY_COOKIE, familyId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 400,
  });
}

/** Header family switcher. */
export async function switchFamily(form: FormData): Promise<void> {
  const familyId = form.get('familyId');
  if (isUuid(familyId)) await rememberFamily(familyId);
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function createFamily(_: ActionState, form: FormData): Promise<ActionState> {
  const name = clean(form.get('name'));
  if (!name || name.length > LIMITS.familyName)
    return fail(`Please enter a family name (up to ${LIMITS.familyName} characters).`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_family', { p_name: name });
  if (error) return fail(friendlyError(error));
  await rememberFamily(data as string);
  redirect('/family?created=1');
}

export async function joinFamily(_: ActionState, form: FormData): Promise<ActionState> {
  const code = normalizeInviteCode(clean(form.get('code')));
  if (!INVITE_CODE_PATTERN.test(code))
    return fail('Invite codes are 8 letters and numbers, like XMAS2345.');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('join_family', { p_code: code });
  if (error) return fail(friendlyError(error));
  await rememberFamily(data as string);
  redirect('/?joined=1');
}

export async function regenerateInviteCode(_: ActionState, form: FormData): Promise<ActionState> {
  const familyId = form.get('familyId');
  if (!isUuid(familyId)) return fail(friendlyError('not_found'));
  const supabase = await createClient();
  const { error } = await supabase.rpc('regenerate_invite_code', { p_family_id: familyId });
  if (error) return fail(friendlyError(error));
  revalidatePath('/family');
  return ok('New code created. The old code and link no longer work.');
}

export async function removeMember(_: ActionState, form: FormData): Promise<ActionState> {
  const userId = form.get('userId');
  const familyId = form.get('familyId');
  if (!isUuid(userId) || !isUuid(familyId)) return fail(friendlyError('not_found'));
  const supabase = await createClient();
  const { error } = await supabase.rpc('remove_member', { p_family_id: familyId, p_user_id: userId });
  if (error) return fail(friendlyError(error));
  revalidatePath('/', 'layout');
  return ok('Removed from the family.');
}
