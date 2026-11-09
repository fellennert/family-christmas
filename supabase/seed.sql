-- Demo data for LOCAL development only (`npm run db:reset` runs this).
-- Never run against production.
--
-- Everyone's password is: christmas
--
--   mom@demo.test      Mom      (family owner)
--   dad@demo.test      Dad
--   grandma@demo.test  Grandma
--   sam@demo.test      Sam
--   elf@demo.test      Elf      (a different family: sees nothing above)
--
-- Invite codes: Demo family XMAS2345, North Pole family ELFS2345.

do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('11111111-1111-1111-1111-111111111111'::uuid, 'mom@demo.test',     'Mom'),
      ('22222222-2222-2222-2222-222222222222'::uuid, 'dad@demo.test',     'Dad'),
      ('33333333-3333-3333-3333-333333333333'::uuid, 'grandma@demo.test', 'Grandma'),
      ('44444444-4444-4444-4444-444444444444'::uuid, 'sam@demo.test',     'Sam'),
      ('55555555-5555-5555-5555-555555555555'::uuid, 'elf@demo.test',     'Elf')
    ) as t(id, email, name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.email, extensions.crypt('christmas', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('display_name', u.name), now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now()
    );
  end loop;
end;
$$;

insert into public.families (id, name, invite_code, owner_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'The Demo Family', 'XMAS2345', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'North Pole',      'ELFS2345', '55555555-5555-5555-5555-555555555555');

insert into public.family_members (family_id, user_id, role, joined_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner',  now() - interval '4 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'member', now() - interval '3 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'member', now() - interval '2 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'member', now() - interval '1 day'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 'owner',  now());

-- Gifts. created_by = recipient_id means self-added; otherwise a secret idea.
insert into public.gifts (id, family_id, recipient_id, created_by, title, url, notes, created_at) values
  -- Mom's own list
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'Cozy wool scarf', 'https://www.example.com/scarf', 'Dark green, please', now() - interval '60 minutes'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'Italian cookbook', null, null, now() - interval '59 minutes'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'Garden gloves', 'https://shop.example.org/gloves', 'Size M', now() - interval '58 minutes'),
  -- Secret ideas for Mom
  ('bbbbbbbb-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   'Spa day voucher', null, 'She mentioned this in October', now() - interval '57 minutes'),
  ('bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444',
   'Framed family photo', null, null, now() - interval '56 minutes'),
  -- Dad's own list
  ('bbbbbbbb-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   'Cordless drill', 'https://tools.example.com/drill', null, now() - interval '55 minutes'),
  ('bbbbbbbb-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   'Wool socks', null, 'Size 44', now() - interval '54 minutes'),
  -- Grandma's own list
  ('bbbbbbbb-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
   'Large-print crossword book', null, null, now() - interval '53 minutes'),
  -- Secret idea for Grandma
  ('bbbbbbbb-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Digital photo frame', null, 'Preload with grandkid photos', now() - interval '52 minutes'),
  -- Sam's own list
  ('bbbbbbbb-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001',
   '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444',
   'Wireless headphones', 'https://audio.example.com/headphones', 'Black', now() - interval '51 minutes'),
  ('bbbbbbbb-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001',
   '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444',
   'Board game: anything co-op', null, null, now() - interval '50 minutes'),
  -- Elf (other family): must never be visible to the Demo family
  ('bbbbbbbb-0000-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-000000000002',
   '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555',
   'New bell for hat', null, null, now() - interval '49 minutes');

-- A removed-after-claim example: Dad deleted this after Sam claimed it.
insert into public.gifts (id, family_id, recipient_id, created_by, title, created_at, removed_at, removed_by) values
  ('bbbbbbbb-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   'Fishing hat', now() - interval '48 minutes', now() - interval '5 minutes',
   '22222222-2222-2222-2222-222222222222');

insert into public.claims (gift_id, claimer_id, gift_edited_after_claim) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', false), -- Sam: Mom's scarf
  ('bbbbbbbb-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', false), -- Dad: spa voucher for Mom
  ('bbbbbbbb-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', true),  -- Grandma: Mom's gloves (edited since)
  ('bbbbbbbb-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', false), -- Mom: Dad's drill
  ('bbbbbbbb-0000-0000-0000-000000000010', '33333333-3333-3333-3333-333333333333', false), -- Grandma: Sam's headphones
  ('bbbbbbbb-0000-0000-0000-000000000013', '44444444-4444-4444-4444-444444444444', false); -- Sam: Dad's removed hat
