import { queryOne } from "../db";
import { hashToken } from "../crypto";
import type { ExternalApp } from "../types";

type ExternalAppRow = {
  id: string;
  public_id: string;
  name: string;
  slug: string;
  callback_url: string | null;
  allowed_redirect_urls: string[];
  required_product: string | null;
  status: "active" | "disabled";
};

function mapExternalApp(row: ExternalAppRow): ExternalApp {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    name: row.name,
    slug: row.slug,
    callbackUrl: row.callback_url,
    allowedRedirectUrls: row.allowed_redirect_urls || [],
    requiredProduct: row.required_product,
    status: row.status,
  };
}

export async function findExternalAppByApiKey(apiKey: string) {
  const row = await queryOne<ExternalAppRow>(
    `select
       id,
       public_id,
       name,
       slug,
       callback_url,
       allowed_redirect_urls,
       required_product,
       status
     from external_apps
     where api_key_hash = $1`,
    [hashToken(apiKey)],
  );
  return row ? mapExternalApp(row) : null;
}

export async function findExternalAppByClientId(clientId: string) {
  const row = await queryOne<ExternalAppRow>(
    `select
       id,
       public_id,
       name,
       slug,
       callback_url,
       allowed_redirect_urls,
       required_product,
       status
     from external_apps
     where public_id = $1`,
    [clientId],
  );
  return row ? mapExternalApp(row) : null;
}

export async function verifyExternalAppClientSecret(
  clientId: string,
  clientSecret: string,
) {
  const row = await queryOne<ExternalAppRow>(
    `select
       id,
       public_id,
       name,
       slug,
       callback_url,
       allowed_redirect_urls,
       required_product,
       status
     from external_apps
     where public_id = $1
       and api_key_hash = $2`,
    [clientId, hashToken(clientSecret)],
  );
  return row ? mapExternalApp(row) : null;
}

export async function createExternalApp(input: {
  publicId: string;
  name: string;
  slug: string;
  ownerUserId: number;
  apiKey: string;
}) {
  const row = await queryOne<ExternalAppRow>(
    `insert into external_apps (
       public_id,
       name,
       slug,
       owner_user_id,
       api_key_hash
     )
     values ($1, $2, $3, $4, $5)
     returning
       id,
       public_id,
       name,
       slug,
       callback_url,
       allowed_redirect_urls,
       required_product,
       status`,
    [
      input.publicId,
      input.name,
      input.slug,
      input.ownerUserId,
      hashToken(input.apiKey),
    ],
  );
  if (!row) {
    throw new Error("failed to create external app");
  }
  return mapExternalApp(row);
}

export async function findExternalAppById(id: number) {
  const row = await queryOne<ExternalAppRow>(
    `select
       id,
       public_id,
       name,
       slug,
       callback_url,
       allowed_redirect_urls,
       required_product,
       status
     from external_apps
     where id = $1`,
    [id],
  );
  return row ? mapExternalApp(row) : null;
}
