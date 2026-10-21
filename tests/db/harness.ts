import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Minimal stand-in for what Supabase provides before our migrations run:
// API roles, auth.users, auth.uid(), and Supabase's default grants on public.
const SUPABASE_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    email_confirmed_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

// Storage and pg_cron exist only on Supabase; they are covered by review, not these tests.
const SKIPPED = /_(storage|cron)\.sql$/;

export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  const dir = join(__dirname, "..", "..", "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql") && !SKIPPED.test(f)).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  return db;
}

type Executor = Pick<Transaction, "query" | "exec">;

/** Runs fn as an API role. userId null = anon; a uuid = that signed-in user. */
export async function as<T>(db: PGlite, userId: string | null, fn: (tx: Executor) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    return fn(tx);
  });
}

export async function createUser(db: PGlite, email: string, confirmed = true) {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), $1, $2) returning id",
    [email, confirmed ? new Date().toISOString() : null],
  );
  return rows[0].id;
}

/** Expects the promise to reject with an error whose message contains `text`. */
export async function rejects(promise: Promise<unknown>, text: string | RegExp) {
  try {
    await promise;
  } catch (e) {
    const message = (e as Error).message;
    if (typeof text === "string" ? message.includes(text) : text.test(message)) return;
    throw new Error(`Expected error matching ${text}, got: ${message}`);
  }
  throw new Error(`Expected error matching ${text}, but it succeeded`);
}
