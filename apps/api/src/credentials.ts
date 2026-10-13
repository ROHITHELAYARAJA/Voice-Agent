import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { decrypt, encrypt, type Envelope } from "./security.ts";
import type { Credentials } from "./providers.ts";
export async function saveCredentials(
  pool: Pool,
  key: Buffer,
  owner: string,
  value: Credentials,
  verified: { label: string; capabilities: Record<string, unknown> },
) {
  const ref = randomUUID(),
    envelope = encrypt(value, key, owner, value.provider, ref);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "delete from private.encrypted_credentials where user_id=$1 and provider=$2",
      [owner, value.provider],
    );
    await client.query(
      "insert into private.encrypted_credentials(id,user_id,provider,envelope,key_version) values($1,$2,$3,$4,'v1')",
      [ref, owner, value.provider, envelope],
    );
    await client.query(
      "insert into public.provider_connections(user_id,provider,credential_id,status,label,capabilities,verified_at) values($1,$2,$3,'connected',$4,$5,now())",
      [owner, value.provider, ref, verified.label, verified.capabilities],
    );
    await client.query(
      "insert into public.audit_logs(user_id,actor_id,action,metadata) values($1,$1,'provider.connected',$2)",
      [owner, { provider: value.provider }],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
export async function loadCredentials(
  pool: Pool,
  key: Buffer,
  owner: string,
  provider: string,
) {
  const result = await pool.query(
    "select e.id,e.envelope from private.encrypted_credentials e join public.provider_connections c on c.credential_id=e.id and c.user_id=e.user_id where e.user_id=$1 and e.provider=$2 and c.status='connected'",
    [owner, provider],
  );
  const row = result.rows[0] as { id: string; envelope: Envelope } | undefined;
  if (!row) throw new Error("PROVIDER_NOT_CONNECTED");
  return decrypt<Credentials>(row.envelope, key, owner, provider, row.id);
}
