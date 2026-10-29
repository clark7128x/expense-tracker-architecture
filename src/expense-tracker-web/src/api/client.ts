export type Category = { id: number; name: string; sortOrder: number };
export type Expense = { id: string; amountMinor: number; currency: 'UAH'; date: string; categoryId: number; note: string; createdAtUtc: string; updatedAtUtc: string };
export type ExpenseInput = Pick<Expense, 'amountMinor' | 'date' | 'categoryId' | 'note'>;
export type ExpensePage = { items: Expense[]; page: number; pageSize: number; totalCount: number };
export type Summary = { month: string; totalMinor: number; expenseCount: number; topCategoryId: number | null; byCategory: { categoryId: number; amountMinor: number; expenseCount: number }[] };

export class ApiError extends Error {
  constructor(message: string, public status: number, public errors: Record<string, string[]> = {}) { super(message); }
}

export async function request<T>(path: string, method = 'GET', body?: ExpenseInput): Promise<T> {
  const connectionMessage = method === 'GET' ? 'Немає зв’язку із сервером.' : 'Зв’язок перервано. Результат дії невідомий. Перевірте історію перед повторною спробою.';
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(connectionMessage, 0);
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new ApiError(problem.title ?? 'Не вдалося виконати запит.', response.status, problem.errors);
  }
  if (response.status === 204) return undefined as T;
  try { return await response.json(); }
  catch { throw new ApiError(connectionMessage, 0); }
}
