import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'crypto';
import { Address, beginCell, Cell, contractAddress, storeStateInit } from '@ton/core';
import { keyPairFromSeed, sign } from '@ton/crypto';

import { verifyTonProof, type TonProofInput } from '@/lib/server/ton/proof';
import { lookupWalletCode, type WalletVersion } from '@/lib/server/ton/walletCodes';
import { isRawAddress, parseAddress, toFriendlyAddress, toRawAddress } from '@/lib/server/ton/address';
import { WALLET_CODE_BOC, WALLET_CODE_HASH } from '../fixtures/tonWalletCodes';

const DOMAIN = 'auth.bneck.com';
const V3_SUBWALLET = 698983191;
const W5R1_WALLET_ID = 2147483409;
const VERSIONS: WalletVersion[] = ['v3r1', 'v3r2', 'v4r2', 'w5r1'];

function walletCode(version: WalletVersion): Cell {
  return Cell.fromBoc(Buffer.from(WALLET_CODE_BOC[version], 'base64'))[0];
}

// Mirrors how each wallet lays out its storage, so the address below is the one
// the real contract would deploy to for this key.
function walletData(version: WalletVersion, publicKey: Buffer): Cell {
  if (version === 'w5r1') {
    return beginCell()
      .storeBit(1)
      .storeUint(0, 32)
      .storeUint(W5R1_WALLET_ID, 32)
      .storeBuffer(publicKey)
      .storeBit(0)
      .endCell();
  }
  const builder = beginCell().storeUint(0, 32).storeUint(V3_SUBWALLET, 32).storeBuffer(publicKey);
  if (version === 'v4r2') builder.storeBit(0);
  return builder.endCell();
}

function buildWallet(version: WalletVersion, publicKey: Buffer) {
  const code = walletCode(version);
  const data = walletData(version, publicKey);
  return {
    address: contractAddress(0, { code, data }),
    stateInit: beginCell().store(storeStateInit({ code, data })).endCell().toBoc().toString('base64'),
  };
}

// Built from the TON Connect specification rather than by calling the
// verifier's own helper, so a mistake in the byte layout shows up as a failing
// test instead of cancelling itself out on both sides.
function signProof(args: {
  address: Address;
  secretKey: Buffer;
  domain: string;
  timestamp: number;
  payload: string;
}) {
  const workchain = Buffer.alloc(4);
  workchain.writeInt32BE(args.address.workChain);
  const domain = Buffer.from(args.domain, 'utf8');
  const domainLength = Buffer.alloc(4);
  domainLength.writeUInt32LE(domain.length);
  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64LE(BigInt(args.timestamp));

  const message = Buffer.concat([
    Buffer.from('ton-proof-item-v2/', 'utf8'),
    workchain,
    args.address.hash,
    domainLength,
    domain,
    timestamp,
    Buffer.from(args.payload, 'utf8'),
  ]);
  const digest = createHash('sha256')
    .update(
      Buffer.concat([
        Buffer.from([0xff, 0xff]),
        Buffer.from('ton-connect', 'utf8'),
        createHash('sha256').update(message).digest(),
      ]),
    )
    .digest();
  return sign(digest, args.secretKey).toString('base64');
}

function validProof(version: WalletVersion, overrides: { payload?: string; now?: number } = {}) {
  const keys = keyPairFromSeed(randomBytes(32));
  const { address, stateInit } = buildWallet(version, keys.publicKey);
  const payload = overrides.payload ?? 'nonce-for-this-user';
  const timestamp = overrides.now ?? Math.floor(Date.now() / 1000);
  const input: TonProofInput = {
    address: address.toRawString(),
    network: '-239',
    walletStateInit: stateInit,
    proof: {
      timestamp,
      domain: { lengthBytes: Buffer.byteLength(DOMAIN, 'utf8'), value: DOMAIN },
      payload,
      signature: signProof({ address, secretKey: keys.secretKey, domain: DOMAIN, timestamp, payload }),
    },
  };
  return { input, keys, address, expected: { expectedDomain: DOMAIN, expectedPayload: payload } };
}

