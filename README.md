# Expense Tracker

A local expense tracker built with ASP.NET Core, React, TypeScript and SQLite. Record expenses, filter monthly history and review spending by category.

## Features

- Add, edit and delete expenses with confirmation.
- Filter history by month and category, with server-side pagination.
- View monthly totals and category breakdowns.
- Store UAH amounts as integer minor units and expense dates as calendar dates.
- Use a responsive Ukrainian interface with keyboard-accessible controls.
- Keep records locally in SQLite with EF Core migrations.

## Stack

ASP.NET Core 10, EF Core 10, SQLite, React 19, TypeScript, Vite and TanStack Query.

Tests use xUnit, SQLite, Vitest, Testing Library and Playwright.

## Requirements

- .NET SDK 10.0.403 (pinned in `global.json`)
- Node.js 24.15.0 or newer in the 24.x release line
- npm
- Microsoft Edge for the browser tests

## Quick start

Run these commands in PowerShell from the project root:

```powershell
dotnet restore
npm --prefix src/expense-tracker-web ci
npm --prefix src/expense-tracker-web run build

New-Item -ItemType Directory -Force src/ExpenseTracker.Api/wwwroot | Out-Null
Copy-Item src/expense-tracker-web/dist/* src/ExpenseTracker.Api/wwwroot -Recurse -Force

dotnet build
dotnet run --no-build --project src/ExpenseTracker.Api -- --migrate
dotnet run --no-build --project src/ExpenseTracker.Api
```

Open [localhost:5080](http://localhost:5080). ASP.NET Core serves both the frontend and API. Stop the server with Ctrl+C.

The migration command creates the database and seeds seven categories without sample expenses. Run it before first startup and after adding migrations.

## Development

Start the API, then run the frontend in another terminal:

```powershell
npm --prefix src/expense-tracker-web run dev
```

Open [localhost:5173](http://localhost:5173). Vite proxies API requests to port 5080.

The API is available at `/api/v1`; generated OpenAPI is available at `/openapi/v1.json`.

To create a database migration:

```powershell
dotnet tool restore
dotnet ef migrations add MigrationName --project src/ExpenseTracker.Api --output-dir Data/Migrations
```

## Tests

Complete the quick-start build steps first, then stop the server and run sequentially:

```powershell
dotnet test
npm --prefix src/expense-tracker-web test
npm --prefix src/expense-tracker-web run test:e2e
node tests/e2e/persistence.mjs
```

API tests use isolated SQLite databases. Browser tests start their own server and cover desktop and 360 px layouts. The persistence check verifies records survive a server restart. Port 5080 must be free.

## Data

The default database is `src/ExpenseTracker.Api/local-data/expenses.db`. Set the `DataDirectory` environment variable to an absolute directory before migration and startup to use another location.

For backups, stop the server and copy the complete data directory, including SQLite sidecar files. Restore only while the server is stopped. Databases, dependencies and build output are excluded from Git.

## Scope

Designed for one user on localhost, with UAH currency and fixed categories. Authentication, budgets, banking integrations and cloud deployment are not included. After a network failure during a write, refresh history before retrying to avoid duplicate entries.
