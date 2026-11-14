/**
 * SPEC §5 / §10 at the database level: what each user can READ.
 * Items 1, 2, 3, 5 and 7 of §10, plus the "no direct writes" guarantee.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  addGift,
  asUser,
  claim,
  createFamily,
  createUser,
  errorCode,
  everythingVisibleTo,
  rpc,
  type TestFamily,
  type TestUser,
} from './db';

let mom: TestUser, dad: TestUser, kid: TestUser, outsider: TestUser;
let fam: TestFamily;
let momScarf: string, momBook: string, momMug: string, dadIdeaForMom: string;
let kidIdeaForMom: string;

beforeAll(async () => {
  mom = await createUser('Mom');
  dad = await createUser('Dad');
  kid = await createUser('Kid');
  outsider = await createUser('Outsider');
  fam = await createFamily('Privacy Family', mom, dad, kid);
  await createFamily('Other Family', outsider);

  momScarf = await addGift(mom, mom, 'Red scarf', 'https://shop.example.com/scarf', 'Wool');
  momBook = await addGift(mom, mom, 'Cookbook');
  momMug = await addGift(mom, mom, 'Big mug');
  dadIdeaForMom = await addGift(dad, mom, 'Spa voucher');
  kidIdeaForMom = await addGift(kid, mom, 'Photo album');

  await claim(kid, momScarf);
  await claim(dad, dadIdeaForMom);
});

describe('§10.1 recipient cannot see claims on their own gifts', () => {
  it('claims table is empty for the recipient', async () => {
    expect(await asUser(mom.id, 'select * from public.claims')).toEqual([]);
    expect(
      await asUser(mom.id, `select * from public.claims where gift_id = '${momScarf}'`),
    ).toEqual([]);
  });

  it('joining claims onto gifts yields nothing for the recipient', async () => {
    const rows = await asUser<{ id: string; n: number }>(
      mom.id,
      `select g.id, (select count(*) from public.claims c where c.gift_id = g.id)::int as n
         from public.gifts g order by g.id`,
    );
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.n === 0)).toBe(true);
  });

  it('claimed and unclaimed gifts are indistinguishable to the recipient', async () => {
    const [claimed] = await asUser(mom.id, `select * from public.gifts where id = '${momScarf}'`);
    const [unclaimed] = await asUser(mom.id, `select * from public.gifts where id = '${momBook}'`);
    expect(Object.keys(claimed).sort()).toEqual(Object.keys(unclaimed).sort());
  });

  it('recipient trying to claim own gift gets not_found whether or not it is claimed', async () => {
    expect(await errorCode(claim(mom, momScarf))).toBe('not_found'); // claimed
    expect(await errorCode(claim(mom, momBook))).toBe('not_found'); // unclaimed
    expect(await errorCode(claim(mom, '00000000-0000-0000-0000-000000000000'))).toBe('not_found');
  });
});

describe('§10.2 recipient cannot see secret ideas for them', () => {
  it('only self-added gifts are visible, by id or by listing', async () => {
    const ids = (await asUser<{ id: string }>(mom.id, 'select id from public.gifts')).map((r) => r.id);
    expect(ids.sort()).toEqual([momScarf, momBook, momMug].sort());
    expect(await asUser(mom.id, `select * from public.gifts where id = '${dadIdeaForMom}'`)).toEqual([]);
  });

  it('secret ideas are not counted', async () => {
    const [{ n }] = await asUser<{ n: number }>(
      mom.id,
      `select count(*)::int as n from public.gifts where recipient_id = '${mom.id}'`,
    );
    expect(n).toBe(3);
  });

  it('recipient cannot edit or delete a secret idea for them (looks nonexistent)', async () => {
    expect(await errorCode(rpc(mom.id, 'update_gift', `'${dadIdeaForMom}'`, "'x'"))).toBe('not_found');
    expect(await errorCode(rpc(mom.id, 'delete_gift', `'${dadIdeaForMom}'`))).toBe('not_found');
  });
});

describe('§10.3 recipient view is identical before and after claims', () => {
  it('claiming, unclaiming and flagging change nothing the recipient can read', async () => {
    const before = await everythingVisibleTo(mom);

    expect(await claim(dad, momBook)).toBe('claimed');
    const afterClaim = await everythingVisibleTo(mom);
    expect(afterClaim).toEqual(before);

    // Claim on a secret idea, too.
    expect(await claim(dad, kidIdeaForMom)).toBe('claimed');
    expect(await everythingVisibleTo(mom)).toEqual(before);

    await rpc(dad.id, 'unclaim_gift', `'${momBook}'`);
    await rpc(dad.id, 'unclaim_gift', `'${kidIdeaForMom}'`);
    expect(await everythingVisibleTo(mom)).toEqual(before);
  });

  it("recipient's own edit returns the same thing for claimed and unclaimed gifts", async () => {
    const r1 = await rpc(mom.id, 'update_gift', `'${momScarf}'`, "'Red scarf'", "'https://shop.example.com/scarf'", "'Wool, long'");
    const r2 = await rpc(mom.id, 'update_gift', `'${momMug}'`, "'Big mug'", 'null', "'Blue'");
    expect(r1).toEqual(r2);
  });
});

describe('§10.5 non-recipients see claim status and claimer', () => {
  it('dad sees all of mom’s gifts including secret ideas, and who claimed what', async () => {
    const rows = await asUser<{ id: string; title: string; secret: boolean; claimer: string | null }>(
      dad.id,
      `select g.id, g.title, g.created_by <> g.recipient_id as secret, p.display_name as claimer
         from public.gifts g
         left join public.claims c on c.gift_id = g.id
         left join public.profiles p on p.id = c.claimer_id
        where g.recipient_id = '${mom.id}'
        order by g.created_at, g.id`,
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(rows.length).toBe(5);
    expect(byId[momScarf].claimer).toBe('Kid');
    expect(byId[dadIdeaForMom]).toMatchObject({ secret: true, claimer: 'Dad' });
    expect(byId[kidIdeaForMom]).toMatchObject({ secret: true, claimer: null });
    expect(byId[momBook].claimer).toBeNull();
  });

  it('kid sees secret ideas created by others too', async () => {
    const ids = (await asUser<{ id: string }>(kid.id, `select id from public.gifts where recipient_id = '${mom.id}'`)).map((r) => r.id);
    expect(ids).toContain(dadIdeaForMom);
  });
});

describe('§10.7 other families see nothing', () => {
  it('outsider reads only their own family and profile', async () => {
    const v = await everythingVisibleTo(outsider);
    expect(v.gifts).toEqual([]);
    expect(v.claims).toEqual([]);
    expect(v.profiles.map((p) => p.id)).toEqual([outsider.id]);
    expect(v.family_members.map((m) => m.user_id)).toEqual([outsider.id]);
    expect(v.families.map((f) => f.id)).not.toContain(fam.id);
  });

  it('outsider cannot act on gifts or people in another family', async () => {
    expect(await errorCode(claim(outsider, momBook))).toBe('not_found');
    expect(await errorCode(rpc(outsider.id, 'add_gift', `'${fam.id}'`, `'${mom.id}'`, "'x'"))).toBe('not_found');
    expect(await errorCode(rpc(outsider.id, 'update_gift', `'${momBook}'`, "'x'"))).toBe('not_found');
    expect(await errorCode(rpc(outsider.id, 'delete_gift', `'${momBook}'`))).toBe('not_found');
    expect(await errorCode(rpc(outsider.id, 'unclaim_gift', `'${momScarf}'`))).toBe('not_found');
  });

  it('family members see nothing of the outsider', async () => {
    const v = await everythingVisibleTo(dad);
    expect(v.profiles.map((p) => p.id)).not.toContain(outsider.id);
  });
});

describe('locked-down access paths', () => {
  it('anonymous visitors can read nothing', async () => {
    for (const t of ['profiles', 'family_members', 'gifts', 'claims']) {
      expect(await errorCode(asUser(null, `select * from public.${t}`))).toBe('permission');
    }
    expect(await errorCode(rpc(null, 'claim_gift', `'${momBook}'`))).toBe('permission');
    // The keep-alive ping is the only thing anonymous callers may run.
    expect(await rpc(null, 'ping')).toBe('ok');
  });

  it('signed-in users cannot write tables directly (only via functions)', async () => {
    const attempts = [
      `insert into public.claims (gift_id, claimer_id) values ('${momBook}', '${dad.id}') returning id`,
      `update public.claims set claimer_id = '${dad.id}' returning id`,
      `delete from public.claims returning id`,
      `update public.gifts set title = 'hacked' returning id`,
      `insert into public.gifts (family_id, recipient_id, created_by, title) values ('${fam.id}', '${mom.id}', '${dad.id}', 'x') returning id`,
      `update public.profiles set display_name = 'x' returning id`,
      `insert into public.family_members (family_id, user_id) values ('${fam.id}', '${outsider.id}') returning user_id`,
    ];
    for (const q of attempts) expect(await errorCode(asUser(dad.id, q))).toBe('permission');
  });

  it('invite code is owner-only', async () => {
    expect(await errorCode(asUser(dad.id, 'select invite_code from public.families'))).toBe('permission');
    expect(await errorCode(rpc(dad.id, 'get_invite_code', `'${fam.id}'`))).toBe('forbidden');
    expect(await rpc(mom.id, 'get_invite_code', `'${fam.id}'`)).toBe(fam.code);
  });

  it('internal helpers are not callable', async () => {
    expect(await errorCode(asUser(dad.id, 'select private.gen_invite_code() as c'))).toBe('permission');
    expect(await errorCode(asUser(dad.id, `select private.require_owner('${fam.id}') as c`))).toBe('permission');
  });
});
