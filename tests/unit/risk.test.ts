import { describe, expect, it } from 'vitest';

import { scoreRisk, type RiskSignals } from '@/lib/server/risk';

function signals(overrides: Partial<RiskSignals> = {}): RiskSignals {
  return {
    ipFailures: 0,
    userFailures: 0,
    knownCountries: [],
    currentCountry: null,
    knownUserAgents: [],
    currentUserAgent: null,
    isClientRegistration: false,
    ...overrides,
  };
}

describe('scoreRisk', () => {
  it('scores a clean request as low with no reasons', () => {
    expect(scoreRisk(signals())).toEqual({ score: 0, result: 'low', reasons: [] });
  });

  it('maps IP failures to bands that do not stack', () => {
    expect(scoreRisk(signals({ ipFailures: 2 })).score).toBe(0);
    expect(scoreRisk(signals({ ipFailures: 3 }))).toMatchObject({
      score: 15,
      reasons: ['recent_ip_failures'],
    });
    // 10+ failures is the high band alone, never high + low.
    expect(scoreRisk(signals({ ipFailures: 50 }))).toMatchObject({
      score: 35,
      reasons: ['many_recent_ip_failures'],
    });
  });

  it('penalizes a user only after crossing the failure threshold', () => {
    expect(scoreRisk(signals({ userFailures: 4 })).score).toBe(0);
    expect(scoreRisk(signals({ userFailures: 5 }))).toMatchObject({
      score: 25,
      reasons: ['many_recent_user_failures'],
    });
  });

  it('flags an unseen country but not a known one', () => {
    expect(scoreRisk(signals({ knownCountries: ['US'], currentCountry: 'DE' }))).toMatchObject({
      score: 25,
      reasons: ['new_country'],
    });
    expect(scoreRisk(signals({ knownCountries: ['US', 'DE'], currentCountry: 'DE' })).score).toBe(0);
  });

  it('flags an unseen user agent but not a known one', () => {
    expect(
      scoreRisk(signals({ knownUserAgents: ['Firefox'], currentUserAgent: 'curl/8' })),
    ).toMatchObject({ score: 15, reasons: ['new_user_agent'] });
    expect(
      scoreRisk(signals({ knownUserAgents: ['curl/8'], currentUserAgent: 'curl/8' })).score,
    ).toBe(0);
  });

  it('does not flag country or user agent without a baseline history', () => {
    // A first login has no prior events to compare against, so it is not "new".
    expect(scoreRisk(signals({ knownCountries: [], currentCountry: 'US' })).score).toBe(0);
    expect(scoreRisk(signals({ knownUserAgents: [], currentUserAgent: 'curl/8' })).score).toBe(0);
  });

  it('penalizes OAuth client registration', () => {
    expect(scoreRisk(signals({ isClientRegistration: true }))).toMatchObject({
      score: 20,
      reasons: ['oauth_client_registration'],
    });
  });

  it('classifies by band: low below 30, medium 30-59, high at 60', () => {
    expect(scoreRisk(signals({ userFailures: 5 })).result).toBe('low'); // 25
    expect(
      scoreRisk(signals({ ipFailures: 3, knownUserAgents: ['a'], currentUserAgent: 'b' })).result,
    ).toBe('medium'); // 15 + 15 = 30
    expect(scoreRisk(signals({ ipFailures: 10, isClientRegistration: true })).result).toBe(
      'medium',
    ); // 35 + 20 = 55
    expect(scoreRisk(signals({ ipFailures: 10, userFailures: 5 })).result).toBe('high'); // 35 + 25 = 60
  });

  it('reports reasons in evaluation order and sums their weights', () => {
    const r = scoreRisk(
      signals({
        ipFailures: 10,
        userFailures: 5,
        knownCountries: ['US'],
        currentCountry: 'DE',
        knownUserAgents: ['Firefox'],
        currentUserAgent: 'curl/8',
        isClientRegistration: true,
      }),
    );
    expect(r.reasons).toEqual([
      'many_recent_ip_failures',
      'many_recent_user_failures',
      'new_country',
      'new_user_agent',
      'oauth_client_registration',
    ]);
    expect(r.score).toBe(120);
    expect(r.result).toBe('high');
  });
});
