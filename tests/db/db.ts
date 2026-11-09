/**
 * Test harness for database-level privacy tests.
 *
 * `asUser(uid, sql)` runs a query exactly the way Supabase's API (PostgREST)
 * runs every request: inside a transaction, as the `authenticated` role, with
 * the user's id in `request.jwt.claims`. RLS policies and function permission
 * checks therefore behave exactly as they do for the real app.
 *
 * Uses the `psql` client (no extra npm dependency). Each call is its own
 * connection, so concurrent calls really are concurrent sessions.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const DB_URL =
  process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export class DbError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** SQL string literal. */
export const lit = (v: string | null | undefined): string =>
  v === null || v === undefined ? 'null' : `'${v.replace(/'/g, "''")}'`;

function runPsql(sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn('psql', [DB_URL, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) return resolve(out);
      const m = /ERROR:\s+(.+)/.exec(err);
      const message = m ? m[1].trim() : err.trim();
      reject(new DbError(message.split(/\s/)[0], message));
    });
    p.stdin.end(sql);
  });
}

function lastLineJson<T>(out: string): T {
  const lines = out.split('\n').filter((l) => l.trim() !== '');
  return JSON.parse(lines[lines.length - 1]) as T;
}

// A top-level CTE so INSERT/UPDATE/DELETE ... RETURNING work too.
const wrapRows = (query: string) =>
  `with t as (${query}) select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from t;`;

/** Run `query` as superuser (test setup / assertions about hidden state only). */
export async function asAdmin<T = Record<string, unknown>>(query: string): Promise<T[]> {
  return lastLineJson<T[]>(await runPsql(wrapRows(query)));
}

/**
 * Run `query` as a signed-in user and return its rows. `before`/`after` are
 * optional statements run inside the same transaction (used for the
 * concurrency tests).
 */
export async function asUser<T = Record<string, unknown>>(
  uid: string | null,
  query: string,
  opts: { before?: string; after?: string } = {},
): Promise<T[]> {
  const role = uid ? 'authenticated' : 'anon';
  const claims = JSON.stringify(uid ? { sub: uid, role } : { role });
  const sql = [
    'begin;',
    `set local role ${role};`,
    `select set_config('request.jwt.claims', ${lit(claims)}, true) \\g /dev/null`,
    opts.before ?? '',
    wrapRows(query),
    opts.after ?? '',
    'commit;',
  ].join('\n');
  return lastLineJson<T[]>(await runPsql(sql));
}

/** Call a public function as `uid` and return its scalar result. */
export async function rpc<T = unknown>(
  uid: string | null,
  fn: string,
  ...args: string[]
): Promise<T> {
  const rows = await asUser<{ r: T }>(uid, `select public.${fn}(${args.join(', ')}) as r`);
  return rows[0].r;
}

/** Expect a promise to fail with a given error code; returns the error. */
export async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof DbError) return e.code;
    throw e;
  }
  return '(no error)';
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export interface TestUser {
  id: string;
  name: string;
}

export async function createUser(name: string): Promise<TestUser> {
  const id = randomUUID();
  const meta = JSON.stringify({ display_name: name });
  await asAdmin(
    `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
       values ('${id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               '${id}@test.local', ${lit(meta)}::jsonb, now(), now())
     returning id`,
  );
  return { id, name };
}

export interface TestFamily {
  id: string;
  code: string;
  owner: TestUser;
  members: TestUser[];
}

/** Owner creates a family; everyone else joins with the invite code. */
export async function createFamily(
  name: string,
  owner: TestUser,
  ...members: TestUser[]
): Promise<TestFamily> {
  const id = await rpc<string>(owner.id, 'create_family', lit(name));
  const code = await rpc<string>(owner.id, 'get_invite_code');
  for (const m of members) await rpc(m.id, 'join_family', lit(code));
  return { id, code, owner, members };
}

export const addGift = (
  by: TestUser,
  recipient: TestUser,
  title: string,
  url: string | null = null,
  notes: string | null = null,
) =>
  rpc<string>(by.id, 'add_gift', `'${recipient.id}'`, lit(title), lit(url), lit(notes));

export const claim = (by: TestUser, giftId: string) =>
  rpc<string>(by.id, 'claim_gift', `'${giftId}'`);

/** Everything a user can read from every table, in a stable order. */
export async function everythingVisibleTo(u: TestUser) {
  return {
    profiles: await asUser(u.id, 'select * from public.profiles order by id'),
    families: await asUser(u.id, 'select id, name, owner_id, created_at from public.families order by id'),
    family_members: await asUser(u.id, 'select * from public.family_members order by family_id, user_id'),
    gifts: await asUser(u.id, 'select * from public.gifts order by created_at, id'),
    claims: await asUser(u.id, 'select * from public.claims order by id'),
  };
}
