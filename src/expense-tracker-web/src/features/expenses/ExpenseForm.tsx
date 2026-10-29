import { useRef, useState } from 'react';
import { ApiError, type Category, type Expense, type ExpenseInput } from '../../api/client';
import { amountInput, parseAmount, today } from '../../shared/money/money';

type Props = {
  categories: Category[]; expense: Expense | null; pending: boolean; error: Error | null;
  onSave: (input: ExpenseInput) => void; onCancel: () => void;
  onDirty: (dirty: boolean) => void; onRefresh: () => void;
  initialDate?: string; initialCategory?: number;
};

export function ExpenseForm({ categories, expense, pending, error, onSave, onCancel, onDirty, onRefresh, initialDate, initialCategory }: Props) {
  const [amount, setAmount] = useState(expense ? amountInput(expense.amountMinor) : '');
  const [date, setDate] = useState(expense?.date ?? initialDate ?? today());
  const [category, setCategory] = useState(expense?.categoryId ?? initialCategory ?? categories[0]?.id ?? 1);
  const [note, setNote] = useState(expense?.note ?? '');
  const [localErrors, setLocalErrors] = useState<Record<string, string[]>>({});
  const form = useRef<HTMLFormElement>(null);
  const errors = { ...(error instanceof ApiError ? error.errors : {}), ...localErrors };
  const fieldError = (field: string) => errors[field] ? <span className="fieldError" id={`${field}-error`}>{errors[field].join(' ')}</span> : null;
  const attributes = (field: string) => ({ 'aria-invalid': !!errors[field], 'aria-describedby': errors[field] ? `${field}-error` : undefined });
  return <form ref={form} noValidate onChange={() => onDirty(true)} onSubmit={event => {
    event.preventDefault();
    if (pending || !categories.length) return;
    const amountMinor = parseAmount(amount);
    const invalid: Record<string, string[]> = {};
    if (amountMinor === null) invalid.amountMinor = ['Укажіть суму від 0,01 до 100 000 000,00 без розділювачів тисяч.'];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || date > '9998-12-31') invalid.date = ['Укажіть дату від 1900 до 9998 року.'];
    if (note.trim().length > 200) invalid.note = ['Не більше 200 символів.'];
    setLocalErrors(invalid);
    if (Object.keys(invalid).length) {
      form.current?.querySelector<HTMLInputElement>(`[name="${Object.keys(invalid)[0]}"]`)?.focus();
      return;
    }
    onSave({ amountMinor: amountMinor!, date, categoryId: category, note });
  }}>
    <h2>{expense ? 'Редагувати витрату' : 'Нова витрата'}</h2>
    <fieldset disabled={pending}>
      <label htmlFor="amountMinor">Сума, ₴</label>
      <input id="amountMinor" name="amountMinor" inputMode="decimal" autoComplete="off" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} {...attributes('amountMinor')} />{fieldError('amountMinor')}
      <label htmlFor="date">Дата</label>
      <input id="date" name="date" type="date" min="1900-01-01" max="9998-12-31" value={date} onChange={e => setDate(e.target.value)} {...attributes('date')} />{fieldError('date')}
      <label htmlFor="categoryId">Категорія</label>
      <select id="categoryId" name="categoryId" value={category} onChange={e => setCategory(Number(e.target.value))} {...attributes('categoryId')}>
        {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>{fieldError('categoryId')}
      <label htmlFor="note">Примітка <span className="muted">(необов’язково)</span></label>
      <textarea id="note" name="note" rows={3} maxLength={200} value={note} onChange={e => setNote(e.target.value)} {...attributes('note')} />{fieldError('note')}
      <div className="actions"><button className="primary" disabled={!categories.length} type="submit">{pending ? 'Збереження…' : expense ? 'Зберегти зміни' : 'Додати витрату'}</button>
        {expense && <button type="button" onClick={onCancel}>Скасувати</button>}</div>
    </fieldset>
    {error && <div role="alert" className="error"><p>{error.message}</p><button type="button" onClick={onRefresh}>Перевірити історію</button></div>}
  </form>;
}
