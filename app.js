// password: change-me-now
const PASSWORD_SHA256 = '4f6d054536d6613a91472139cc60f0729702665f48f59a9b56208079c9d31f97';
const API_BASE = 'https://eastern-shore-ai-contact.99redder.workers.dev';
const USER_ID = 'chris';

const authOverlay = document.getElementById('auth-overlay');
const authPassword = document.getElementById('auth-password');
const authSubmit = document.getElementById('auth-submit');
const authError = document.getElementById('auth-error');
const app = document.getElementById('app');
const syncPill = document.getElementById('sync-pill');

const taskTitle = document.getElementById('task-title');
const taskDate = document.getElementById('task-date');
const addTaskBtn = document.getElementById('add-task');
const taskList = document.getElementById('task-list');

let tasks = [];

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || 'Request failed');
  return data;
}

function setSync(text, ok = true) {
  syncPill.textContent = text;
  syncPill.style.color = ok ? 'var(--muted)' : '#ff8fb3';
}

async function loadTasks() {
  setSync('Syncing…');
  const data = await api(`/api/planner/items?userId=${encodeURIComponent(USER_ID)}`);
  tasks = Array.isArray(data.items) ? data.items : [];
  setSync('Synced');
  render();
}

function escapeHtml(v) {
  return String(v || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render() {
  const sorted = [...tasks].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  taskList.innerHTML = sorted.map(t => `
    <div class="item ${t.status === 'done' ? 'done' : ''}">
      <div>
        <div class="title">${escapeHtml(t.title)}</div>
        <div>${escapeHtml(t.due_date || 'No date')}</div>
      </div>
      <div class="actions">
        <input type="date" value="${escapeHtml(t.due_date || '')}" data-id="${t.id}" data-act="date" style="width:140px;padding:6px;" />
        <button data-id="${t.id}" data-act="toggle">${t.status === 'done' ? 'Undo' : 'Done'}</button>
        <button data-id="${t.id}" data-act="delete">Delete</button>
      </div>
    </div>
  `).join('');
}

addTaskBtn.addEventListener('click', async () => {
  const title = taskTitle.value.trim();
  const dueDate = taskDate.value || null;
  if (!title) return;
  try {
    setSync('Syncing…');
    await api('/api/planner/items', {
      method: 'POST',
      body: JSON.stringify({ userId: USER_ID, kind: 'task', title, dueDate, source: 'lookahead-app' })
    });
    taskTitle.value = '';
    await loadTasks();
  } catch (err) {
    setSync(err.message || 'Sync error', false);
  }
});

taskList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  try {
    setSync('Syncing…');
    if (act === 'toggle') {
      await api('/api/planner/items/toggle', { method: 'POST', body: JSON.stringify({ id }) });
    }
    if (act === 'delete') {
      await api('/api/planner/items/delete', { method: 'POST', body: JSON.stringify({ id }) });
    }
    await loadTasks();
  } catch (err) {
    setSync(err.message || 'Sync error', false);
  }
});

taskList.addEventListener('change', async (e) => {
  const input = e.target.closest('input[data-act="date"]');
  if (!input) return;
  const id = input.dataset.id;
  const dueDate = input.value;
  if (!id || !dueDate) return;
  try {
    setSync('Syncing…');
    await api('/api/planner/items/reschedule', { method: 'POST', body: JSON.stringify({ id, dueDate }) });
    await loadTasks();
  } catch (err) {
    setSync(err.message || 'Sync error', false);
  }
});

authSubmit.addEventListener('click', async () => {
  authError.textContent = '';
  const hash = await sha256Hex(authPassword.value || '');
  if (hash !== PASSWORD_SHA256) {
    authError.textContent = 'Wrong password.';
    return;
  }
  authOverlay.classList.add('hidden');
  app.classList.remove('hidden');
  await loadTasks();
});
