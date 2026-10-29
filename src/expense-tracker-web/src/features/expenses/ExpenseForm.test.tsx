import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { ExpenseForm } from './ExpenseForm';

const props = { categories: [{ id: 1, name: 'Продукти', sortOrder: 1 }], expense: null, pending: false, error: null, onSave: vi.fn(), onCancel: vi.fn(), onDirty: vi.fn(), onRefresh: vi.fn() };
describe('expense form', () => {
  it('shows linked field errors and preserves the input after server errors', () => {
    const { rerender } = render(<ExpenseForm {...props} />);
    fireEvent.change(screen.getByLabelText('Сума, ₴'), { target: { value: '125,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Додати витрату' }));
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 12550 }));
    rerender(<ExpenseForm {...props} error={new ApiError('Помилка', 400, { amountMinor: ['Перевірте суму'] })} />);
    expect(screen.getByLabelText('Сума, ₴')).toHaveValue('125,50');
    expect(screen.getByLabelText('Сума, ₴')).toHaveAccessibleDescription('Перевірте суму');
  });
  it('prevents submit while pending and without categories', () => {
    const save = vi.fn();
    const { rerender } = render(<ExpenseForm {...props} onSave={save} pending />);
    fireEvent.submit(screen.getByRole('button', { name: 'Збереження…' }).closest('form')!);
    expect(save).not.toHaveBeenCalled();
    rerender(<ExpenseForm {...props} onSave={save} categories={[]} />);
    expect(screen.getByRole('button', { name: 'Додати витрату' })).toBeDisabled();
  });
  it('rejects fractional precision and focuses invalid amount', () => {
    render(<ExpenseForm {...props} />);
    fireEvent.change(screen.getByLabelText('Сума, ₴'), { target: { value: '1.005' } });
    fireEvent.click(screen.getByRole('button', { name: 'Додати витрату' }));
    expect(screen.getByLabelText('Сума, ₴')).toHaveFocus();
    expect(screen.getByLabelText('Сума, ₴')).toHaveAttribute('aria-invalid', 'true');
  });
});
