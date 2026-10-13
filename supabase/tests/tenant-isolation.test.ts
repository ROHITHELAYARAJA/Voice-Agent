import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon,service_role;
    create schema realtime; create table realtime.messages(id uuid default gen_random_uuid(),extension text,payload jsonb,topic text);
    alter table realtime.messages enable row level security;grant usage on schema realtime to authenticated;grant select on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
    create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$ insert into realtime.messages(extension,payload,topic) values('broadcast',payload,topic) $$;`);
  await db.exec(
    await readFile(
      new URL("../migrations/202610120001_calmloop.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL("../migrations/202610130001_voice_wellness.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query("insert into auth.users(id) values($1),($2)", [alice, bob]);
});
afterAll(async () => db.close());
async function asUser<T>(id: string, work: () => Promise<T>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
  try {
    return await work();
  } finally {
    await db.exec("reset role");
  }
}
describe("Postgres tenant policies and queue", () => {
  it("automatically provisions only a customer role", async () => {
    const roles = await db.query<{ role: string }>(
      "select role from public.account_roles where user_id=$1",
      [alice],
    );
    expect(roles.rows).toEqual([{ role: "customer" }]);
  });
  it("allows server-saved moods but rejects manual input and other tenant access", async () => {
    await db.query(
      "insert into public.mood_entries(user_id,entry_date,score,source) values($1,'2026-10-12',7,'manual')",
      [alice],
    );
    await asUser(alice, async () => {
      await expect(
        db.query(
          "insert into public.mood_entries(user_id,entry_date,score,source) values($1,'2026-10-14',8,'manual')",
          [alice],
        ),
      ).rejects.toThrow();
      expect(
        (await db.query("select * from public.mood_entries")).rows,
      ).toHaveLength(1);
    });
    await asUser(bob, async () => {
      expect(
        (await db.query("select * from public.mood_entries")).rows,
      ).toHaveLength(0);
      await expect(
        db.query(
          "insert into public.mood_entries(user_id,entry_date,score,source) values($1,'2026-10-13',2,'manual')",
          [alice],
        ),
      ).rejects.toThrow();
    });
  });
  it("blocks fabricated voice data and client role escalation", async () => {
    await asUser(alice, async () => {
      await expect(
        db.query(
          "insert into public.mood_entries(user_id,entry_date,score,source) values($1,'2026-10-13',5,'voice')",
          [alice],
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          "insert into public.journal_entries(user_id,entry_date,title,reflection,source) values($1,'2026-10-13','Fake','Fake','voice')",
          [alice],
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          "insert into public.account_roles(user_id,role) values($1,'admin')",
          [alice],
        ),
      ).rejects.toThrow();
      await expect(
        db.query("select * from private.encrypted_credentials"),
      ).rejects.toThrow();
      await expect(
        db.query("select * from private.call_transcripts"),
      ).rejects.toThrow();
    });
  });
  it("rejects browser editing of voice summaries and prevents another owner's deletion", async () => {
    const journal = (
      await db.query<{ id: string }>(
        "insert into public.journal_entries(user_id,entry_date,title,reflection,source) values($1,'2026-10-12','My day','My own words','voice') returning id",
        [alice],
      )
    ).rows[0]!;
    await asUser(alice, async () => {
      await expect(
        db.query(
          "update public.journal_entries set user_edit='A correction' where id=$1",
          [journal.id],
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          "update public.journal_entries set reflection='Invented' where id=$1",
          [journal.id],
        ),
      ).rejects.toThrow();
    });
    await asUser(bob, async () => {
      expect(
        (
          await db.query(
            "delete from public.journal_entries where id=$1 returning id",
            [journal.id],
          )
        ).rows,
      ).toHaveLength(0);
    });
  });
  it("rejects another customer's credential association", async () => {
    const ref = (
      await db.query<{ id: string }>(
        "insert into private.encrypted_credentials(user_id,provider,envelope,key_version) values($1,'deepgram','{}','v1') returning id",
        [alice],
      )
    ).rows[0]!;
    await expect(
      db.query(
        "insert into public.provider_connections(user_id,provider,credential_id,status,label) values($1,'deepgram',$2,'connected','masked')",
        [bob, ref.id],
      ),
    ).rejects.toThrow();
  });
  it("authorizes private Realtime topics and sends no journal text", async () => {
    await asUser(bob, async () => {
      await db.query("select set_config('realtime.topic',$1,false)", [
        `user:${alice}`,
      ]);
      expect(
        (await db.query("select * from realtime.messages")).rows,
      ).toHaveLength(0);
    });
    const payloads = await db.query<{ payload: unknown }>(
      "select payload from realtime.messages",
    );
    expect(JSON.stringify(payloads.rows)).not.toContain("My own words");
  });
  it("atomically claims due jobs once and refuses customer queue access", async () => {
    await db.query(
      "insert into public.call_jobs(user_id,occurrence_at) values($1,now())",
      [alice],
    );
    const first = await db.query("select * from public.claim_call_jobs(10)");
    const second = await db.query("select * from public.claim_call_jobs(10)");
    expect(first.rows).toHaveLength(1);
    expect(second.rows).toHaveLength(0);
    await asUser(alice, async () => {
      await expect(
        db.query("select * from public.claim_call_jobs(10)"),
      ).rejects.toThrow();
    });
  });
  it("never requeues a call with an uncertain sent request", async () => {
    await db.query(
      "update public.call_jobs set status='sending',lease_until=now()-interval '1 minute' where user_id=$1",
      [alice],
    );
    await db.query("select * from public.claim_call_jobs(10)");
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.call_jobs where user_id=$1",
          [alice],
        )
      ).rows[0]?.status,
    ).toBe("uncertain");
  });
  it("isolates approved memories and prevents client creation", async () => {
    const journal = (
      await db.query<{ id: string }>(
        "insert into public.journal_entries(user_id,entry_date,title,reflection,source) values($1,'2026-10-13','Private','My words','voice') returning id",
        [alice],
      )
    ).rows[0]!;
    const memory = (
      await db.query<{ id: string }>(
        "insert into public.voice_memories(user_id,journal_id,value,quote,permission_quote) values($1,$2,'quiet walks','I like quiet walks','Yes, remember this') returning id",
        [alice, journal.id],
      )
    ).rows[0]!;
    await asUser(bob, async () => {
      expect(
        (await db.query("select * from public.voice_memories")).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query(
            "delete from public.voice_memories where id=$1 returning id",
            [memory.id],
          )
        ).rows,
      ).toHaveLength(0);
    });
    await asUser(alice, async () => {
      expect(
        (await db.query("select * from public.voice_memories")).rows,
      ).toHaveLength(1);
      await expect(
        db.query(
          "insert into public.voice_memories(user_id,journal_id,value,quote,permission_quote) values($1,$2,'fake','fake','fake')",
          [alice, journal.id],
        ),
      ).rejects.toThrow();
      expect(
        (
          await db.query(
            "delete from public.voice_memories where id=$1 returning id",
            [memory.id],
          )
        ).rows,
      ).toHaveLength(1);
    });
  });
  it("suspension removes private read access", async () => {
    await db.query(
      "update public.profiles set suspended=true where user_id=$1",
      [bob],
    );
    await asUser(bob, async () => {
      expect(
        (await db.query("select * from public.profiles")).rows,
      ).toHaveLength(0);
    });
  });
});
