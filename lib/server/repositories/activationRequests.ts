import { query, queryOne } from "../db";
import { hashToken } from "../crypto";
import type { ActivationRequest, ActivationWithApp, ExternalApp } from "../types";

type ActivationRow = {
  id: string;
  public_id: string;
  external_app_id: string;
  status: ActivationRequest["status"];
  requested_subject: string | null;
  approved_user_id: string | null;
  scopes: string[];
  callback_url: string | null;
  return_url: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
};

type ActivationWithAppRow = ActivationRow & {
  app_public_id: string;
  app_name: string;
  app_slug: string;
  app_callback_url: string | null;
  app_allowed_redirect_urls: string[];
  app_required_product: string | null;
  app_status: ExternalApp["status"];
};

function mapActivation(row: ActivationRow): ActivationRequest {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    externalAppId: Number(row.external_app_id),
    status: row.status,
    requestedSubject: row.requested_subject,
    approvedUserId: row.approved_user_id ? Number(row.approved_user_id) : null,
    scopes: row.scopes || [],
    callbackUrl: row.callback_url,
    returnUrl: row.return_url,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function mapActivationWithApp(row: ActivationWithAppRow): ActivationWithApp {
  return {
    ...mapActivation(row),
    app: {
      id: Number(row.external_app_id),
      publicId: row.app_public_id,
      name: row.app_name,
      slug: row.app_slug,
      callbackUrl: row.app_callback_url,
      allowedRedirectUrls: row.app_allowed_redirect_urls || [],
      requiredProduct: row.app_required_product,
      status: row.app_status,
    },
  };
}

const activationSelect = `
  id,
  public_id,
  external_app_id,
  status,
  requested_subject,
  approved_user_id,
  scopes,
  callback_url,
  return_url,
  ip,
  user_agent,
  created_at::text,
  expires_at::text
`;

const activationSelectWithAlias = `
  ar.id,
  ar.public_id,
  ar.external_app_id,
  ar.status,
  ar.requested_subject,
  ar.approved_user_id,
  ar.scopes,
  ar.callback_url,
  ar.return_url,
  ar.ip,
  ar.user_agent,
  ar.created_at::text,
  ar.expires_at::text
`;

export async function createActivationRequest(input: {
  publicId: string;
  appId: number;
  token: string;
  scopes: string[];
  requestedSubject: string | null;
  callbackUrl: string | null;
  returnUrl: string | null;
  ip: string;
  userAgent: string;
  expiresAt: Date;
}) {
  const row = await queryOne<ActivationRow>(
    `insert into activation_requests (
       public_id,
       external_app_id,
       token_hash,
       scopes,
       requested_subject,
       callback_url,
       return_url,
       ip,
       user_agent,
       expires_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning ${activationSelect}`,
    [
      input.publicId,
      input.appId,
      hashToken(input.token),
      input.scopes,
      input.requestedSubject,
      input.callbackUrl,
      input.returnUrl,
      input.ip,
      input.userAgent,
      input.expiresAt.toISOString(),
    ],
  );

  if (!row) {
    throw new Error("failed to create activation request");
  }

  return mapActivation(row);
}

export async function findActivationByToken(token: string) {
  const row = await queryOne<ActivationWithAppRow>(
    `select
       ${activationSelectWithAlias},
       ea.public_id as app_public_id,
       ea.name as app_name,
       ea.slug as app_slug,
       ea.callback_url as app_callback_url,
       ea.allowed_redirect_urls as app_allowed_redirect_urls,
       ea.required_product as app_required_product,
       ea.status as app_status
     from activation_requests ar
     join external_apps ea on ea.id = ar.external_app_id
     where ar.token_hash = $1`,
    [hashToken(token)],
  );
  return row ? mapActivationWithApp(row) : null;
}

export async function findActivationByPublicId(publicId: string) {
  const row = await queryOne<ActivationWithAppRow>(
    `select
       ${activationSelectWithAlias},
       ea.public_id as app_public_id,
       ea.name as app_name,
       ea.slug as app_slug,
       ea.callback_url as app_callback_url,
       ea.allowed_redirect_urls as app_allowed_redirect_urls,
       ea.required_product as app_required_product,
       ea.status as app_status
     from activation_requests ar
     join external_apps ea on ea.id = ar.external_app_id
     where ar.public_id = $1`,
    [publicId],
  );
  return row ? mapActivationWithApp(row) : null;
}

export async function approveActivation(publicId: string, userId: number) {
  const row = await queryOne<ActivationRow>(
    `update activation_requests
        set status = 'approved',
            approved_user_id = $2,
            approved_at = now()
      where public_id = $1
        and status = 'pending'
        and expires_at > now()
      returning ${activationSelect}`,
    [publicId, userId],
  );
  return row ? mapActivation(row) : null;
}

export async function denyActivation(publicId: string) {
  const row = await queryOne<ActivationRow>(
    `update activation_requests
        set status = 'denied',
            denied_at = now()
      where public_id = $1
        and status = 'pending'
      returning ${activationSelect}`,
    [publicId],
  );
  return row ? mapActivation(row) : null;
}

export async function cancelActivation(publicId: string, appId: number) {
  const row = await queryOne<ActivationRow>(
    `update activation_requests
        set status = 'cancelled',
            cancelled_at = now()
      where public_id = $1
        and external_app_id = $2
        and status = 'pending'
      returning ${activationSelect}`,
    [publicId, appId],
  );
  return row ? mapActivation(row) : null;
}

export async function listRecentActivationsForUser(userId: number, limit = 20) {
  const rows = await query<ActivationWithAppRow>(
    `select
       ${activationSelectWithAlias},
       ea.public_id as app_public_id,
       ea.name as app_name,
       ea.slug as app_slug,
       ea.callback_url as app_callback_url,
       ea.allowed_redirect_urls as app_allowed_redirect_urls,
       ea.required_product as app_required_product,
       ea.status as app_status
     from activation_requests ar
     join external_apps ea on ea.id = ar.external_app_id
     where ar.approved_user_id = $1
     order by ar.created_at desc
     limit $2`,
    [userId, limit],
  );
  return rows.map(mapActivationWithApp);
}
