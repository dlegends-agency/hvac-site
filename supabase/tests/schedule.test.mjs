// Loads supabase/schema-schedule.sql into in-memory Postgres (PGlite) and checks who may read and change the scrape schedules.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/schedule.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email varchar(255));
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.admin_users (user_id uuid primary key references auth.users (id));
create function public.is_admin() returns boolean language sql stable security definer as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()) $$;
grant usage on schema auth, public to authenticated, anon;
grant execute on function public.is_admin() to authenticated;
`);
await db.exec(read("schema-schedule.sql"));
await db.exec(read("schema-schedule.sql")); // safe to run twice

const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (user, fn) => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
  await db.exec("set role authenticated");
  try { return await fn(); } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub','',false)"); }
};
const uid = async (email) => (await q("insert into auth.users (email) values ($1) returning id", [email]))[0].id;
const admin = await uid("admin@x.com");
await q("insert into public.admin_users (user_id) values ($1)", [admin]);
const owner = await uid("owner@x.com");

const rows = await q("select source, frequency, hour, minute from public.scrape_schedules order by source");
assert.deepEqual(rows, [{ source: "bids", frequency: "daily", hour: 8, minute: 30 }, { source: "permits", frequency: "daily", hour: 8, minute: 0 }], "the old fixed times are the defaults, and re-running does not duplicate them");

assert.equal((await as(admin, () => db.query("select * from public.scrape_schedules"))).rows.length, 2, "an admin reads the schedules");
assert.equal((await as(owner, () => db.query("select * from public.scrape_schedules"))).rows.length, 0, "other users see nothing");
await db.exec("set role anon");
await assert.rejects(() => db.query("select * from public.scrape_schedules"), /permission denied/, "the public has no access");
await db.exec("reset role");

await as(admin, () => db.query("update public.scrape_schedules set frequency='weekly', weekday=1, hour=9, minute=30, run_requested=true where source='permits'"));
assert.deepEqual((await q("select frequency, weekday, hour, minute, run_requested from public.scrape_schedules where source='permits'"))[0], { frequency: "weekly", weekday: 1, hour: 9, minute: 30, run_requested: true });
await as(admin, () => db.query("update public.scrape_schedules set frequency='hourly', every_hours=6 where source='bids'"));
assert.equal((await q("select every_hours e from public.scrape_schedules where source='bids'"))[0].e, 6);

assert.equal((await as(owner, () => db.query("update public.scrape_schedules set frequency='off'"))).rowCount, 0, "a non-admin changes nothing");
await assert.rejects(() => as(admin, () => db.query("update public.scrape_schedules set last_run_at = now()")), /permission denied/, "the run history is written by the scrape jobs, not the browser");
await assert.rejects(() => as(admin, () => db.query("delete from public.scrape_schedules")), /permission denied/);
await assert.rejects(() => as(admin, () => db.query("insert into public.scrape_schedules (source) values ('other')")), /permission denied/);
await assert.rejects(() => q("update public.scrape_schedules set frequency = 'monthly'"), /check/, "only the four frequencies exist");
await assert.rejects(() => q("update public.scrape_schedules set minute = 15"), /check/, "start times are on the hour or half hour");
await assert.rejects(() => q("update public.scrape_schedules set every_hours = 0"), /check/);

await q("insert into public.scrape_runs (source, status) values ('permits', 'running')");
assert.equal((await as(admin, () => db.query("select * from public.scrape_runs"))).rows.length, 1, "an admin reads the run log");
assert.equal((await as(owner, () => db.query("select * from public.scrape_runs"))).rows.length, 0, "other users see no runs");
await assert.rejects(() => as(admin, () => db.query("insert into public.scrape_runs (source) values ('bids')")), /permission denied/, "only the scrape jobs write runs");
await assert.rejects(() => q("insert into public.scrape_runs (source, status) values ('permits', 'lost')"), /check/, "only four run states exist");

console.log("schedule SQL: all checks passed");