describe('TON wallet code pins', () => {
  it.each(VERSIONS)('%s resolves the code cell shipped by the wallet', version => {
    const hash = walletCode(version).hash().toString('hex');
    expect(hash).toBe(WALLET_CODE_HASH[version]);
    expect(lookupWalletCode(hash)?.version).toBe(version);
  });

  it('refuses a code cell it does not recognise', () => {
    expect(lookupWalletCode('00'.repeat(32))).toBeNull();
  });

  // The addresses below came from the canonical @ton/ton wallet classes for
  // this key. If the storage layout assumed here ever drifts from a real
  // wallet, the derived address stops matching and this fails.
  it.each([
    ['v3r1', '0:d488e7d751dc9d62d7919b12a9879476f3e04a297a61410a5b6b83891ae8ed9f'],
    ['v3r2', '0:61b8d5fc2ef7930e105259e00e07c5485c5a356f670b71f28204d5e8c7a2af3b'],
    ['v4r2', '0:0786d12595316bd08487506b79554eac3d0586ab46651c235de2d76873a53eb4'],
    ['w5r1', '0:d888785158541e27881346db5b0d5f62582d0fa7e815758f63d18262c1ad4e19'],
  ] as const)('%s deploys to the address a real wallet would', (version, expected) => {
    const publicKey = Buffer.from('a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90', 'hex');
    expect(buildWallet(version, publicKey).address.toRawString()).toBe(expected);
  });
});

