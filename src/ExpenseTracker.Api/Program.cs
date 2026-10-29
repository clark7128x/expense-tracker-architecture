using System.Text.Json.Serialization;
using ExpenseTracker.Api.Contracts;
using ExpenseTracker.Api.Data;
using ExpenseTracker.Api.Features.Expenses;
using ExpenseTracker.Api.Infrastructure.Errors;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://localhost:5080");
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow;
    options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict;
});
builder.Services.Configure<Microsoft.AspNetCore.Routing.RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);
builder.Services.AddOpenApi();
builder.Services.AddScoped<ExpenseService>();
builder.Services.AddDbContext<AppDbContext>((services, options) =>
{
    var config = services.GetRequiredService<IConfiguration>();
    var environment = services.GetRequiredService<IHostEnvironment>();
    var dataDirectory = Path.GetFullPath(config["DataDirectory"] ?? Path.Combine(environment.ContentRootPath, "local-data"));
    Directory.CreateDirectory(dataDirectory);
    options.UseSqlite(new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder
    { DataSource = Path.Combine(dataDirectory, "expenses.db"), ForeignKeys = true }.ToString());
});
var app = builder.Build();

if (args.Contains("--migrate"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
    return;
}

app.Use(async (context, next) =>
{
    try
    {
        if ((HttpMethods.IsPost(context.Request.Method) || HttpMethods.IsPut(context.Request.Method))
            && context.Request.Path.StartsWithSegments("/api/v1/expenses") && !context.Request.HasJsonContentType())
            throw new ApiException(415, "validation_failed", "Надішліть дані у форматі JSON.");
        await next(context);
    }
    catch (Exception exception)
    {
        var status = exception switch { ApiException e => e.Status, BadHttpRequestException e => e.StatusCode, _ => 500 };
        var code = exception is ApiException known ? known.Code : status == 500 ? "internal_error" : "validation_failed";
        var title = exception is ApiException expected ? expected.Message : status == 500
            ? "Не вдалося виконати запит. Спробуйте ще раз." : "Перевірте формат запиту та введені дані.";
        if (status == 500) app.Logger.LogError(exception, "Request failed. TraceId: {TraceId}", context.TraceIdentifier);
        var extensions = new Dictionary<string, object?> { ["code"] = code, ["traceId"] = context.TraceIdentifier };
        if (exception is ApiException { Errors: not null } invalid) extensions["errors"] = invalid.Errors;
        await Results.Problem(statusCode: status, title: title, extensions: extensions).ExecuteAsync(context);
    }
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapOpenApi();
var api = app.MapGroup("/api/v1").ProducesProblem(400).ProducesProblem(500);
api.MapGet("/categories", async (AppDbContext db, CancellationToken ct) =>
    await db.Categories.AsNoTracking().OrderBy(x => x.SortOrder).ThenBy(x => x.Id)
        .Select(x => new CategoryResponse(x.Id, x.Name, x.SortOrder)).ToArrayAsync(ct));
api.MapGet("/expenses", (string month, int? categoryId, int? page, int? pageSize, ExpenseService service, CancellationToken ct) =>
    service.List(month, categoryId, page ?? 1, pageSize ?? 25, ct));
api.MapGet("/expenses/{id}", (Guid id, ExpenseService service, CancellationToken ct) => service.Get(id, ct)).ProducesProblem(404);
api.MapPost("/expenses", async (ExpenseInput input, ExpenseService service, CancellationToken ct) =>
{
    var expense = await service.Save(null, input, ct);
    return Results.Created($"/api/v1/expenses/{expense.Id}", expense);
}).Produces<ExpenseResponse>(StatusCodes.Status201Created).ProducesProblem(415);
api.MapPut("/expenses/{id}", (Guid id, ExpenseInput input, ExpenseService service, CancellationToken ct) => service.Save(id, input, ct)).ProducesProblem(404).ProducesProblem(415);
api.MapDelete("/expenses/{id}", async (Guid id, ExpenseService service, CancellationToken ct) =>
{
    await service.Delete(id, ct);
    return Results.NoContent();
}).Produces(StatusCodes.Status204NoContent).ProducesProblem(404);
api.MapGet("/summary", (string month, HttpRequest request, ExpenseService service, CancellationToken ct) =>
{
    if (request.Query.ContainsKey("categoryId"))
        throw ApiException.Invalid("categoryId", "Підсумки охоплюють усі категорії.");
    return service.Summary(month, ct);
}).ProducesProblem(422);
app.MapFallback("/api/{**path}", (HttpContext context) => Results.Problem(statusCode: 404,
    title: "Маршрут не знайдено.", extensions: new Dictionary<string, object?>
    { ["code"] = "route_not_found", ["traceId"] = context.TraceIdentifier }));
app.MapFallbackToFile("index.html");
app.Run();

public partial class Program;
