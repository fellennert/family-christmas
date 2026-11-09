'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { clean, LIMITS } from '@/lib/gifts';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionState } from './types';

export async function updateDisplayName(_: ActionState, form: FormData): Promise<ActionState> {
  const name = clean(form.get('displayName'));
  if (!name || name.length > LIMITS.displayName)
    return fail(`Please enter a name (up to ${LIMITS.displayName} characters).`);
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_display_name', { p_name: name });
  if (error) return fail(friendlyError(error));
  revalidatePath('/', 'layout');
  return ok('Name saved.');
}

/** Permanently deletes the account (see delete_account() in the database). */
export async function deleteAccount(_: ActionState, form: FormData): Promise<ActionState> {
  if (clean(form.get('confirm'))?.toUpperCase() !== 'DELETE')
    return fail('To confirm, type DELETE in the box.');
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_account');
  if (error) return fail(friendlyError(error));
  // The user no longer exists; just clear the session cookies locally.
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/login?deleted=1');
}
