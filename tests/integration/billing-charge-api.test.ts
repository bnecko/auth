import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/server/db';
import { hashToken, publicId, randomToken } from '@/lib/server/crypto';
import { creditDeposit, getBalanceNano, NANO_PER_GRAM } from '@/lib/server/repositories/billing';
import { POST } from '@/app/api/billing/charge/route';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedUserId(prefix: string) {
  const username = `${prefix}_${randomToken(6)}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'ChargeTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  return Number(row!.id);
}

// An access token that already binds an app, a user and a set of scopes, which
// is what the route reads instead of trusting anything in the body.
// Consent leaves two things behind: the token, whose scopes are a snapshot, and
// the authorization row, which is the live grant. `grant` lets a case pull them
// apart, the way re-consenting with less or revoking the app does.
async function seedToken(input: {
  userId: number;
  ownerUserId: number;
  scopes: string[];
  grant?: { scopes: string[]; revoked?: boolean };
}) {
  const suffix = randomToken(6);
  const app = await queryOne<{ id: string }>(
    `insert into external_apps (public_id, name, slug, api_key_hash, oauth_client_secret_hash, owner_user_id, status)
     values ($1, 'Charge App', $2, $3, $3, $4, 'active') returning id`,
    [`app_chg_${suffix}`, `chg-${suffix}`, `hash_${suffix}`, input.ownerUserId],
  );
  const token = randomToken(32);
  await query(
    `insert into oauth_access_tokens (token_hash, external_app_id, user_id, subject, token_kind, scopes, expires_at)
     values ($1, $2, $3, $4, 'user', $5, now() + interval '1 hour')`,
    [hashToken(token), app!.id, input.userId, `usr_${suffix}`, input.scopes],
  );
  const grant = input.grant ?? { scopes: input.scopes };
  await query(
    `insert into app_authorizations (user_id, external_app_id, scopes, revoked_at)
     values ($1, $2, $3, case when $4 then now() end)`,
    [input.userId, app!.id, grant.scopes, grant.revoked === true],
  );
  return { token, appId: Number(app!.id) };
}

function post(token: string, body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/billing/charge', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

const key = () => randomToken(10);

describeDb('billing charge API', () => {
  it('moves btGRAM from the token holder to the app owner', async () => {
    const payer = await seedUserId('payer');
    const owner = await seedUserId('owner');
    const { token } = await seedToken({ userId: payer, ownerUserId: owner, scopes: ['billing:charge'] });
    await creditDeposit({ userId: payer, amountNano: 5n * NANO_PER_GRAM, txHash: `chg_${randomToken(6)}` });

    const res = await post(token, { amountNano: '2000000000', idempotencyKey: key() });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ charged: true, balanceNano: '3000000000' });
    expect(await getBalanceNano(owner)).toBe('2000000000');
  });

  // Consent is the grant. Without the scope the user never agreed to be
  // charged, whatever the app sends.
  it('refuses a token without billing:charge', async () => {
    const payer = await seedUserId('payer');
    const { token } = await seedToken({
      userId: payer,
      ownerUserId: await seedUserId('owner'),
      scopes: ['profile:read'],
    });
    await creditDeposit({ userId: payer, amountNano: NANO_PER_GRAM, txHash: `chg_${randomToken(6)}` });

    const res = await post(token, { amountNano: '1', idempotencyKey: key() });
    expect(res.status).toBe(403);
    expect(await getBalanceNano(payer)).toBe('1000000000');
  });

  // The flag is checked after the token, so a caller without one learns
  // nothing about whether billing exists here.
  it('charges nothing while crypto is switched off', async () => {
    const payer = await seedUserId('payer');
    const owner = await seedUserId('owner');
    const { token } = await seedToken({ userId: payer, ownerUserId: owner, scopes: ['billing:charge'] });
    await creditDeposit({ userId: payer, amountNano: NANO_PER_GRAM, txHash: `chg_${randomToken(6)}` });
    vi.stubEnv('CRYPTO_ENABLED', 'false');

    const refused = await post(token, { amountNano: '1', idempotencyKey: key() });
    const anonymous = await post('not-a-token', { amountNano: '1', idempotencyKey: key() });
    vi.unstubAllEnvs();

    expect(refused.status).toBe(404);
    expect(anonymous.status).toBe(401);
    expect(await getBalanceNano(payer)).toBe('1000000000');
    expect(await getBalanceNano(owner)).toBe('0');
  });

  // The token still says billing:charge. What the user has agreed to since
  // is what counts, or taking the permission back would do nothing until the
  // refresh-token family expired.
  it('stops charging once the user consents again without the charge permission', async () => {
    const payer = await seedUserId('payer');
    const { token } = await seedToken({
      userId: payer,
      ownerUserId: await seedUserId('owner'),
      scopes: ['profile:read', 'billing:charge'],
      grant: { scopes: ['profile:read'] },
    });
    await creditDeposit({ userId: payer, amountNano: NANO_PER_GRAM, txHash: `chg_${randomToken(6)}` });

    const res = await post(token, { amountNano: '1', idempotencyKey: key() });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'insufficient_scope' });
    expect(await getBalanceNano(payer)).toBe('1000000000');
  });

  // A refresh that straddles the revoke can leave a live token behind it.
  it('stops charging once the user revokes the app, even with a token that survived', async () => {
    const payer = await seedUserId('payer');
    const { token } = await seedToken({
      userId: payer,
      ownerUserId: await seedUserId('owner'),
      scopes: ['billing:charge'],
      grant: { scopes: ['billing:charge'], revoked: true },
    });
    await creditDeposit({ userId: payer, amountNano: NANO_PER_GRAM, txHash: `chg_${randomToken(6)}` });

    const res = await post(token, { amountNano: '1', idempotencyKey: key() });

    expect(res.status).toBe(403);
    expect(await getBalanceNano(payer)).toBe('1000000000');
  });

  it('refuses an amount too long to be a balance as a bad request', async () => {
    const payer = await seedUserId('payer');
    const { token } = await seedToken({
      userId: payer,
      ownerUserId: await seedUserId('owner'),
      scopes: ['billing:charge'],
    });

    const res = await post(token, { amountNano: '9'.repeat(41), idempotencyKey: key() });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'invalid_amount' });
  });

  // Consent to be charged is given once, often for something small. Without a
  // ceiling it was also consent to have the whole balance taken in one call.
  describe('daily limit of 25 GRAM per user and app', () => {
    const gramNano = (n: number) => (BigInt(n) * NANO_PER_GRAM).toString();

    // The owner already has a ledger account, as any app that has been paid
    // before does. Opening one is an insert that a second transaction waits on,
    // which would queue two charges behind each other by accident and hide
    // whether the limit holds up when nothing else is in the way.
    async function payerWith(balance: number) {
      const payer = await seedUserId('payer');
      const ownerUserId = await seedUserId('owner');
      const { token, appId } = await seedToken({ userId: payer, ownerUserId, scopes: ['billing:charge'] });
      await creditDeposit({ userId: ownerUserId, amountNano: NANO_PER_GRAM, txHash: `own_${randomToken(6)}` });
      await creditDeposit({ userId: payer, amountNano: BigInt(balance) * NANO_PER_GRAM, txHash: `chg_${randomToken(6)}` });
      return { payer, token, appId };
    }

    it('lets an app take up to the limit across a day, and no more', async () => {
      const { payer, token } = await payerWith(40);

      expect((await post(token, { amountNano: gramNano(20), idempotencyKey: key() })).status).toBe(200);
      expect((await post(token, { amountNano: gramNano(5), idempotencyKey: key() })).status).toBe(200);
      const over = await post(token, { amountNano: '1', idempotencyKey: key() });

      expect(over.status).toBe(403);
      expect(await over.json()).toMatchObject({
        code: 'daily_limit_exceeded',
        limitNano: gramNano(25),
        remainingNano: '0',
      });
      expect(await getBalanceNano(payer)).toBe(gramNano(15));
    });

    it('refuses a single charge larger than the limit and says what is left', async () => {
      const { payer, token } = await payerWith(40);

      const res = await post(token, { amountNano: gramNano(26), idempotencyKey: key() });

      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: 'daily_limit_exceeded', remainingNano: gramNano(25) });
      expect(await getBalanceNano(payer)).toBe(gramNano(40));
    });

    // The charge that used up the allowance is the one most likely to be
    // retried, and a retry has to get the same answer it would have got.
    it('still answers a retry of the charge that used up the allowance', async () => {
      const { token } = await payerWith(40);
      const idempotencyKey = key();

      expect((await post(token, { amountNano: gramNano(25), idempotencyKey })).status).toBe(200);
      const retry = await post(token, { amountNano: gramNano(25), idempotencyKey });

      expect(retry.status).toBe(200);
      expect(await retry.json()).toMatchObject({ charged: false });
    });

    // Each would fit on its own. Adding the day up before taking the lock would
    // let both read a total that leaves the other out.
    it('does not let two charges arriving together both slip under it', async () => {
      const { payer, token } = await payerWith(40);

      const results = await Promise.all([
        post(token, { amountNano: gramNano(20), idempotencyKey: key() }),
        post(token, { amountNano: gramNano(20), idempotencyKey: key() }),
      ]);

      expect(results.map(res => res.status).sort()).toEqual([200, 403]);
      expect(await getBalanceNano(payer)).toBe(gramNano(20));
    });

    it('is rolling: a charge older than 24 hours no longer counts', async () => {
      const { token, appId } = await payerWith(60);
      expect((await post(token, { amountNano: gramNano(25), idempotencyKey: key() })).status).toBe(200);
      expect((await post(token, { amountNano: gramNano(1), idempotencyKey: key() })).status).toBe(403);

      await query(`update billing_transfers set created_at = now() - interval '25 hours' where app_id = $1`, [appId]);

      expect((await post(token, { amountNano: gramNano(25), idempotencyKey: key() })).status).toBe(200);
    });

    it('is counted per app, so one app reaching it does not stop another', async () => {
      const payer = await seedUserId('payer');
      const first = await seedToken({ userId: payer, ownerUserId: await seedUserId('owner'), scopes: ['billing:charge'] });
      const second = await seedToken({ userId: payer, ownerUserId: await seedUserId('owner'), scopes: ['billing:charge'] });
      await creditDeposit({ userId: payer, amountNano: 60n * NANO_PER_GRAM, txHash: `chg_${randomToken(6)}` });

      expect((await post(first.token, { amountNano: gramNano(25), idempotencyKey: key() })).status).toBe(200);
      expect((await post(first.token, { amountNano: gramNano(1), idempotencyKey: key() })).status).toBe(403);
      expect((await post(second.token, { amountNano: gramNano(25), idempotencyKey: key() })).status).toBe(200);
    });
  });

  it('refuses a missing or unknown token', async () => {
    expect((await post('', { amountNano: '1', idempotencyKey: key() })).status).toBe(401);
    expect((await post('not-a-token', { amountNano: '1', idempotencyKey: key() })).status).toBe(401);
  });

  // Retrying a charge must not take the money twice, and the caller needs a
  // success back or it will keep retrying.
  it('charges once for a repeated idempotency key', async () => {
    const payer = await seedUserId('payer');
    const owner = await seedUserId('owner');
    const { token } = await seedToken({ userId: payer, ownerUserId: owner, scopes: ['billing:charge'] });
    await creditDeposit({ userId: payer, amountNano: 4n * NANO_PER_GRAM, txHash: `chg_${randomToken(6)}` });
    const k = key();

    const first = await post(token, { amountNano: '1000000000', idempotencyKey: k });
    const replay = await post(token, { amountNano: '1000000000', idempotencyKey: k });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ charged: false });
    expect(await getBalanceNano(payer)).toBe('3000000000');
  });

  // Two apps picking the same key is likely; neither may replay the other.
  it('keeps idempotency keys separate per app', async () => {
    const payer = await seedUserId('payer');
    const a = await seedToken({ userId: payer, ownerUserId: await seedUserId('o'), scopes: ['billing:charge'] });
    const b = await seedToken({ userId: payer, ownerUserId: await seedUserId('o'), scopes: ['billing:charge'] });
    await creditDeposit({ userId: payer, amountNano: 4n * NANO_PER_GRAM, txHash: `chg_${randomToken(6)}` });
    const shared = key();

    await post(a.token, { amountNano: '1000000000', idempotencyKey: shared });
    const second = await post(b.token, { amountNano: '1000000000', idempotencyKey: shared });

    expect(await second.json()).toMatchObject({ charged: true });
    expect(await getBalanceNano(payer)).toBe('2000000000');
  });

  it('refuses to overdraw, and takes nothing', async () => {
    const payer = await seedUserId('payer');
    const { token } = await seedToken({
      userId: payer,
      ownerUserId: await seedUserId('owner'),
      scopes: ['billing:charge'],
    });
    await creditDeposit({ userId: payer, amountNano: NANO_PER_GRAM, txHash: `chg_${randomToken(6)}` });

    const res = await post(token, { amountNano: '9000000000', idempotencyKey: key() });
    expect(res.status).toBe(402);
    expect(await getBalanceNano(payer)).toBe('1000000000');
  });

  it.each([
    ['a number instead of a string', { amountNano: 1000, idempotencyKey: 'abcdefgh' }],
    ['a negative amount', { amountNano: '-5', idempotencyKey: 'abcdefgh' }],
    ['zero', { amountNano: '0', idempotencyKey: 'abcdefgh' }],
    ['a short idempotency key', { amountNano: '1', idempotencyKey: 'abc' }],
  ])('rejects %s', async (_label, body) => {
    const payer = await seedUserId('payer');
    const { token } = await seedToken({
      userId: payer,
      ownerUserId: await seedUserId('owner'),
      scopes: ['billing:charge'],
    });
    expect((await post(token, body)).status).toBe(400);
  });
});
