/**
 * Every database read the pages make lives here, so the privacy-sensitive
 * queries are easy to audit in one place.
 *
 * Rules followed in this file:
 *  - Always the user's own session (createClient), never a service key.
 *  - Explicit column lists (no `select('*')`), so a new column never leaks
 *    by accident.
 *  - The recipient's own list (getMyList) never touches the claims table.
 *    RLS would hide claims anyway, but the page code has no claim data at all.
 */
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Member = {
  id: string;
  displayName: string;
  role: 'owner' | 'member';
  joinedAt: string;
};

export type Viewer = {
  id: string;
  email: string;
  displayName: string;
};

export type FamilyContext = {
  viewer: Viewer;
  family: { id: string; name: string; ownerId: string | null };
  isOwner: boolean;
  /** Active members including the viewer, oldest first. */
  members: Member[];
};

/** The signed-in user, or null. Cached for the duration of one request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? '',
    displayName: profile?.display_name ?? 'Family member',
  };
});

/** The viewer's family id, or null if they have none yet. */
export const getMyFamilyId = cache(async (): Promise<string | null> => {
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('user_id', viewer.id)
    .is('removed_at', null)
    .limit(1)
    .maybeSingle();
  return data?.family_id ?? null;
});

/**
 * Everything the signed-in area needs. Redirects to /login or /onboarding
 * when there is no user or no family.
 */
export const requireFamily = cache(async (): Promise<FamilyContext> => {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  const familyId = await getMyFamilyId();
  if (!familyId) redirect('/onboarding');

  const supabase = await createClient();
  const [{ data: family, error: famErr }, { data: rows, error: memErr }] = await Promise.all([
    // invite_code is deliberately not selected: only owners may read it,
    // through get_invite_code().
    supabase.from('families').select('id, name, owner_id').eq('id', familyId).single(),
    supabase
      .from('family_members')
      .select('user_id, role, joined_at, profiles(display_name)')
      .eq('family_id', familyId)
      .is('removed_at', null)
      .order('joined_at')
      .order('user_id'),
  ]);
  if (famErr || memErr || !family) throw famErr ?? memErr ?? new Error('Family not found');

  const members: Member[] = (rows ?? []).map((r) => ({
    id: r.user_id as string,
    role: r.role as Member['role'],
    joinedAt: r.joined_at as string,
    displayName: profileName(r.profiles),
  }));

  return {
    viewer,
    family: { id: family.id, name: family.name, ownerId: family.owner_id },
    isOwner: members.some((m) => m.id === viewer.id && m.role === 'owner'),
    members,
  };
});

// PostgREST returns an embedded to-one relation as an object (typed loosely
// without generated types).
function profileName(p: unknown): string {
  const obj = Array.isArray(p) ? p[0] : p;
  return (obj as { display_name?: string } | null)?.display_name ?? 'Family member';
}

/** Names of everyone the viewer may see (including removed members). */
async function getNames(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('id, display_name');
  return new Map((data ?? []).map((p) => [p.id as string, p.display_name as string]));
}

// ---------------------------------------------------------------------------
// My list (recipient view): NO claim data, ever.
// ---------------------------------------------------------------------------

export type MyGift = {
  id: string;
  title: string;
  url: string | null;
  notes: string | null;
};

export async function getMyList(): Promise<MyGift[]> {
  const { viewer } = await requireFamily();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('gifts')
    .select('id, title, url, notes')
    .eq('recipient_id', viewer.id)
    .eq('created_by', viewer.id)
    .is('removed_at', null)
    // Order depends only on when the gift was added, never on claims (SPEC §5.2).
    .order('created_at')
    .order('id');
  if (error) throw error;
  return (data ?? []) as MyGift[];
}

// ---------------------------------------------------------------------------
// Someone else's list
// ---------------------------------------------------------------------------

export type PersonGift = {
  id: string;
  title: string;
  url: string | null;
  notes: string | null;
  isSecret: boolean;
  createdBy: string | null;
  createdByName: string;
  removed: boolean;
  removedByName: string | null;
  claim: null | {
    claimerId: string;
    claimerName: string;
    editedAfterClaim: boolean;
  };
};

