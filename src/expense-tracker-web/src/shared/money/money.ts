export function parseAmount(value: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const minor = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return minor >= 1n && minor <= 10_000_000_000n ? Number(minor) : null;
}

export function amountInput(minor: number): string {
  return `${Math.trunc(minor / 100)},${String(minor % 100).padStart(2, '0')}`;
}

export function money(minor: number): string {
  // Format whole units and replace the fraction to preserve safe-integer totals exactly.
  const units = BigInt(minor) / 100n;
  const fraction = String(BigInt(minor) % 100n).padStart(2, '0');
  return new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH' })
    .formatToParts(units).map(part => part.type === 'fraction' ? fraction : part.value).join('');
}

export function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function displayDate(date: string): string { return date.split('-').reverse().join('.'); }
