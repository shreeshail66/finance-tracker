// app.js
const API = '/api';
let token = localStorage.getItem('ft_token');
let username = localStorage.getItem('ft_username');

let categoryChart = null;
let monthlyChart = null;

// ---------- Element refs ----------
const authScreen = document.getElementById('authScreen');
const dashboard = document.getElementById('dashboard');
const authError = document.getElementById('authError');

// ---------- Tab switching ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('loginForm').classList.toggle('hidden', btn.dataset.tab !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', btn.dataset.tab !== 'register');
    authError.classList.add('hidden');
  });
});

// ---------- Auth ----------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    username: document.getElementById('loginUsername').value.trim(),
    password: document.getElementById('loginPassword').value
  };
  await authRequest('/login', body);
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    username: document.getElementById('registerUsername').value.trim(),
    password: document.getElementById('registerPassword').value
  };
  await authRequest('/register', body);
});

async function authRequest(path, body) {
  authError.classList.add('hidden');
  try {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    token = data.token;
    username = data.username;
    localStorage.setItem('ft_token', token);
    localStorage.setItem('ft_username', username);
    showDashboard();
  } catch (err) {
    authError.textContent = err.message;
    authError.classList.remove('hidden');
  }
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  token = null;
  localStorage.removeItem('ft_token');
  localStorage.removeItem('ft_username');
  dashboard.classList.add('hidden');
  authScreen.classList.remove('hidden');
});

// ---------- Authenticated fetch helper ----------
async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    // token expired/invalid - force logout
    document.getElementById('logoutBtn').click();
    throw new Error('Session expired, please log in again');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---------- Dashboard bootstrap ----------
function showDashboard() {
  authScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');
  document.getElementById('welcomeUser').textContent = 'Hi, ' + username;
  document.getElementById('expDate').valueAsDate = new Date();
  loadAll();
}

async function loadAll() {
  await Promise.all([loadExpenses(), loadBudgets(), loadCategoryChart(), loadMonthlyChart(), loadAlerts()]);
}

// ---------- Expenses ----------
document.getElementById('expenseForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    date: document.getElementById('expDate').value,
    category: document.getElementById('expCategory').value.trim(),
    amount: document.getElementById('expAmount').value,
    description: document.getElementById('expDescription').value.trim()
  };
  try {
    await api('/expenses', { method: 'POST', body: JSON.stringify(body) });
    e.target.reset();
    document.getElementById('expDate').valueAsDate = new Date();
    loadAll();
  } catch (err) {
    alert(err.message);
  }
});

async function loadExpenses() {
  const expenses = await api('/expenses');
  const tbody = document.getElementById('expenseTableBody');
  tbody.innerHTML = '';
  expenses.forEach(exp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${exp.date}</td>
      <td>${escapeHtml(exp.category)}</td>
      <td>$${exp.amount.toFixed(2)}</td>
      <td>${escapeHtml(exp.description || '')}</td>
      <td><button class="del-row-btn" data-id="${exp.id}">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.del-row-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this expense?')) return;
      await api('/expenses/' + btn.dataset.id, { method: 'DELETE' });
      loadAll();
    });
  });
}

// ---------- Budgets ----------
document.getElementById('budgetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    category: document.getElementById('budCategory').value.trim(),
    limit: document.getElementById('budLimit').value
  };
  try {
    await api('/budgets', { method: 'POST', body: JSON.stringify(body) });
    e.target.reset();
    loadAll();
  } catch (err) {
    alert(err.message);
  }
});

async function loadBudgets() {
  const budgets = await api('/budgets');
  const { breakdown } = await api('/reports/category');
  const spendMap = {};
  breakdown.forEach(b => { spendMap[b.category] = b.total; });

  const list = document.getElementById('budgetList');
  list.innerHTML = '';
  budgets.forEach(b => {
    const spent = spendMap[b.category] || 0;
    const pct = b.limit > 0 ? Math.min(100, Math.round((spent / b.limit) * 100)) : 0;
    const over = spent > b.limit;
    const li = document.createElement('li');
    li.innerHTML = `
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between">
          <span>${escapeHtml(b.category)}</span>
          <span>$${spent.toFixed(2)} / $${b.limit.toFixed(2)}</span>
        </div>
        <div class="progress"><div class="progress-fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
      </div>
      <button class="del-btn" data-id="${b.id}" title="Remove budget">✕</button>
    `;
    list.appendChild(li);
  });
  list.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api('/budgets/' + btn.dataset.id, { method: 'DELETE' });
      loadAll();
    });
  });
}

// ---------- Budget Alerts ----------
async function loadAlerts() {
  const alerts = await api('/budget-alerts');
  const banner = document.getElementById('alertsBanner');
  if (alerts.length === 0) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  banner.innerHTML = '<strong>⚠️ Budget Alerts</strong>' + alerts.map(a => {
    const status = a.pct >= 100 ? 'exceeded' : 'is close to';
    return `${escapeHtml(a.category)}: $${a.spent.toFixed(2)} of $${a.limit.toFixed(2)} (${a.pct}%) — ${status} the limit`;
  }).join('<br>');
}

// ---------- Charts ----------
async function loadCategoryChart() {
  const { breakdown } = await api('/reports/category');
  const ctx = document.getElementById('categoryChart');
  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: breakdown.map(b => b.category),
      datasets: [{
        data: breakdown.map(b => b.total),
        backgroundColor: ['#2563eb', '#0ea5e9', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ec4899', '#64748b']
      }]
    },
    options: { responsive: true, maintainAspectRatio: true }
  });
}

async function loadMonthlyChart() {
  const data = await api('/reports/monthly');
  const ctx = document.getElementById('monthlyChart');
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.month),
      datasets: [{ label: 'Total Spent', data: data.map(d => d.total), backgroundColor: '#2563eb' }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: { y: { beginAtZero: true } }
    }
  });
}

// ---------- CSV Export ----------
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  const month = document.getElementById('exportMonth').value;
  const url = `${API}/export/csv${month ? '?month=' + month : ''}`;
  fetch(url, { headers: { Authorization: 'Bearer ' + token } })
    .then(res => res.blob())
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = month ? `expenses-${month}.csv` : 'expenses-all.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
    })
    .catch(() => alert('Export failed'));
});

// ---------- Utils ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Init ----------
if (token) {
  showDashboard();
}
