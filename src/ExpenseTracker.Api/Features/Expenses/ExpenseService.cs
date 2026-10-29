using System.Globalization;
using ExpenseTracker.Api.Contracts;
using ExpenseTracker.Api.Data;
using ExpenseTracker.Api.Domain;
using ExpenseTracker.Api.Infrastructure.Errors;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Api.Features.Expenses;

public sealed class ExpenseService(AppDbContext db)
{
    public const long MaxAmount = 10_000_000_000;
    public const long MaxSafeInteger = 9_007_199_254_740_991;

    public static (DateOnly Start, DateOnly End) MonthRange(string? month)
    {
        if (month is null || month.Length != 7 || !DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd",
            CultureInfo.InvariantCulture, DateTimeStyles.None, out var start) || start.Year is < 1900 or > 9998)
            throw ApiException.Invalid("month", "Укажіть місяць у форматі РРРР-ММ (1900–9998).");
        return (start, start.AddMonths(1));
    }

    public static int PageOffset(int page, int pageSize)
    {
        if (page < 1) throw ApiException.Invalid("page", "Номер сторінки має бути додатним.");
        if (pageSize is < 1 or > 100) throw ApiException.Invalid("pageSize", "Розмір сторінки: від 1 до 100.");
        var offset = ((long)page - 1) * pageSize;
        if (offset > int.MaxValue) throw ApiException.Invalid("page", "Номер сторінки завеликий.");
        return (int)offset;
    }

    public async Task<ExpensePage> List(string? month, int? categoryId, int page, int pageSize, CancellationToken ct)
    {
        var (start, end) = MonthRange(month);
        var offset = PageOffset(page, pageSize);
        if (categoryId.HasValue && !await db.Categories.AnyAsync(x => x.Id == categoryId, ct))
            throw ApiException.Invalid("categoryId", "Оберіть наявну категорію.");
        var query = db.Expenses.AsNoTracking().Where(x => x.Date >= start && x.Date < end);
        if (categoryId.HasValue) query = query.Where(x => x.CategoryId == categoryId);
        var count = await query.CountAsync(ct);
        var items = await query.OrderByDescending(x => x.Date).ThenByDescending(x => x.Id)
            .Skip(offset).Take(pageSize).ToArrayAsync(ct);
        return new(items.Select(ExpenseResponse.From).ToArray(), page, pageSize, count);
    }

    public async Task<ExpenseResponse> Get(Guid id, CancellationToken ct) =>
        ExpenseResponse.From(await db.Expenses.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw ApiException.Missing());

    public async Task<ExpenseResponse> Save(Guid? id, ExpenseInput input, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        if (input.AmountMinor is < 1 or > MaxAmount)
            errors["amountMinor"] = ["Сума має бути від 0,01 до 100 000 000,00 ₴."];
        if (!DateOnly.TryParseExact(input.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var date) || input.Date?.Length != 10 || date.Year is < 1900 or > 9998)
            errors["date"] = ["Укажіть справжню дату (1900–9998)."]; 
        if (!await db.Categories.AnyAsync(x => x.Id == input.CategoryId, ct))
            errors["categoryId"] = ["Оберіть наявну категорію."];
        var note = input.Note?.Trim() ?? "";
        if (note.Length > 200) errors["note"] = ["Примітка має містити не більше 200 символів."];
        if (errors.Count > 0) throw new ApiException(400, "validation_failed", "Перевірте введені дані.", errors);

        var now = DateTimeOffset.UtcNow;
        var expense = id.HasValue
            ? await db.Expenses.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw ApiException.Missing()
            : new Expense { Id = Guid.NewGuid(), CreatedAtUtc = now };
        expense.AmountMinor = input.AmountMinor;
        expense.Date = date;
        expense.CategoryId = input.CategoryId;
        expense.Note = note;
        expense.UpdatedAtUtc = now;
        if (!id.HasValue) db.Expenses.Add(expense);
        await db.SaveChangesAsync(ct);
        return ExpenseResponse.From(expense);
    }

    public async Task Delete(Guid id, CancellationToken ct)
    {
        var count = await db.Expenses.Where(x => x.Id == id).ExecuteDeleteAsync(ct);
        if (count == 0) throw ApiException.Missing();
    }

    public async Task<MonthSummary> Summary(string? month, CancellationToken ct)
    {
        var (start, end) = MonthRange(month);
        var totals = new Dictionary<int, (long Amount, int Count)>();
        try
        {
            // Stream integer values to detect overflow before a database SUM can overflow.
            await foreach (var item in db.Expenses.AsNoTracking().Where(x => x.Date >= start && x.Date < end)
                .Select(x => new { x.CategoryId, x.AmountMinor }).AsAsyncEnumerable().WithCancellation(ct))
            {
                var previous = totals.GetValueOrDefault(item.CategoryId);
                totals[item.CategoryId] = (checked(previous.Amount + item.AmountMinor), checked(previous.Count + 1));
            }
            return BuildSummary(month!, totals.Select(x => new CategoryTotal(x.Key, x.Value.Amount, x.Value.Count)));
        }
        catch (OverflowException) { throw RangeExceeded(); }
    }

    public static MonthSummary BuildSummary(string month, IEnumerable<CategoryTotal> totals)
    {
        try
        {
            var categories = totals.OrderByDescending(x => x.AmountMinor).ThenBy(x => x.CategoryId).ToArray();
            var total = categories.Aggregate(0L, (sum, x) => checked(sum + x.AmountMinor));
            if (total > MaxSafeInteger) throw RangeExceeded();
            return new(month, "UAH", total, categories.Sum(x => x.ExpenseCount), categories.FirstOrDefault()?.CategoryId, categories);
        }
        catch (OverflowException) { throw RangeExceeded(); }
    }

    private static ApiException RangeExceeded() => new(422, "summary_range_exceeded", "Підсумок перевищує допустимий діапазон.");
}
