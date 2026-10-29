using ExpenseTracker.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Expense> Expenses => Set<Expense>();
    public DbSet<Category> Categories => Set<Category>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        var category = model.Entity<Category>();
        category.Property(x => x.Name).HasMaxLength(50).IsRequired();
        category.HasIndex(x => x.Name).IsUnique();
        string[] names = ["Продукти", "Транспорт", "Житло", "Здоров’я", "Дозвілля", "Покупки", "Інше"];
        category.HasData(names.Select((name, i) => new Category { Id = i + 1, Name = name, SortOrder = i + 1 }));

        var expense = model.Entity<Expense>();
        expense.ToTable("Expenses", table =>
        {
            table.HasCheckConstraint("CK_Expenses_Amount", "AmountMinor BETWEEN 1 AND 10000000000");
            table.HasCheckConstraint("CK_Expenses_Currency", "Currency = 'UAH'");
        });
        expense.Property(x => x.Currency).IsRequired();
        expense.Property(x => x.Note).IsRequired();
        expense.HasOne<Category>().WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
        expense.HasIndex(x => new { x.Date, x.Id });
        expense.HasIndex(x => new { x.CategoryId, x.Date, x.Id });
    }
}
