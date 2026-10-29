import { describe, expect, it } from 'vitest';
import { amountInput, displayDate, money, parseAmount } from './money';

describe('money', () => {
  it.each([['125', 12500], ['125,5', 12550], ['125.50', 12550], [' 0,01 ', 1], ['100000000', 10000000000]])('parses %s exactly', (value, expected) => expect(parseAmount(value)).toBe(expected));
  it.each(['', '0', '-1', '1.005', '1e3', '1,2.3', '1 000', '1,000', '100000000.01'])('rejects %s', value => expect(parseAmount(value)).toBeNull());
  it('formats without losing minor units at the safe integer boundary', () => {
    expect(money(9007199254740991)).toContain(',91');
    expect(amountInput(12550)).toBe('125,50');
    expect(displayDate('2024-02-29')).toBe('29.02.2024');
  });
});
