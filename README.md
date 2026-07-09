 
 ## 🚀 Live Demo

👉 **[Click Here to View the Live Project](https://finance-tracker-tau-gules.vercel.app/)**

# Personal Finance Tracker

A full-stack personal finance tracker with login, expense tracking, monthly
reports, charts, budget alerts, and CSV export.

## Tech Stack
- **Backend:** Node.js + Express
- **Auth:** JWT (jsonwebtoken) + password hashing (bcryptjs)
- **Storage:** lowdb (a simple JSON-file database — no separate database
  server to install or configure)
- **Frontend:** Plain HTML/CSS/JavaScript + Chart.js (loaded from CDN)

## Packages to install

From inside the `finance-tracker` folder, run:

```bash
npm install
```

This installs everything listed in `package.json`:

| Package | Purpose |
|---|---|
| express | Web server & REST API |
| cors | Allow cross-origin requests (handy if you split front/back end later) |
| bcryptjs | Hash and verify passwords |
| jsonwebtoken | Issue & verify login session tokens |
| lowdb | Lightweight JSON file database (no native build step, works everywhere) |
| nodemon (dev only) | Auto-restarts server while developing |

## Running it

```bash
npm install
npm start
```

Then open **http://localhost:4000** in your browser.

To auto-restart on file changes while developing:
```bash
npm run dev
```

## How it works

- **Login/Register:** `/api/register` and `/api/login` issue a JWT that the
  browser stores in `localStorage` and sends as `Authorization: Bearer <token>`
  on every request.
- **Expense tracking:** CRUD endpoints under `/api/expenses`, scoped per
  logged-in user.
- **Monthly reports:** `/api/reports/monthly` aggregates totals by month;
  `/api/reports/category` aggregates totals by category for a given month.
- **Charts:** the dashboard renders a pie chart (spend by category this
  month) and a bar chart (monthly trend) using Chart.js.
- **Budget alerts:** set a monthly limit per category. `/api/budget-alerts`
  flags any category at 80%+ of its budget, shown as a banner on the
  dashboard.
- **CSV export:** `/api/export/csv` streams a CSV download of all expenses,
  optionally filtered to one month (`?month=YYYY-MM`).

## Data storage

All data lives in `db.json` in the project root. It's a plain JSON file —
easy to inspect, back up, or reset (just put `{"users":[],"expenses":[],"budgets":[]}`
back into it). For a production deployment, swap `lowdb` for a real database
(Postgres/MySQL/SQLite) — the route logic would stay almost identical.

## Security notes for production use

- Set a strong `JWT_SECRET` environment variable instead of relying on the
  fallback in the code.
- Serve over HTTPS.
- Add rate limiting on `/api/login` and `/api/register` to deter brute force.
