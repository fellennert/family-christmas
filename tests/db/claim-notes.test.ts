/**
 * Shopping-list "Got it" tick and private note: readable and writable by the
 * claimer only. Never by the recipient, never by other family members.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { addGift, asUser, claim, createFamily, createUser, errorCode, lit, rpc, type TestUser } from './db';

let mom: TestUser, dad: TestUser, kid: TestUser, outsider: TestUser;
let scarf: string, book: string;

beforeAll(async () => {
  mom = await createUser('Mom');
  dad = await createUser('Dad');
  kid = await createUser('Kid');
  outsider = await createUser('Outsider');
  await createFamily('Notes Family', mom, dad, kid);
  await createFamily('Other', outsider);
  scarf = await addGift(mom, mom, 'Red scarf');
  book = await addGift(mom, mom, 'Cookbook');
  await claim(kid, scarf);
  await claim(dad, book);
  await rpc(kid.id, 'set_purchased', `'${scarf}'`, 'true');
  await rpc(kid.id, 'set_claim_note', `'${scarf}'`, lit('  Bought at the market, €20  '));
});

const notesSeenBy = (u: TestUser) =>
  asUser<{ gift_id: string; purchased: boolean; note: string | null }>(
    u.id,
    'select gift_id, purchased, note from public.claim_notes order by gift_id',
  );

describe('claim notes', () => {
  it('the claimer sees their own tick and note (trimmed)', async () => {
    expect(await notesSeenBy(kid)).toEqual([{ gift_id: scarf, purchased: true, note: 'Bought at the market, €20' }]);
  });

  it('nobody else sees them: not the recipient, not other members, not outsiders', async () => {
    for (const u of [mom, dad, outsider]) {
      expect((await notesSeenBy(u)).map((n) => n.gift_id)).not.toContain(scarf);
    }
    // The recipient can't even learn a row exists through a join.
    const rows = await asUser<{ n: number }>(
      mom.id,
      `select count(*)::int as n from public.gifts g join public.claim_notes n on n.gift_id = g.id`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('only the claimer can set them; everyone else gets not_found', async () => {
    expect(await errorCode(rpc(dad.id, 'set_purchased', `'${scarf}'`, 'true'))).toBe('not_found');
    expect(await errorCode(rpc(mom.id, 'set_purchased', `'${scarf}'`, 'true'))).toBe('not_found');
    expect(await errorCode(rpc(mom.id, 'set_claim_note', `'${scarf}'`, lit('peek')))).toBe('not_found');
    expect(await errorCode(rpc(outsider.id, 'set_claim_note', `'${scarf}'`, lit('x')))).toBe('not_found');
    // Recipient's answer is the same for a claimed gift and an unclaimed one.
    const unclaimed = await addGift(mom, mom, 'Socks');
    expect(await errorCode(rpc(mom.id, 'set_purchased', `'${unclaimed}'`, 'true'))).toBe('not_found');
  });

  it('cannot be written directly', async () => {
    expect(
      await errorCode(asUser(kid.id, `update public.claim_notes set note = 'x' where gift_id = '${scarf}' returning gift_id`)),
    ).toBe('permission');
  });

  it('empty note clears it; untick works; long notes are rejected', async () => {
    await rpc(dad.id, 'set_claim_note', `'${book}'`, lit('Ask Kid about the edition'));
    await rpc(dad.id, 'set_claim_note', `'${book}'`, lit('   '));
    await rpc(dad.id, 'set_purchased', `'${book}'`, 'true');
    await rpc(dad.id, 'set_purchased', `'${book}'`, 'false');
    expect(await notesSeenBy(dad)).toEqual([{ gift_id: book, purchased: false, note: null }]);
    expect(await errorCode(rpc(dad.id, 'set_claim_note', `'${book}'`, lit('x'.repeat(501))))).toBe('invalid_notes');
  });

  it('unclaiming deletes the tick and note', async () => {
    const mug = await addGift(mom, mom, 'Mug');
    await claim(kid, mug);
    await rpc(kid.id, 'set_claim_note', `'${mug}'`, lit('blue one'));
    await rpc(kid.id, 'unclaim_gift', `'${mug}'`);
    expect((await notesSeenBy(kid)).map((n) => n.gift_id)).not.toContain(mug);
    // Whoever claims it next starts fresh.
    await claim(dad, mug);
    expect((await notesSeenBy(dad)).map((n) => n.gift_id)).not.toContain(mug);
  });
});