export async function getPersonList(personId: string) {
  const ctx = await requireFamily();
  // The recipient never sees their own list through this page (SPEC §5.4).
  if (personId === ctx.viewer.id) redirect('/me');
  const person = ctx.members.find((m) => m.id === personId);
  if (!person) notFound();

  const supabase = await createClient();
  const [{ data: gifts, error: gErr }, names] = await Promise.all([
    supabase
      .from('gifts')
      .select('id, title, url, notes, created_by, removed_at, removed_by')
      .eq('recipient_id', personId)
      .order('created_at')
      .order('id'),
    getNames(),
  ]);
  if (gErr) throw gErr;

  const ids = (gifts ?? []).map((g) => g.id as string);
  const { data: claims, error: cErr } = ids.length
    ? await supabase
        .from('claims')
        .select('gift_id, claimer_id, gift_edited_after_claim')
        .in('gift_id', ids)
    : { data: [], error: null };
  if (cErr) throw cErr;
  const claimByGift = new Map((claims ?? []).map((c) => [c.gift_id as string, c]));

  const list: PersonGift[] = [];
  for (const g of gifts ?? []) {
    const c = claimByGift.get(g.id);
    const removed = g.removed_at !== null;
    // A removed gift only matters while someone still has it on their
    // shopping list; otherwise it is clutter.
    if (removed && !c) continue;
    list.push({
      id: g.id,
      title: g.title,
      url: g.url,
      notes: g.notes,
      isSecret: g.created_by !== personId,
      createdBy: g.created_by,
      createdByName: (g.created_by && names.get(g.created_by)) || 'a former member',
      removed,
      removedByName: removed ? (g.removed_by && names.get(g.removed_by)) || 'a former member' : null,
      claim: c
        ? {
            claimerId: c.claimer_id,
            claimerName: names.get(c.claimer_id) ?? 'Family member',
            editedAfterClaim: c.gift_edited_after_claim,
          }
        : null,
    });
  }

  return { ctx, person, gifts: list };
}

// ---------------------------------------------------------------------------
// My shopping list
// ---------------------------------------------------------------------------

export type ShoppingItem = {
  giftId: string;
  title: string;
  url: string | null;
  notes: string | null;
  editedAfterClaim: boolean;
  removed: boolean;
  removedByName: string | null;
};

export type ShoppingGroup = {
  recipientId: string | null;
  recipientName: string;
  items: ShoppingItem[];
};

export async function getShoppingList(): Promise<ShoppingGroup[]> {
  const { viewer, members } = await requireFamily();
  const supabase = await createClient();
  const [{ data, error }, names] = await Promise.all([
    supabase
      .from('claims')
      .select(
        'gift_id, created_at, gift_edited_after_claim, gifts(title, url, notes, recipient_id, removed_at, removed_by)',
      )
      .eq('claimer_id', viewer.id)
      .order('created_at'),
    getNames(),
  ]);
  if (error) throw error;

  const groups = new Map<string, ShoppingGroup>();
  for (const row of data ?? []) {
    const g = (Array.isArray(row.gifts) ? row.gifts[0] : row.gifts) as {
      title: string;
      url: string | null;
      notes: string | null;
      recipient_id: string | null;
      removed_at: string | null;
      removed_by: string | null;
    } | null;
    if (!g) continue;
    const key = g.recipient_id ?? 'former';
    if (!groups.has(key)) {
      groups.set(key, {
        recipientId: g.recipient_id,
        recipientName: (g.recipient_id && names.get(g.recipient_id)) || 'A former family member',
        items: [],
      });
    }
    groups.get(key)!.items.push({
      giftId: row.gift_id,
      title: g.title,
      url: g.url,
      notes: g.notes,
      editedAfterClaim: row.gift_edited_after_claim,
      removed: g.removed_at !== null,
      removedByName: g.removed_at ? (g.removed_by && names.get(g.removed_by)) || 'a former member' : null,
    });
  }

  // Order groups like the family dashboard (by join date), former members last.
  const order = new Map(members.map((m, i) => [m.id, i]));
  return [...groups.values()].sort(
    (a, b) => (order.get(a.recipientId ?? '') ?? 1e9) - (order.get(b.recipientId ?? '') ?? 1e9),
  );
}

/** Owner-only: the invite code (null for members). */
export async function getInviteCode(): Promise<string | null> {
  const { isOwner } = await requireFamily();
  if (!isOwner) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_invite_code');
  if (error) return null;
  return data as string;
}
