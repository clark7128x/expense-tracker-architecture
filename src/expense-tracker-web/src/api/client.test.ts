import { afterEach, expect, it, vi } from 'vitest';
import { request } from './client';

afterEach(() => vi.unstubAllGlobals());
it('reports an uncertain write when reading a successful response is interrupted', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201, json: () => Promise.reject(new TypeError('connection closed')) }));
  await expect(request('/expenses', 'POST', { amountMinor: 1, date: '2026-10-29', categoryId: 1, note: '' })).rejects.toThrow('Результат дії невідомий');
});
