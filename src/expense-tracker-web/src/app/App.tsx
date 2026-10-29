import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, request, type Category, type Expense, type ExpenseInput, type ExpensePage, type Summary } from '../api/client';
import { ExpenseForm } from '../features/expenses/ExpenseForm';
import { displayDate, money, today } from '../shared/money/money';
import styles from './App.module.css';

export function App() {
  const client = useQueryClient();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [defaults, setDefaults] = useState<Expense | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const deleteTrigger = useRef<HTMLElement | null>(null);
  const validMonth = /^\d{4}-\d{2}$/.test(month) && month >= '1900-01' && month <= '9998-12';
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => request<Category[]>('/categories') });
  const history = useQuery({ queryKey: ['expenses', month, category, page], enabled: validMonth,
    queryFn: () => request<ExpensePage>(`/expenses?month=${month}&page=${page}&pageSize=25${category ? `&categoryId=${category}` : ''}`) });
  const summary = useQuery({ queryKey: ['summary', month], enabled: validMonth,
    queryFn: () => request<Summary>(`/summary?month=${month}`) });
  const names = new Map(categories.data?.map(item => [item.id, item.name]));
  const refresh = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ['expenses'] }), client.invalidateQueries({ queryKey: ['summary'] })]);
  };
  const save = useMutation({ mutationFn: (input: ExpenseInput) => request<Expense>(editing ? `/expenses/${editing.id}` : '/expenses', editing ? 'PUT' : 'POST', input), retry: false,
    onSuccess: async expense => {
      setMonth(expense.date.slice(0, 7)); setCategory(''); setPage(1);
      setDefaults(expense); setEditing(null); setDirty(false); setFormVersion(v => v + 1);
      setAnnouncement(editing ? 'Зміни збережено.' : 'Витрату додано.');
      await refresh(); document.getElementById('amountMinor')?.focus();
    }, onError: error => {
      if (error instanceof ApiError && error.status === 404) void refresh();
      if (error instanceof ApiError && Object.keys(error.errors).length) document.getElementById(Object.keys(error.errors)[0])?.focus();
    },
  });
  const remove = useMutation({ mutationFn: (expense: Expense) => request<void>(`/expenses/${expense.id}`, 'DELETE'), retry: false,
    onSuccess: async (_, expense) => {
      if (editing?.id === expense.id) { setEditing(null); setDirty(false); setFormVersion(v => v + 1); save.reset(); }
      closeDelete(); setAnnouncement('Витрату видалено.'); await refresh();
      document.getElementById('history-heading')?.focus();
    }, onError: error => { if (error instanceof ApiError && error.status === 404) void refresh(); },
  });
  useEffect(() => {
    if (history.data && page > 1 && page > Math.max(1, Math.ceil(history.data.totalCount / 25))) setPage(Math.max(1, Math.ceil(history.data.totalCount / 25)));
  }, [history.data, page]);
  useEffect(() => { if (deleting) deleteDialog.current?.showModal(); }, [deleting]);
  function closeDelete() {
    deleteDialog.current?.close(); setDeleting(null);
    if (deleteTrigger.current?.isConnected) deleteTrigger.current.focus();
    else document.getElementById('history-heading')?.focus();
  }
  function edit(expense: Expense) {
    if (dirty && !window.confirm('Відкинути незбережені зміни?')) return;
    setEditing(expense); setDirty(false); setFormVersion(v => v + 1); save.reset();
    window.setTimeout(() => document.getElementById('amountMinor')?.focus(), 0);
  }
  function cancel() {
    if (dirty && !window.confirm('Відкинути незбережені зміни?')) return;
    setEditing(null); setDirty(false); setFormVersion(v => v + 1); save.reset();
  }
  const readError = (error: Error, retry: () => void) => <div className="error" role="alert"><p>{error.message} Показані раніше дані не оновлено.</p><button onClick={retry}>Повторити завантаження</button></div>;
  return <main className={styles.page} id="main">
    <a className="skipLink" href="#entry">До введення витрати</a>
    <header className={styles.header}><div><p className={styles.eyebrow}>Особистий облік · UAH</p><h1>Витрати</h1></div>
      <label className={styles.month}>Місяць огляду<input aria-label="Місяць огляду" type="month" min="1900-01" max="9998-12" value={month} onChange={e => { setMonth(e.target.value); setPage(1); }} /></label></header>
    {!validMonth && <p role="alert" className="error">Оберіть місяць від 1900 до 9998 року.</p>}
    <section className={styles.summary} aria-label="Підсумки місяця" aria-busy={summary.isFetching}>
      <p className={styles.summaryCaption}>За місяць · усі категорії</p>
      {summary.isPending && validMonth && <p role="status">Завантаження підсумків…</p>}
      {summary.error && readError(summary.error, () => void summary.refetch())}
      {validMonth && summary.data && <dl className={styles.metrics}>
        <div><dt>Усього</dt><dd data-testid="total">{money(summary.data.totalMinor)}</dd></div>
        <div><dt>Записів</dt><dd>{summary.data.expenseCount}</dd></div>
        <div><dt>Найбільша категорія</dt><dd>{summary.data.topCategoryId ? names.get(summary.data.topCategoryId) ?? 'Завантаження…' : 'Немає витрат'}</dd></div>
      </dl>}
    </section>
    <p className={styles.announcement} role="status" aria-live="polite">{announcement}</p>
    <div className={styles.workspace}>
      <section className={styles.entry} id="entry">
        {categories.isPending && <p role="status">Завантаження категорій…</p>}
        {categories.error && readError(categories.error, () => void categories.refetch())}
        {categories.data && <ExpenseForm key={formVersion} categories={categories.data} expense={editing} initialDate={defaults?.date} initialCategory={defaults?.categoryId}
          pending={save.isPending} error={save.error} onSave={input => save.mutate(input)} onCancel={cancel} onDirty={setDirty} onRefresh={() => void refresh()} />}
      </section>
      <div className={styles.review}>
        <section aria-labelledby="history-heading" aria-busy={history.isFetching}>
          <div className={styles.historyHeader}><h2 id="history-heading" tabIndex={-1}>Історія витрат</h2>
            <label>Категорія в історії<select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
              <option value="">Усі категорії</option>{categories.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label></div>
          {history.isPending && validMonth && <p role="status">Завантаження витрат…</p>}
          {history.error && readError(history.error, () => void history.refetch())}
          {validMonth && history.data && <>
            {history.data.items.length === 0 ? <div className={styles.empty}><h3>{category ? 'У цій категорії витрат немає' : 'За цей місяць ще немає витрат'}</h3>
              <p>{category ? 'Спробуйте переглянути всі категорії.' : 'Додайте першу витрату у формі — вона з’явиться тут.'}</p>
              <button onClick={() => category ? (setCategory(''), setPage(1)) : document.getElementById('amountMinor')?.focus()}>{category ? 'Скинути фільтр' : 'Ввести витрату'}</button></div>
              : <ul className={styles.ledger}>{history.data.items.map(expense => <li key={expense.id}>
                <div className={styles.rowMain}><div><time dateTime={expense.date}>{displayDate(expense.date)}</time><p>{names.get(expense.categoryId)}</p></div><strong>{money(expense.amountMinor)}</strong></div>
                {expense.note && <p className={styles.note}>{expense.note}</p>}
                <div className={styles.rowActions}><button disabled={save.isPending || remove.isPending} onClick={() => edit(expense)} aria-label={`Редагувати ${money(expense.amountMinor)} за ${displayDate(expense.date)}`}>Редагувати</button>
                  <button className="danger" disabled={save.isPending || remove.isPending} onClick={e => { deleteTrigger.current = e.currentTarget; remove.reset(); setDeleting(expense); }} aria-label={`Видалити ${money(expense.amountMinor)} за ${displayDate(expense.date)}`}>Видалити</button></div>
              </li>)}</ul>}
            {history.data.totalCount > 0 && <nav aria-label="Сторінки історії" className={styles.pagination}>
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Назад</button><span>{page} / {Math.max(1, Math.ceil(history.data.totalCount / 25))}</span>
              <button disabled={page * 25 >= history.data.totalCount} onClick={() => setPage(p => p + 1)}>Далі</button>
            </nav>}
          </>}
        </section>
        <section className={styles.breakdown} aria-labelledby="breakdown-heading"><h2 id="breakdown-heading">За категоріями</h2><p className="muted">Усі витрати вибраного місяця, незалежно від фільтра історії.</p>
          {validMonth && summary.data && <ul>{summary.data.byCategory.map(item => <li key={item.categoryId}><div><span>{names.get(item.categoryId)}</span><strong>{money(item.amountMinor)}</strong></div>
            <meter min={0} max={summary.data.totalMinor} value={item.amountMinor} aria-label={`${names.get(item.categoryId)}: ${money(item.amountMinor)}`} /></li>)}</ul>}
          {summary.data?.expenseCount === 0 && <p>Розподіл з’явиться після додавання витрат.</p>}
        </section>
      </div>
    </div>
    <dialog ref={deleteDialog} onCancel={event => { event.preventDefault(); if (!remove.isPending) closeDelete(); }} aria-labelledby="delete-title">
      <h2 id="delete-title">Видалити витрату?</h2><p>{deleting && `${money(deleting.amountMinor)} за ${displayDate(deleting.date)}`}</p><p>Цю дію неможливо скасувати.</p>
      {remove.error && <div role="alert" className="error"><p>{remove.error.message}</p><button onClick={() => void refresh()}>Перевірити історію</button></div>}
      <div className="actions"><button autoFocus disabled={remove.isPending} onClick={closeDelete}>Залишити</button><button className="danger" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>{remove.isPending ? 'Видалення…' : 'Видалити назавжди'}</button></div>
    </dialog>
  </main>;
}
