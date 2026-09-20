import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { beginCell } from '@ton/core';

const requireCjs = createRequire(import.meta.url);
const { parseDonation, textComment, normalizeAddress, DONOR_THRESHOLD_NANO } =
  requireCjs('../../worker-ton.js');

const OWNER = '0:7dadb32dadc47eeb136d2c10c2a2b2b91302a8079caac544d17de37f266f3df1';
const SENDER = '0:f70ff98c567057c2f15ba7b6304f09baa41bf50752c82bd121829b2b48d959f8';

function commentBody(text: string) {
  return beginCell().storeUint(0, 32).storeStringTail(text).endCell().toBoc().toString('base64');
}

// Shaped like a real toncenter transaction; each test spoils one thing.
function transaction(overrides: Record<string, unknown> = {}, msg: Record<string, unknown> = {}) {
  return {
    hash: 'aGFzaA==',
    lt: '104779186000020',
    now: 1789929452,
    emulated: false,
    finality: 'finalized',
    description: { aborted: false, compute_ph: { success: true }, action: { success: true } },
    in_msg: {
      source: SENDER,
      destination: OWNER.toUpperCase(),
      value: '1000000000',
      opcode: '0x00000000',
      bounced: false,
      message_content: { body: commentBody('ABCD1234EF') },
      ...msg,
    },
    ...overrides,
  };
}

// An operator configures the donation address by pasting what their wallet
// showed them, which is the friendly form. It has to end up as the raw form a
// transaction carries, and it must not simply be lower-cased: friendly
// addresses are base64, so folding the case breaks the checksum outright.
describe('normalizeAddress', () => {
  const friendly = 'UQAUe5fSs3qeDp3L2yC8Y2hk06GPrCz48KKsoZWsd-vtwE07';
  const raw = '0:147b97d2b37a9e0e9dcbdb20bc636864d3a18fac2cf8f0a2aca195ac77ebedc0';

  it('turns the friendly form into the raw form', () => {
    expect(normalizeAddress(friendly)).toBe(raw);
  });

  it('leaves an address that is already raw alone', () => {
    expect(normalizeAddress(raw)).toBe(raw);
    expect(normalizeAddress(raw.toUpperCase().replace('0X', '0x'))).toBe(raw);
  });

  it('tolerates surrounding whitespace from a copy and paste', () => {
    expect(normalizeAddress(`  ${friendly}\n`)).toBe(raw);
  });

  // Switching donations off loudly beats matching nothing silently.
  it('gives back nothing for a value it cannot parse', () => {
    expect(normalizeAddress(friendly.toLowerCase())).toBe('');
    expect(normalizeAddress('not-an-address')).toBe('');
    expect(normalizeAddress('')).toBe('');
    expect(normalizeAddress(undefined)).toBe('');
  });
});

describe('textComment', () => {
  it('reads a comment out of the message body', () => {
    expect(textComment(commentBody('HELLO'))).toBe('HELLO');
  });

  it('reads a comment long enough to span cells', () => {
    const long = 'x'.repeat(300);
    expect(textComment(commentBody(long))).toBe(long);
  });

  it('returns nothing for a body that is not a text comment', () => {
    const jetton = beginCell().storeUint(0x7362d09c, 32).endCell().toBoc().toString('base64');
    expect(textComment(jetton)).toBeNull();
    expect(textComment('not-a-boc')).toBeNull();
    expect(textComment(null)).toBeNull();
  });
});

describe('parseDonation', () => {
  it('matches a destination however the address was configured', () => {
    const configured = normalizeAddress('UQB9rbMtrcR-6xNtLBDCorK5EwKoB5yqxUTRfeN_Jm898VSQ');
    expect(parseDonation(transaction({}, { destination: configured }), configured)).not.toBeNull();
  });

  it('accepts an inbound transfer carrying a memo', () => {
    const donation = parseDonation(transaction(), OWNER);
    expect(donation).toMatchObject({
      amountNano: 1_000_000_000n,
      memo: 'ABCD1234EF',
      sender: SENDER,
      txLt: '104779186000020',
    });
  });

  it('accepts a transfer with no comment, leaving it unmatched', () => {
    const donation = parseDonation(transaction({}, { message_content: undefined, opcode: undefined }), OWNER);
    expect(donation).toMatchObject({ amountNano: 1_000_000_000n, memo: null });
  });

  it('trims and upper-cases the memo so it matches however it was typed', () => {
    const donation = parseDonation(transaction({}, { message_content: { body: commentBody('  abcd1234ef ') } }), OWNER);
    expect(donation.memo).toBe('ABCD1234EF');
  });

  // Each of these is a way a transfer can look like money arriving without any
  // having actually arrived.
  it.each([
    ['an external message with no sender', {}, { source: null }],
    ['a transfer to a different account', {}, { destination: `0:${'9'.repeat(64)}` }],
    ['a bounced message', {}, { bounced: true }],
    ['zero value', {}, { value: '0' }],
    ['a jetton transfer notification', {}, { opcode: '0x7362d09c' }],
    ['an encrypted comment', {}, { opcode: '0x2167da4b' }],
    ['an aborted transaction', { description: { aborted: true } }, {}],
    ['a failed compute phase', { description: { aborted: false, compute_ph: { success: false } } }, {}],
    ['a failed action phase', { description: { aborted: false, action: { success: false } } }, {}],
  ])('refuses %s', (_label, overrides, msg) => {
    expect(parseDonation(transaction(overrides, msg), OWNER)).toBeNull();
  });

  it('compares the destination without regard to case', () => {
    expect(parseDonation(transaction({}, { destination: OWNER }), OWNER)).not.toBeNull();
    expect(parseDonation(transaction({}, { destination: OWNER.toUpperCase() }), OWNER)).not.toBeNull();
  });

  // Nine coins is past 2^53, so anything that round-tripped through a JS
  // number here would quietly lose its low digits.
  it('keeps large amounts exact', () => {
    const huge = '123456789012345678';
    const donation = parseDonation(transaction({}, { value: huge }), OWNER);
    expect(donation.amountNano.toString()).toBe(huge);
  });

  it('sets the badge threshold at one GRAM', () => {
    expect(DONOR_THRESHOLD_NANO).toBe(1_000_000_000n);
  });
});
