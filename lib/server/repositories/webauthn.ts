import { query, queryOne } from "../db";

export type WebauthnCredential = {
  id: number;
  userId: number;
  credentialId: string;
  publicKey: Buffer;
  signCount: number;
  transports: string[];
  name: string | null;
  createdAt: string;
  lastUsedAt: string;
};

function mapCredential(row: any): WebauthnCredential {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    credentialId: row.credential_id,
    publicKey: row.public_key,
    signCount: Number(row.sign_count),
    transports: row.transports,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

const credentialSelect = `
  id,
  user_id,
  credential_id,
  public_key,
  sign_count,
  transports,
  name,
  created_at::text,
  last_used_at::text
`;

export async function createWebauthnCredential(input: {
  userId: number;
  credentialId: string;
  publicKey: Uint8Array;
  signCount: number;
  transports: string[];
  name: string;
}) {
  const row = await queryOne(
    `insert into webauthn_credentials (
       user_id,
       credential_id,
       public_key,
       sign_count,
       transports,
       name
     )
     values ($1, $2, $3, $4, $5, $6)
     returning ${credentialSelect}`,
    [
      input.userId,
      input.credentialId,
      Buffer.from(input.publicKey),
      input.signCount,
      input.transports,
      input.name,
    ]
  );
  if (!row) throw new Error("Failed to create credential");
  return mapCredential(row);
}

export async function findWebauthnCredentialById(credentialId: string) {
  const row = await queryOne(
    `select ${credentialSelect} from webauthn_credentials where credential_id = $1`,
    [credentialId]
  );
  return row ? mapCredential(row) : null;
}

export async function findWebauthnCredentialsByUser(userId: number) {
  const rows = await query(
    `select ${credentialSelect} from webauthn_credentials where user_id = $1 order by created_at desc`,
    [userId]
  );
  return rows.map(mapCredential);
}

export async function updateWebauthnCredentialSignCount(credentialId: string, signCount: number) {
  await query(
    `update webauthn_credentials
        set sign_count = $2,
            last_used_at = now()
      where credential_id = $1`,
    [credentialId, signCount]
  );
}

export async function deleteWebauthnCredential(credentialId: string, userId: number) {
  await query(
    `delete from webauthn_credentials where credential_id = $1 and user_id = $2`,
    [credentialId, userId]
  );
}
