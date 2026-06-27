// server.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const PORT = process.env.PORT || 4000;

// ---- DB setup (simple JSON file, no native build tools needed) ----
const adapter = new FileSync(path.join(__dirname, 'db.json'));
const db = low(adapter);
db.defaults({ users: [], expenses: [], budgets: [] }).write();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- Auth middleware ----
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ================= AUTH ROUTES =================

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  const existing = db.get('users').find({ username }).value();
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const hashed = bcrypt.hashSync(password, 10);
  const user = { id: genId(), username, password: hashed, createdAt: new Date().toISOString() };
  db.get('users').push(user).write();

  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.get('users').find({ username }).value();
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username });
});

// ================= EXPENSE ROUTES =================

app.get('/api/expenses', auth, (req, res) => {
  const expenses = db.get('expenses')
    .filter({ userId: req.userId })
    .orderBy(['date'], ['desc'])
    .value();
  res.json(expenses);
});

app.post('/api/expenses', auth, (req, res) => {
  const { date, category, amount, description } = req.body;
  if (!date || !category || amount === undefined) {
    return res.status(400).json({ error: 'date, category and amount are required' });
  }
  const expense = {
    id: genId(),
    userId: req.userId,
    date,
    category,
    amount: parseFloat(amount),
    description: description || ''
  };
  db.get('expenses').push(expense).write();
  res.status(201).json(expense);
});

app.put('/api/expenses/:id', auth, (req, res) => {
  const expense = db.get('expenses').find({ id: req.params.id, userId: req.userId }).value();
  if (!expense) return res.status(404).json({ error: 'Expense not found' });

  const { date, category, amount, description } = req.body;
  db.get('expenses')
    .find({ id: req.params.id })
    .assign({
      date: date ?? expense.date,
      category: category ?? expense.category,
      amount: amount !== undefined ? parseFloat(amount) : expense.amount,
      description: description ?? expense.description
    })
    .write();
  res.json(db.get('expenses').find({ id: req.params.id }).value());
});

app.delete('/api/expenses/:id', auth, (req, res) => {
  const expense = db.get('expenses').find({ id: req.params.id, userId: req.userId }).value();
  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  db.set('expenses', db.get('expenses').filter(e => e.id !== req.params.id).value()).write();
  res.json({ success: true });
});

// ================= REPORTS =================

// Monthly totals for the last 12 months
app.get('/api/reports/monthly', auth, (req, res) => {
  const expenses = db.get('expenses').filter({ userId: req.userId }).value();
  const totals = {};
  expenses.forEach(e => {
    const month = e.date.slice(0, 7); // YYYY-MM
    totals[month] = (totals[month] || 0) + e.amount;
  });
  const sorted = Object.entries(totals)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 }));
  res.json(sorted);
});

// Category breakdown for a given month (defaults to current month)
app.get('/api/reports/category', auth, (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const expenses = db.get('expenses')
    .filter(e => e.userId === req.userId && e.date.slice(0, 7) === month)
    .value();
  const totals = {};
  expenses.forEach(e => {
    totals[e.category] = (totals[e.category] || 0) + e.amount;
  });
  const result = Object.entries(totals).map(([category, total]) => ({
    category,
    total: Math.round(total * 100) / 100
  }));
  res.json({ month, breakdown: result });
});

// ================= BUDGETS & ALERTS =================

app.get('/api/budgets', auth, (req, res) => {
  res.json(db.get('budgets').filter({ userId: req.userId }).value());
});

app.post('/api/budgets', auth, (req, res) => {
  const { category, limit } = req.body;
  if (!category || limit === undefined) {
    return res.status(400).json({ error: 'category and limit are required' });
  }
  const existing = db.get('budgets').find({ userId: req.userId, category }).value();
  if (existing) {
    db.get('budgets').find({ userId: req.userId, category }).assign({ limit: parseFloat(limit) }).write();
  } else {
    db.get('budgets').push({ id: genId(), userId: req.userId, category, limit: parseFloat(limit) }).write();
  }
  res.json(db.get('budgets').filter({ userId: req.userId }).value());
});

app.delete('/api/budgets/:id', auth, (req, res) => {
  db.set('budgets', db.get('budgets').filter(b => !(b.id === req.params.id && b.userId === req.userId)).value()).write();
  res.json({ success: true });
});

// Alerts: categories where current-month spend has reached/exceeded the budget
app.get('/api/budget-alerts', auth, (req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  const budgets = db.get('budgets').filter({ userId: req.userId }).value();
  const expenses = db.get('expenses')
    .filter(e => e.userId === req.userId && e.date.slice(0, 7) === month)
    .value();

  const spendByCategory = {};
  expenses.forEach(e => {
    spendByCategory[e.category] = (spendByCategory[e.category] || 0) + e.amount;
  });

  const alerts = budgets
    .map(b => {
      const spent = spendByCategory[b.category] || 0;
      const pct = b.limit > 0 ? (spent / b.limit) * 100 : 0;
      return { category: b.category, limit: b.limit, spent: Math.round(spent * 100) / 100, pct: Math.round(pct) };
    })
    .filter(a => a.pct >= 80); // warn at 80%+, flag as exceeded at 100%+

  res.json(alerts);
});

// ================= CSV EXPORT =================

app.get('/api/export/csv', auth, (req, res) => {
  const month = req.query.month; // optional YYYY-MM filter
  let expenses = db.get('expenses').filter({ userId: req.userId }).value();
  if (month) {
    expenses = expenses.filter(e => e.date.slice(0, 7) === month);
  }
  expenses = [...expenses].sort((a, b) => a.date.localeCompare(b.date));

  const escapeCsv = (val) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const header = ['Date', 'Category', 'Amount', 'Description'];
  const rows = expenses.map(e => [e.date, e.category, e.amount.toFixed(2), e.description]);
  const csv = [header, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');

  const filename = month ? `expenses-${month}.csv` : 'expenses-all.csv';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// ---- Fallback to index.html for the SPA ----
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Personal Finance Tracker running at http://localhost:${PORT}`);
});
