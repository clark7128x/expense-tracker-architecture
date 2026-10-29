using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using ExpenseTracker.Api.Contracts;
using ExpenseTracker.Api.Data;
using ExpenseTracker.Api.Features.Expenses;
using ExpenseTracker.Api.Infrastructure.Errors;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ExpenseTracker.Api.Tests;

public sealed class TestApp : WebApplicationFactory<Program>
{
    public string DataPath { get; } = Path.Combine(Path.GetTempPath(), "expense-tests-" + Guid.NewGuid());
    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
            new Dictionary<string, string?> { ["DataDirectory"] = DataPath }));

    public async Task<HttpClient> Start()
    {
        var client = CreateClient();
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        SqliteConnection.ClearAllPools();
        if (Directory.Exists(DataPath)) Directory.Delete(DataPath, true);
    }
}

public sealed class ApiTests
{
    private static ExpenseInput Input(long amount = 12550, string date = "2026-10-29", int category = 1, string? note = null) => new(amount, date, category, note);
    private static async Task<ExpenseResponse> Create(HttpClient client, ExpenseInput input)
    {
        var response = await client.PostAsJsonAsync("/api/v1/expenses", input);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var expense = (await response.Content.ReadFromJsonAsync<ExpenseResponse>())!;
        Assert.Equal($"/api/v1/expenses/{expense.Id}", response.Headers.Location!.ToString());
        return expense;
    }

