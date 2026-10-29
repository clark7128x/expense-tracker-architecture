namespace ExpenseTracker.Api.Domain;

public sealed class Expense
{
    public Guid Id { get; set; }
    public long AmountMinor { get; set; }
    public string Currency { get; set; } = "UAH";
    public DateOnly Date { get; set; }
    public int CategoryId { get; set; }
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }
}

public sealed class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int SortOrder { get; set; }
}
