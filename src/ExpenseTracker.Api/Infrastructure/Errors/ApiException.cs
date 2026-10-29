namespace ExpenseTracker.Api.Infrastructure.Errors;

public sealed class ApiException(int status, string code, string message,
    IDictionary<string, string[]>? errors = null) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public IDictionary<string, string[]>? Errors { get; } = errors;

    public static ApiException Invalid(string field, string message) =>
        new(400, "validation_failed", "Перевірте введені дані.", new Dictionary<string, string[]> { [field] = [message] });

    public static ApiException Missing() => new(404, "expense_not_found", "Цієї витрати вже немає.");
}