    [Fact]
    public async Task CrudPreservesMoneyTimestampsAndNormalizesNotes()
    {
        using var app = new TestApp(); using var client = await app.Start();
        var expense = await Create(client, Input(note: "  вечеря  "));
        Assert.Equal("вечеря", expense.Note); Assert.Equal(12550, expense.AmountMinor);
        var read = await client.GetFromJsonAsync<ExpenseResponse>($"/api/v1/expenses/{expense.Id}");
        Assert.Equal(expense, read);
        var update = await client.PutAsJsonAsync($"/api/v1/expenses/{expense.Id}", Input(500, "2026-11-01", 2));
        var updated = (await update.Content.ReadFromJsonAsync<ExpenseResponse>())!;
        Assert.Equal(expense.CreatedAtUtc, updated.CreatedAtUtc);
        Assert.True(updated.UpdatedAtUtc >= expense.UpdatedAtUtc);
        Assert.Equal(2, updated.CategoryId); Assert.Equal("", updated.Note);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/v1/expenses/{expense.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/expenses/{expense.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/v1/expenses/{expense.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync($"/api/v1/expenses/{expense.Id}", Input())).StatusCode);
    }

    [Theory]
    [InlineData(0)] [InlineData(-1)] [InlineData(10000000001)]
    public async Task InvalidAmounts(long amount)
    {
        using var app = new TestApp(); using var client = await app.Start();
        await AssertProblem(await client.PostAsJsonAsync("/api/v1/expenses", Input(amount)), 400, "validation_failed");
    }

    [Theory]
    [InlineData("{}")] [InlineData("{bad")]
    [InlineData("{\"amountMinor\":\"12550\",\"date\":\"2026-10-01\",\"categoryId\":1}")]
    [InlineData("{\"amountMinor\":null,\"date\":\"2026-10-01\",\"categoryId\":1}")]
    [InlineData("{\"amountMinor\":1.1,\"date\":\"2026-10-01\",\"categoryId\":1}")]
    [InlineData("{\"amountMinor\":1,\"date\":\"2026-10-01\",\"categoryId\":1,\"extra\":true}")]
    [InlineData("{\"amountMinor\":1,\"date\":\"2026-02-29\",\"categoryId\":1}")]
    [InlineData("{\"amountMinor\":1,\"date\":\"2026-1-01\",\"categoryId\":1}")]
    [InlineData("{\"amountMinor\":1,\"date\":\"1899-12-31\",\"categoryId\":1}")]
    [InlineData("{\"amountMinor\":1,\"date\":\"9999-01-01\",\"categoryId\":1}")]
    [InlineData("{\"amountMinor\":1,\"date\":\"2026-10-01\",\"categoryId\":999}")]
    public async Task RejectsInvalidBodies(string body)
    {
        using var app = new TestApp(); using var client = await app.Start();
        await AssertProblem(await client.PostAsync("/api/v1/expenses", new StringContent(body, Encoding.UTF8, "application/json")), 400, "validation_failed");
    }

    [Theory]
    [InlineData("/expenses/not-a-guid")]
    [InlineData("/expenses")] [InlineData("/expenses?month=2026-13")]
    [InlineData("/expenses?month=2026-10&page=0")]
    [InlineData("/expenses?month=2026-10&page=2147483647&pageSize=100")]
    [InlineData("/expenses?month=2026-10&pageSize=101")]
    [InlineData("/expenses?month=2026-10&pageSize=0")]
    [InlineData("/expenses?month=2026-10&page=abc")]
    [InlineData("/expenses?month=2026-10&categoryId=999")]
    [InlineData("/summary?month=9999-01")] [InlineData("/summary?month=1899-12")]
    [InlineData("/summary?month=2026-10&categoryId=1")]
    public async Task RejectsInvalidQueries(string path)
    {
        using var app = new TestApp(); using var client = await app.Start();
        await AssertProblem(await client.GetAsync("/api/v1" + path), 400, "validation_failed");
    }

    [Fact]
    public async Task ExactTotalsTiesAndMonthBoundaries()
    {
        using var app = new TestApp(); using var client = await app.Start();
        await Create(client, Input(1, "2024-02-01", 2));
        await Create(client, Input(2, "2024-02-29", 2));
        await Create(client, Input(3, "2024-02-29", 1));
        await Create(client, Input(99, "2024-03-01"));
        var summary = (await client.GetFromJsonAsync<MonthSummary>("/api/v1/summary?month=2024-02"))!;
        Assert.Equal(6, summary.TotalMinor); Assert.Equal(1, summary.TopCategoryId);
        Assert.Equal(3, summary.ByCategory.Single(x => x.CategoryId == 2).AmountMinor);
        Assert.Equal(new[] { 1, 2 }, summary.ByCategory.Select(x => x.CategoryId));
        var filtered = (await client.GetFromJsonAsync<ExpensePage>("/api/v1/expenses?month=2024-02&categoryId=2&pageSize=1"))!;
        Assert.Equal(2, filtered.TotalCount); Assert.Single(filtered.Items); Assert.Equal(new DateOnly(2024, 2, 29), filtered.Items[0].Date);
        var emptyPage = (await client.GetFromJsonAsync<ExpensePage>("/api/v1/expenses?month=2024-02&page=10"))!;
        Assert.Empty(emptyPage.Items); Assert.Equal(3, emptyPage.TotalCount);
        await Create(client, Input(10, "2026-12-31")); await Create(client, Input(20, "2027-01-01"));
        Assert.Equal(10, (await client.GetFromJsonAsync<MonthSummary>("/api/v1/summary?month=2026-12"))!.TotalMinor);
        var empty = (await client.GetFromJsonAsync<MonthSummary>("/api/v1/summary?month=1900-01"))!;
        Assert.Equal(0, empty.TotalMinor); Assert.Null(empty.TopCategoryId); Assert.Empty(empty.ByCategory);
    }

    [Fact]
    public async Task StablePaginationAndUtf16NoteLength()
    {
        using var app = new TestApp(); using var client = await app.Start();
        var notes = string.Concat(Enumerable.Repeat("😀", 100));
        var a = await Create(client, Input(note: notes));
        var b = await Create(client, Input(ExpenseService.MaxAmount));
        await AssertProblem(await client.PostAsJsonAsync("/api/v1/expenses", Input(note: notes + "x")), 400, "validation_failed");
        var all = (await client.GetFromJsonAsync<ExpensePage>("/api/v1/expenses?month=2026-10"))!;
        var second = (await client.GetFromJsonAsync<ExpensePage>("/api/v1/expenses?month=2026-10&pageSize=1&page=2"))!;
        Assert.Equal(all.Items[1].Id, second.Items[0].Id);
        Assert.Equal(new[] { a.Id.ToString(), b.Id.ToString() }.OrderDescending(), all.Items.Select(x => x.Id.ToString()));
    }

    [Fact]
    public async Task MigrationsConstraintsAndReopening()
    {
        using var app = new TestApp(); using var client = await app.Start();
        var saved = await Create(client, Input());
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.MigrateAsync();
            Assert.Equal(7, await db.Categories.CountAsync());
            await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync("UPDATE Expenses SET AmountMinor = 0"));
            await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync("UPDATE Expenses SET Currency = 'USD'"));
            await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync("UPDATE Expenses SET CategoryId = 999"));
        }
        SqliteConnection.ClearAllPools();
        using var reopened = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite($"Data Source={Path.Combine(app.DataPath, "expenses.db")};Foreign Keys=True").Options);
        Assert.Equal(12550, (await reopened.Expenses.SingleAsync(x => x.Id == saved.Id)).AmountMinor);
    }

    [Fact]
    public async Task ErrorContractsAndOpenApi()
    {
        using var app = new TestApp(); using var client = await app.Start();
        await AssertProblem(await client.GetAsync("/api/unknown"), 404, "route_not_found");
        await AssertProblem(await client.PostAsync("/api/v1/expenses", new StringContent("x")), 415, "validation_failed");
        var openapi = await client.GetStringAsync("/openapi/v1.json");
        using var schema = JsonDocument.Parse(openapi);
        var paths = schema.RootElement.GetProperty("paths");
        Assert.Equal(4, paths.EnumerateObject().Count());
        Assert.True(paths.GetProperty("/api/v1/categories").TryGetProperty("get", out _));
        Assert.True(paths.GetProperty("/api/v1/summary").TryGetProperty("get", out _));
        Assert.True(paths.GetProperty("/api/v1/expenses").TryGetProperty("post", out _));
        foreach (var method in new[] { "get", "put", "delete" })
            Assert.True(paths.GetProperty("/api/v1/expenses/{id}").TryGetProperty(method, out _));
        using (var scope = app.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.ExecuteSqlRawAsync("DROP TABLE Expenses");
        var failed = await client.GetAsync("/api/v1/expenses?month=2026-10");
        await AssertProblem(failed, 500, "internal_error");
        var text = await failed.Content.ReadAsStringAsync();
        Assert.DoesNotContain("Sqlite", text); Assert.DoesNotContain(app.DataPath, text);
    }

    [Fact]
    public void SummaryAndOffsetRangeChecks()
    {
        Assert.Equal(ExpenseService.MaxSafeInteger, ExpenseService.BuildSummary("2026-10", [new(1, ExpenseService.MaxSafeInteger, 1)]).TotalMinor);
        Assert.Equal(422, Assert.Throws<ApiException>(() => ExpenseService.BuildSummary("2026-10", [new(1, ExpenseService.MaxSafeInteger + 1, 1)])).Status);
        Assert.Equal(422, Assert.Throws<ApiException>(() => ExpenseService.BuildSummary("2026-10", [new(1, long.MaxValue, 1), new(2, 1, 1)])).Status);
        Assert.Equal(0, ExpenseService.PageOffset(1, 100));
        Assert.Equal(400, Assert.Throws<ApiException>(() => ExpenseService.PageOffset(int.MaxValue, 100)).Status);
    }

    private static async Task AssertProblem(HttpResponseMessage response, int status, string code)
    {
        Assert.Equal(status, (int)response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(code, problem.GetProperty("code").GetString());
        Assert.False(string.IsNullOrEmpty(problem.GetProperty("traceId").GetString()));
    }
}
