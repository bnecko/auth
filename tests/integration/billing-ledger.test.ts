import { describe, expect, it } from 'vitest';
import { query, queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import {
  chargeUser,
  creditDeposit,
  donateToPool,
  findBalanceDrift,
  forfeitToPool,
  getBalanceNano,
  getPoolBalanceNano,
  InsufficientBalance,
  NANO_PER_GRAM,
} from '@/lib/server/repositories/billing';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedUserId(prefix = 'bill') {
  const username = `${prefix}_${randomToken(6)}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'BillTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  return Number(row!.id);
}

async function seedApp(ownerUserId: number) {
  const suffix = randomToken(6);
  const row = await queryOne<{ id: string }>(
    `insert into external_apps (public_id, name, slug, api_key_hash, oauth_client_secret_hash, owner_user_id)
     values ($1, 'Bill App', $2, $3, $3, $4) returning id`,
    [`app_bill_${suffix}`, `bill-${suffix}`, `hash_${suffix}`, ownerUserId],
  );
  return Number(row!.id);
}

const gram = (n: number) => BigInt(n) * NANO_PER_GRAM;

describeDb('btGRAM ledger', () => {
  it('credits a deposit and derives the balance from it', async () => {
    const userId = await seedUserId();
    await creditDeposit({ userId, amountNano: gram(2), txHash: `tx_${randomToken(6)}` });
    expect(await getBalanceNano(userId)).toBe('2000000000');
  });

  // Re-reading a window of chain history is the normal path after a restart.
  it('credits a transaction hash only once', async () => {
    const userId = await seedUserId();
    const txHash = `tx_${randomToken(6)}`;
    const first = await creditDeposit({ userId, amountNano: gram(1), txHash });
    const second = await creditDeposit({ userId, amountNano: gram(1), txHash });

    expect(first.posted).toBe(true);
    expect(second.posted).toBe(false);
    expect(await getBalanceNano(userId)).toBe('1000000000');
  });

  it('moves btGRAM from the payer to the app owner', async () => {
    const payer = await seedUserId();
    const owner = await seedUserId();
    const appId = await seedApp(owner);
    await creditDeposit({ userId: payer, amountNano: gram(5), txHash: `tx_${randomToken(6)}` });

    await chargeUser({ userId: payer, appId, amountNano: gram(3), idempotencyKey: randomToken(8) });

    expect(await getBalanceNano(payer)).toBe('2000000000');
    expect(await getBalanceNano(owner)).toBe('3000000000');
  });

  // The database check is what makes an overdraft impossible rather than
  // merely unlikely, so it has to be the thing that stops this.
  it('refuses to overdraw', async () => {
    const payer = await seedUserId();
    const owner = await seedUserId();
    const appId = await seedApp(owner);
    await creditDeposit({ userId: payer, amountNano: gram(1), txHash: `tx_${randomToken(6)}` });

    await expect(
      chargeUser({ userId: payer, appId, amountNano: gram(2), idempotencyKey: randomToken(8) }),
    ).rejects.toBeInstanceOf(InsufficientBalance);

    expect(await getBalanceNano(payer)).toBe('1000000000');
    expect(await getBalanceNano(owner)).toBe('0');
  });

  it('charges once for a repeated idempotency key', async () => {
    const payer = await seedUserId();
    const owner = await seedUserId();
    const appId = await seedApp(owner);
    const key = randomToken(8);
    await creditDeposit({ userId: payer, amountNano: gram(5), txHash: `tx_${randomToken(6)}` });

    await chargeUser({ userId: payer, appId, amountNano: gram(1), idempotencyKey: key });
    const replay = await chargeUser({ userId: payer, appId, amountNano: gram(1), idempotencyKey: key });

    expect(replay.posted).toBe(false);
    expect(await getBalanceNano(payer)).toBe('4000000000');
  });

  it('accepts a donation into the public pool', async () => {
    const userId = await seedUserId();
    const before = BigInt(await getPoolBalanceNano());
    await creditDeposit({ userId, amountNano: gram(2), txHash: `tx_${randomToken(6)}` });

    await donateToPool({ userId, amountNano: gram(2), reference: randomToken(8) });

    expect(await getBalanceNano(userId)).toBe('0');
    expect(BigInt(await getPoolBalanceNano())).toBe(before + gram(2));
  });

  // The whole reason the pool exists: a deleted account's balance has to go
  // somewhere, and the user row has to become deletable afterwards.
  it('sweeps a departing balance into the pool and lets the user row go', async () => {
    const userId = await seedUserId();
    await creditDeposit({ userId, amountNano: gram(3), txHash: `tx_${randomToken(6)}` });
    const poolBefore = BigInt(await getPoolBalanceNano());

    const { movedNano } = await forfeitToPool(userId);
    expect(movedNano).toBe('3000000000');
    expect(BigInt(await getPoolBalanceNano())).toBe(poolBefore + gram(3));

    await query(`delete from users where id = $1`, [userId]);

    // The account survives with no owner, so the history of where the money
    // went is still readable after the person is gone.
    const orphan = await query<{ user_id: string | null }>(
      `select a.user_id from billing_accounts a
         join billing_entries e on e.account_id = a.id
        where e.amount_nano > 0 and a.kind = 'user' group by a.user_id`,
    );
    expect(orphan.some(row => row.user_id === null)).toBe(true);
  });

  it('sweeps nothing for an account that never had a balance', async () => {
    expect(await forfeitToPool(await seedUserId())).toEqual({ movedNano: '0' });
  });

  it('keeps amounts exact past the range a float could hold', async () => {
    const userId = await seedUserId();
    const huge = 123456789012345678n;
    await creditDeposit({ userId, amountNano: huge, txHash: `tx_${randomToken(6)}` });
    expect(await getBalanceNano(userId)).toBe(huge.toString());
  });

  it('keeps every cached balance equal to the sum of its legs', async () => {
    const userId = await seedUserId();
    const owner = await seedUserId();
    const appId = await seedApp(owner);
    await creditDeposit({ userId, amountNano: gram(4), txHash: `tx_${randomToken(6)}` });
    await chargeUser({ userId, appId, amountNano: gram(1), idempotencyKey: randomToken(8) });
    await donateToPool({ userId, amountNano: gram(1), reference: randomToken(8) });

    expect(await findBalanceDrift()).toEqual([]);
  });

  it('books both legs of every movement so the ledger nets to zero', async () => {
    const userId = await seedUserId();
    await creditDeposit({ userId, amountNano: gram(1), txHash: `tx_${randomToken(6)}` });

    const row = await queryOne<{ total: string }>(
      `select coalesce(sum(amount_nano), 0)::text as total from billing_entries`,
    );
    expect(row!.total).toBe('0');
  });
});
