import { describe, expect, it } from 'vitest';
import { formatGram, parseGram } from '@/lib/server/repositories/billing';

describe('parsing a typed GRAM amount', () => {
  it.each([
    ['1', 1_000_000_000n],
    ['1.5', 1_500_000_000n],
    ['0.000000001', 1n],
    [' 2.25 ', 2_250_000_000n],
    // Past 2^53 nanocoins, where a float would already have lost the last digit.
    ['9007199.254740993', 9_007_199_254_740_993n],
  ])('reads %s exactly', (input, nano) => {
    expect(parseGram(input)).toBe(nano);
  });

  it.each(['', '0', '0.0', '-1', '1e3', '1,5', '.5', '1.', '1.0000000001', 'abc', '0x10'])(
    'refuses %j',
    input => {
      expect(parseGram(input)).toBeNull();
    },
  );

  it('round-trips through the display format', () => {
    expect(formatGram(parseGram('12.345')!.toString())).toBe('12.345');
  });
});
