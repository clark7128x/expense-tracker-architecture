using ExpenseTracker.Api.Domain;

namespace ExpenseTracker.Api.Contracts;

public sealed record ExpenseInput(long AmountMinor, string Date, int CategoryId, string? Note = null);
public sealed record CategoryResponse(int Id, string Name, int SortOrder);
public sealed record ExpenseResponse(Guid Id, long AmountMinor, string Currency, DateOnly Date,
    int CategoryId, string Note, DateTimeOffset CreatedAtUtc, DateTimeOffset UpdatedAtUtc)
{
    public static ExpenseResponse From(Expense expense) => new(expense.Id, expense.AmountMinor,
        expense.Currency, expense.Date, expense.CategoryId, expense.Note, expense.CreatedAtUtc, expense.UpdatedAtUtc);
}
public sealed record ExpensePage(ExpenseResponse[] Items, int Page, int PageSize, int TotalCount);
public sealed record CategoryTotal(int CategoryId, long AmountMinor, int ExpenseCount);
public sealed record MonthSummary(string Month, string Currency, long TotalMinor, int ExpenseCount,
    int? TopCategoryId, CategoryTotal[] ByCategory);