describe('verifyTonProof', () => {
  it.each(VERSIONS)('accepts a proof from a %s wallet', version => {
    const { input, keys, expected } = validProof(version);
    const result = verifyTonProof(input, expected);
    expect(result).toMatchObject({
      ok: true,
      walletVersion: version,
      publicKey: keys.publicKey.toString('hex'),
    });
    if (result.ok) expect(isRawAddress(result.address)).toBe(true);
  });

  it('accepts the friendly spelling of the same address', () => {
    const { input, address, expected } = validProof('v4r2');
    const result = verifyTonProof({ ...input, address: toFriendlyAddress(address.toRawString()) }, expected);
    expect(result).toMatchObject({ ok: true, address: address.toRawString() });
  });

  it('rejects a proof signed for another site', () => {
    const { input, expected } = validProof('v4r2');
    expect(verifyTonProof(input, { ...expected, expectedDomain: 'evil.example' })).toMatchObject({
      ok: false,
      reason: 'domain',
    });
  });

  // The domain is signed, so swapping it after the fact leaves a signature
  // over bytes that no longer match: this is the replay a stolen proof from
  // another site would attempt.
  it('rejects a proof whose domain was swapped after signing', () => {
    const { input, keys, address, expected } = validProof('v4r2');
    const signature = signProof({
      address,
      secretKey: keys.secretKey,
      domain: 'evil.example',
      timestamp: input.proof.timestamp,
      payload: input.proof.payload,
    });
    const tampered = { ...input, proof: { ...input.proof, signature } };
    expect(verifyTonProof(tampered, expected)).toMatchObject({ ok: false, reason: 'signature' });
  });

  it('rejects a domain whose declared byte length disagrees', () => {
    const { input, expected } = validProof('v4r2');
    const proof = { ...input.proof, domain: { ...input.proof.domain, lengthBytes: 99 } };
    expect(verifyTonProof({ ...input, proof }, expected)).toMatchObject({ ok: false, reason: 'domain' });
  });

  it('rejects a payload the server did not issue', () => {
    const { input, expected } = validProof('v4r2');
    expect(verifyTonProof(input, { ...expected, expectedPayload: 'some-other-nonce' })).toMatchObject({
      ok: false,
      reason: 'payload',
    });
  });

  it('rejects a proof older than the window', () => {
    const now = Math.floor(Date.now() / 1000);
    const { input, expected } = validProof('v4r2', { now: now - 1_000 });
    expect(verifyTonProof(input, { ...expected, now })).toMatchObject({ ok: false, reason: 'timestamp' });
  });

  it('rejects a proof dated too far ahead', () => {
    const now = Math.floor(Date.now() / 1000);
    const { input, expected } = validProof('v4r2', { now: now + 600 });
    expect(verifyTonProof(input, { ...expected, now })).toMatchObject({ ok: false, reason: 'timestamp' });
  });

  it('rejects testnet', () => {
    const { input, expected } = validProof('v4r2');
    expect(verifyTonProof({ ...input, network: '-3' }, expected)).toMatchObject({ ok: false, reason: 'network' });
  });

  // Without tying the stateInit to the claimed address, anyone could present
  // someone else's wallet alongside their own proof.
  it('rejects a stateInit that does not hash to the claimed address', () => {
    const { input, expected } = validProof('v4r2');
    const other = validProof('v4r2');
    expect(verifyTonProof({ ...input, address: other.address.toRawString() }, expected)).toMatchObject({
      ok: false,
      reason: 'address_mismatch',
    });
  });

  it('reports the code hash of a wallet version it does not know', () => {
    const keys = keyPairFromSeed(randomBytes(32));
    const code = beginCell().storeUint(0xdead, 16).endCell();
    const data = walletData('v4r2', keys.publicKey);
    const address = contractAddress(0, { code, data });
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = 'nonce-for-this-user';
    const result = verifyTonProof(
      {
        address: address.toRawString(),
        network: '-239',
        walletStateInit: beginCell().store(storeStateInit({ code, data })).endCell().toBoc().toString('base64'),
        proof: {
          timestamp,
          domain: { lengthBytes: Buffer.byteLength(DOMAIN, 'utf8'), value: DOMAIN },
          payload,
          signature: signProof({ address, secretKey: keys.secretKey, domain: DOMAIN, timestamp, payload }),
        },
      },
      { expectedDomain: DOMAIN, expectedPayload: payload },
    );
    expect(result).toMatchObject({ ok: false, reason: 'unknown_wallet', codeHash: code.hash().toString('hex') });
  });

  it('rejects a signature from a different key', () => {
    const { input, address, expected } = validProof('v4r2');
    const impostor = keyPairFromSeed(randomBytes(32));
    const proof = {
      ...input.proof,
      signature: signProof({
        address,
        secretKey: impostor.secretKey,
        domain: DOMAIN,
        timestamp: input.proof.timestamp,
        payload: input.proof.payload,
      }),
    };
    expect(verifyTonProof({ ...input, proof }, expected)).toMatchObject({ ok: false, reason: 'signature' });
  });

  it('rejects a signature with a flipped bit', () => {
    const { input, expected } = validProof('v4r2');
    const bytes = Buffer.from(input.proof.signature, 'base64');
    bytes[0] ^= 0x01;
    const proof = { ...input.proof, signature: bytes.toString('base64') };
    expect(verifyTonProof({ ...input, proof }, expected)).toMatchObject({ ok: false, reason: 'signature' });
  });

  it.each([
    ['a truncated signature', (i: TonProofInput) => ({ ...i, proof: { ...i.proof, signature: 'AAAA' } })],
    ['an unparseable stateInit', (i: TonProofInput) => ({ ...i, walletStateInit: 'not-a-boc' })],
    ['an empty stateInit', (i: TonProofInput) => ({ ...i, walletStateInit: '' })],
    ['an oversized stateInit', (i: TonProofInput) => ({ ...i, walletStateInit: 'A'.repeat(40_000) })],
    ['a nonsense address', (i: TonProofInput) => ({ ...i, address: 'not-an-address' })],
  ])('rejects %s', (_label, mangle) => {
    const { input, expected } = validProof('v4r2');
    expect(verifyTonProof(mangle(input), expected)).toMatchObject({ ok: false, reason: 'malformed' });
  });
});

describe('TON address forms', () => {
  it('round-trips between raw and friendly', () => {
    const { address } = validProof('v4r2');
    const raw = toRawAddress(address);
    expect(isRawAddress(raw)).toBe(true);
    expect(toFriendlyAddress(raw).startsWith('UQ')).toBe(true);
    expect(toRawAddress(parseAddress(toFriendlyAddress(raw))!)).toBe(raw);
  });

  it('returns null rather than throwing on junk', () => {
    expect(parseAddress('nope')).toBeNull();
  });

  it('rejects an uppercase or wrong-workchain raw address', () => {
    expect(isRawAddress(`0:${'A'.repeat(64)}`)).toBe(false);
    expect(isRawAddress(`-1:${'a'.repeat(64)}`)).toBe(false);
  });
});
