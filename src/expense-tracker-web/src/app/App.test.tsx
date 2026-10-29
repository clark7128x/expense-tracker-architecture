import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';

afterEach(() => vi.unstubAllGlobals());
it('changes the month and invalidates all history and summary caches after saving', async () => {
  let saved = false;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      saved = true;
      return Response.json({ ...JSON.parse(String(init.body)), id: 'test-id' }, { status: 201 });
    }
    if (url.endsWith('/categories')) return Response.json([{ id: 1, name: 'Продукти', sortOrder: 1 }]);
    if (url.includes('/summary')) return Response.json({ month: '2026-11', totalMinor: saved ? 12550 : 0, expenseCount: saved ? 1 : 0, topCategoryId: saved ? 1 : null, byCategory: [] });
    return Response.json({ items: [], page: 1, pageSize: 25, totalCount: 0 });
  });
  vi.stubGlobal('fetch', fetcher);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidation = vi.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
  await screen.findByLabelText('Сума, ₴');
  fireEvent.change(screen.getByLabelText('Місяць огляду'), { target: { value: '2026-09' } });
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url.includes('month=2026-09'))).toBe(true));
  fireEvent.change(screen.getByLabelText('Сума, ₴'), { target: { value: '125,50' } });
  fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-11-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Додати витрату' }));
  await waitFor(() => expect(screen.getByLabelText('Місяць огляду')).toHaveValue('2026-11'));
  expect(invalidation).toHaveBeenCalledWith({ queryKey: ['expenses'] });
  expect(invalidation).toHaveBeenCalledWith({ queryKey: ['summary'] });
  await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('125,50'));
  expect(screen.getByLabelText('Сума, ₴')).toHaveValue('');
});
