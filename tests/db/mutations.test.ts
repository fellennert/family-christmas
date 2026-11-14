/**
 * SPEC §5.3 / §5.4 / §10 items 4, 6, 8 at the database level, plus families,
 * input handling and account deletion.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addGift,
  asAdmin,
  asUser,
  claim,
  createFamily,
  createUser,
  errorCode,
  everythingVisibleTo,
  lit,
  rpc,
  type TestFamily,
  type TestUser,
} from './db';

let mom: TestUser, dad: TestUser, kid: TestUser, gran: TestUser;
let fam: TestFamily;

beforeEach(async () => {
  mom = await createUser('Mom');
  dad = await createUser('Dad');
  kid = await createUser('Kid');
  gran = await createUser('Gran');
  fam = await createFamily('Mutation Family', mom, dad, kid, gran);
});

const gift = async (id: string) =>
  (await asAdmin<{ id: string; removed_at: string | null; removed_by: string | null; recipient_id: string | null }>(
    `select * from public.gifts where id = '${id}'`,
  ))[0];

const shoppingList = (u: TestUser) =>
  asUser<{ gift_id: string; title: string; removed_at: string | null; removed_by_name: string | null; edited: boolean }>(
    u.id,
    `select c.gift_id, g.title, g.removed_at, p.display_name as removed_by_name,
            c.gift_edited_after_claim as edited
       from public.claims c
       join public.gifts g on g.id = c.gift_id
       left join public.profiles p on p.id = g.removed_by
      where c.claimer_id = '${u.id}'
      order by g.created_at, g.id`,
  );

describe('§10.4 / §5.3 deleting claimed gifts', () => {
  it('recipient gets the same response for claimed and unclaimed; claimer sees "removed"', async () => {
    const claimed = await addGift(mom, mom, 'Slippers');
    const unclaimed = await addGift(mom, mom, 'Candle');
    await claim(kid, claimed);

    const r1 = await rpc(mom.id, 'delete_gift', `'${claimed}'`);
    const r2 = await rpc(mom.id, 'delete_gift', `'${unclaimed}'`);
    expect(r1).toEqual(r2);

    // Both gone for the recipient, and deleting again fails identically.
    expect(await asUser(mom.id, 'select * from public.gifts')).toEqual([]);
    expect(await errorCode(rpc(mom.id, 'delete_gift', `'${claimed}'`))).toBe('not_found');
    expect(await errorCode(rpc(mom.id, 'delete_gift', `'${unclaimed}'`))).toBe('not_found');

    // Unclaimed: hard-deleted. Claimed: soft-deleted.
    expect(await gift(unclaimed)).toBeUndefined();
    expect((await gift(claimed)).removed_by).toBe(mom.id);

    // Claimer's shopping list shows it flagged with who removed it.
    const list = await shoppingList(kid);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ gift_id: claimed, removed_by_name: 'Mom' });
    expect(list[0].removed_at).not.toBeNull();

    // Other members see it as removed too; nobody can claim it any more.
    const [seenByDad] = await asUser<{ removed_at: string | null }>(dad.id, `select removed_at from public.gifts where id = '${claimed}'`);
    expect(seenByDad.removed_at).not.toBeNull();
    expect(await errorCode(claim(dad, claimed))).toBe('not_found');

    // Dismissing deletes the claim and the gift.
    await rpc(kid.id, 'unclaim_gift', `'${claimed}'`);
    expect(await gift(claimed)).toBeUndefined();
    expect(await shoppingList(kid)).toEqual([]);
  });

  it('secret idea deleted by its creator: soft if someone else claimed it, hard otherwise', async () => {
    const claimedByOther = await addGift(dad, mom, 'Telescope');
    const claimedBySelf = await addGift(dad, mom, 'Gloves');
    await claim(kid, claimedByOther);
    await claim(dad, claimedBySelf);

    await rpc(dad.id, 'delete_gift', `'${claimedByOther}'`);
    await rpc(dad.id, 'delete_gift', `'${claimedBySelf}'`);

    expect((await gift(claimedByOther)).removed_at).not.toBeNull();
    expect(await gift(claimedBySelf)).toBeUndefined();
    expect((await shoppingList(kid))[0]).toMatchObject({ gift_id: claimedByOther, removed_by_name: 'Dad' });
  });

  it('recipient never sees a soft-deleted gift, so their view is the same as for a hard delete', async () => {
    const a = await addGift(mom, mom, 'A');
    const b = await addGift(mom, mom, 'B');
    await claim(kid, a);
    await rpc(mom.id, 'delete_gift', `'${a}'`);
    await rpc(mom.id, 'delete_gift', `'${b}'`);
    const v = await everythingVisibleTo(mom);
    expect(v.gifts).toEqual([]);
    expect(v.claims).toEqual([]);
  });
});

describe('§5.3 editing claimed gifts', () => {
  it('flags the claim "edited after you claimed it" only on a real change by the creator', async () => {
    const g = await addGift(mom, mom, 'Sweater', null, 'Size M');
    await claim(kid, g);

    await rpc(mom.id, 'update_gift', `'${g}'`, "'Sweater'", 'null', "'Size M'"); // no-op
    expect((await shoppingList(kid))[0].edited).toBe(false);

    await rpc(mom.id, 'update_gift', `'${g}'`, "'Sweater'", 'null', "'Size L'");
    expect((await shoppingList(kid))[0].edited).toBe(true);
  });

  it('does not flag when the creator edits a secret idea they claimed themselves', async () => {
    const g = await addGift(dad, mom, 'Kite');
    await claim(dad, g);
    await rpc(dad.id, 'update_gift', `'${g}'`, "'Red kite'");
    expect((await shoppingList(dad))[0].edited).toBe(false);
  });
});

describe('§10.6 simultaneous claims', () => {
  it('ten users racing for one gift: exactly one wins', async () => {
    const racers = [dad, kid, gran];
    for (let i = 0; i < 7; i++) {
      const u = await createUser(`Cousin ${i}`);
      await rpc(u.id, 'join_family', lit(fam.code));
      racers.push(u);
    }
    const g = await addGift(mom, mom, 'Last one');
    const results = await Promise.all(racers.map((u) => claim(u, g)));
    expect(results.filter((r) => r === 'claimed')).toHaveLength(1);
    expect(results.filter((r) => r === 'already_claimed')).toHaveLength(9);
    const [{ n }] = await asAdmin<{ n: number }>(`select count(*)::int as n from public.claims where gift_id = '${g}'`);
    expect(n).toBe(1);
  });

  it('a claim that commits while another is in flight: the second gets already_claimed', async () => {
    const g = await addGift(mom, mom, 'Race car');
    // Dad's transaction claims, then holds the transaction open for 1s.
    const slow = asUser(dad.id, `select public.claim_gift('${g}') as r`, { after: 'select pg_sleep(1) \\g /dev/null' });
    await new Promise((r) => setTimeout(r, 300));
    // Kid's claim blocks on the unique index until Dad commits.
    const fast = claim(kid, g);
    const [[{ r: dadResult }], kidResult] = await Promise.all([slow as Promise<{ r: string }[]>, fast]);
    expect(dadResult).toBe('claimed');
    expect(kidResult).toBe('already_claimed');
  });

  it('claiming your own claim again is a friendly no-op', async () => {
    const g = await addGift(mom, mom, 'Tea');
    expect(await claim(dad, g)).toBe('claimed');
    expect(await claim(dad, g)).toBe('already_yours');
  });
});

describe('§10.8 / §5.4 only creators edit/delete; only claimers unclaim', () => {
  it('non-creators cannot edit or delete', async () => {
    const self = await addGift(mom, mom, 'Mine');
    const idea = await addGift(dad, mom, 'Dad idea');
    expect(await errorCode(rpc(dad.id, 'update_gift', `'${self}'`, "'x'"))).toBe('not_found');
    expect(await errorCode(rpc(dad.id, 'delete_gift', `'${self}'`))).toBe('not_found');
    expect(await errorCode(rpc(kid.id, 'update_gift', `'${idea}'`, "'x'"))).toBe('not_found');
    expect(await errorCode(rpc(kid.id, 'delete_gift', `'${idea}'`))).toBe('not_found');
    expect((await gift(self))).toBeDefined();
    expect((await gift(idea))).toBeDefined();
  });

  it('only the claimer can unclaim', async () => {
    const g = await addGift(mom, mom, 'Book');
    await claim(dad, g);
    expect(await errorCode(rpc(kid.id, 'unclaim_gift', `'${g}'`))).toBe('not_found');
    expect(await errorCode(rpc(mom.id, 'unclaim_gift', `'${g}'`))).toBe('not_found');
    await rpc(dad.id, 'unclaim_gift', `'${g}'`);
    expect(await claim(kid, g)).toBe('claimed');
  });
});

describe('§7 input handling', () => {
  it('trims and normalizes', async () => {
    const g = await addGift(mom, mom, '  Scarf \n', '  https://example.com/x  ', '   ');
    expect(await gift(g)).toMatchObject({ title: 'Scarf', url: 'https://example.com/x', notes: null });
  });

  it('rejects bad input', async () => {
    const add = (t: string | null, u: string | null = null, n: string | null = null) =>
      errorCode(addGift(mom, mom, t as string, u, n));
    expect(await add('   ')).toBe('invalid_title');
    expect(await add('x'.repeat(201))).toBe('invalid_title');
    expect(await add('ok', 'javascript:alert(1)')).toBe('invalid_url');
    expect(await add('ok', 'ftp://example.com')).toBe('invalid_url');
    expect(await add('ok', 'https://')).toBe('invalid_url');
    expect(await add('ok', 'https://exa mple.com')).toBe('invalid_url');
    expect(await add('ok', null, 'x'.repeat(1001))).toBe('invalid_notes');
    expect(await add('x'.repeat(200), 'HTTP://EXAMPLE.COM', 'x'.repeat(1000))).toBe('(no error)');
  });

  it('display name', async () => {
    await rpc(kid.id, 'update_display_name', lit('  Sam  '));
    expect((await asUser<{ display_name: string }>(dad.id, `select display_name from public.profiles where id = '${kid.id}'`))[0].display_name).toBe('Sam');
    expect(await errorCode(rpc(kid.id, 'update_display_name', lit(' ')))).toBe('invalid_name');
    expect(await errorCode(rpc(kid.id, 'update_display_name', lit('x'.repeat(51))))).toBe('invalid_name');
  });

  it('cannot add gifts for someone outside the family', async () => {
    const stranger = await createUser('Stranger');
    expect(await errorCode(addGift(mom, stranger, 'x'))).toBe('not_found');
  });
});

describe('§4.2 families and invite codes', () => {
  it('codes use the unambiguous alphabet and regenerate', async () => {
    expect(fam.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const fresh = await rpc<string>(mom.id, 'regenerate_invite_code', `'${fam.id}'`);
    expect(fresh).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(fresh).not.toBe(fam.code);
    const newbie = await createUser('Newbie');
    expect(await errorCode(rpc(newbie.id, 'join_family', lit(fam.code)))).toBe('invalid_code');
    expect(await rpc(newbie.id, 'join_family', lit(` ${fresh.toLowerCase()} `))).toBe(fam.id);
    expect(await rpc(newbie.id, 'join_family', lit(fresh))).toBe(fam.id); // idempotent
  });

  it('a person can be in several families; each keeps its own lists', async () => {
    const second = await rpc<string>(dad.id, 'create_family', lit('Second'));
    const otherOwner = await createUser('Other owner');
    const other = await createFamily('Other', otherOwner);
    expect(await rpc(dad.id, 'join_family', lit(other.code))).toBe(other.id);
    expect(await rpc(dad.id, 'join_family', lit(other.code))).toBe(other.id); // idempotent

    // Dad owns "Second" but is a plain member of "Other" and of Mom's family.
    expect(await rpc(dad.id, 'get_invite_code', `'${second}'`)).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(await errorCode(rpc(dad.id, 'get_invite_code', `'${other.id}'`))).toBe('forbidden');

    // A gift for Dad in "Other" stays in "Other": Mom's family never sees it.
    const inOther = await rpc<string>(otherOwner.id, 'add_gift', `'${other.id}'`, `'${dad.id}'`, lit('Other-family gift'));
    await claim(otherOwner, inOther);
    expect((await everythingVisibleTo(mom)).gifts.map((g) => g.id)).not.toContain(inOther);
    // ...and Dad, its recipient, still can't see the claim.
    expect((await everythingVisibleTo(dad)).claims).toEqual([]);

    // Mom can't put a gift into a family she isn't in, even for a shared person.
    expect(await errorCode(rpc(mom.id, 'add_gift', `'${other.id}'`, `'${dad.id}'`, lit('x')))).toBe('not_found');
    // Nor can Other's owner add a gift for Mom (not in their family).
    expect(await errorCode(rpc(otherOwner.id, 'add_gift', `'${other.id}'`, `'${mom.id}'`, lit('x')))).toBe('not_found');
  });

  it('removing someone from one family leaves their other families alone', async () => {
    const otherOwner = await createUser('Other owner');
    const other = await createFamily('Other', otherOwner, kid);
    const kidsOwnInOther = await rpc<string>(kid.id, 'add_gift', `'${other.id}'`, `'${kid.id}'`, lit('Kid wish (other)'));
    await rpc(mom.id, 'remove_member', `'${fam.id}'`, `'${kid.id}'`);
    expect((await gift(kidsOwnInOther)).removed_at).toBeNull();
    expect([...new Set((await everythingVisibleTo(kid)).family_members.map((m) => m.family_id))]).toEqual([other.id]);
    // Mom can't remove people from a family she doesn't own.
    expect(await errorCode(rpc(mom.id, 'remove_member', `'${other.id}'`, `'${kid.id}'`))).toBe('forbidden');
  });

  it('only the owner manages members and codes', async () => {
    expect(await errorCode(rpc(dad.id, 'regenerate_invite_code', `'${fam.id}'`))).toBe('forbidden');
    expect(await errorCode(rpc(dad.id, 'remove_member', `'${fam.id}'`, `'${kid.id}'`))).toBe('forbidden');
    expect(await errorCode(rpc(mom.id, 'remove_member', `'${fam.id}'`, `'${mom.id}'`))).toBe('cannot_remove_self');
  });

  it('removing a member deletes their claims and hides their gifts', async () => {
    const forMom = await addGift(mom, mom, 'Mom gift');
    const kidsOwn = await addGift(kid, kid, 'Kid gift');
    const kidsIdea = await addGift(kid, dad, 'Kid idea for Dad');
    await claim(kid, forMom);
    await claim(gran, kidsOwn);

    await rpc(mom.id, 'remove_member', `'${fam.id}'`, `'${kid.id}'`);

    // Kid's claim is gone, so Mom's gift is claimable again.
    expect(await claim(dad, forMom)).toBe('claimed');
    // Kid's gifts are hidden (soft-deleted); Gran is told about the one she claimed.
    expect((await gift(kidsOwn)).removed_at).not.toBeNull();
    expect((await gift(kidsIdea)).removed_at).not.toBeNull();
    expect((await shoppingList(gran))[0]).toMatchObject({ gift_id: kidsOwn, removed_by_name: 'Kid' });
    // Kid now sees nothing of the family.
    const v = await everythingVisibleTo(kid);
    expect(v.gifts).toEqual([]);
    expect(v.family_members).toEqual([]);
    expect(v.profiles.map((p) => p.id)).toEqual([kid.id]);
    expect(await errorCode(addGift(kid, mom, 'x'))).toBe('not_found');
  });
});

describe('account deletion', () => {
  it('removes the account; gifts others claimed survive as removed', async () => {
    const dadsOwnClaimed = await addGift(dad, dad, 'Drill');
    const dadsOwnUnclaimed = await addGift(dad, dad, 'Socks');
    const ideaForDad = await addGift(mom, dad, 'Hat');
    const dadsClaim = await addGift(mom, mom, 'Perfume');
    await claim(kid, dadsOwnClaimed);
    await claim(gran, ideaForDad);
    await claim(dad, dadsClaim);

    await rpc(dad.id, 'delete_account');

    expect(await asAdmin(`select id from auth.users where id = '${dad.id}'`)).toEqual([]);
    expect(await asAdmin(`select id from public.profiles where id = '${dad.id}'`)).toEqual([]);
    expect(await gift(dadsOwnUnclaimed)).toBeUndefined();
    expect((await gift(dadsOwnClaimed)).removed_at).not.toBeNull();
    expect((await gift(ideaForDad)).removed_at).not.toBeNull();
    expect((await shoppingList(kid))[0].gift_id).toBe(dadsOwnClaimed);
    expect((await shoppingList(gran))[0].gift_id).toBe(ideaForDad);
    // Dad's claim is gone, so Mom's gift is free again.
    expect(await claim(kid, dadsClaim)).toBe('claimed');
  });

  it('owner deleting their account hands the family to the longest-standing member', async () => {
    await rpc(mom.id, 'delete_account');
    expect(await rpc(dad.id, 'get_invite_code', `'${fam.id}'`)).toBe(fam.code);
    const [f] = await asUser<{ owner_id: string }>(dad.id, 'select owner_id from public.families');
    expect(f.owner_id).toBe(dad.id);
  });

  it('last member deleting their account deletes the family', async () => {
    const solo = await createUser('Solo');
    const f = await createFamily('Solo family', solo);
    await rpc(solo.id, 'delete_account');
    expect(await asAdmin(`select id from public.families where id = '${f.id}'`)).toEqual([]);
  });
});
