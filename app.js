// password: change-me-now
const PASSWORD_SHA256 = 'ccc0b903bce51fb554262d742d0a282e1f8a87d064f1cf44f8ff5148ca4beb42';
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
const calendarGrid = document.getElementById('calendar-grid');
const calLabel = document.getElementById('cal-label');
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');

let tasks = [];
let calCursor = new Date();
let calAutoFocused = false;
let dragTaskId = null;
calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);

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

function ymdToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function autoFocusCalendarMonthFromTasks() {
  const open = tasks.filter(t => (t.status || 'open') !== 'done' && (t.due_date || '').trim());
  if (!open.length) return;
  const today = ymdToday();
  const future = open.filter(t => t.due_date >= today).sort((a,b) => a.due_date.localeCompare(b.due_date));
  const pick = future[0] || open.sort((a,b) => a.due_date.localeCompare(b.due_date))[0];
  if (!pick?.due_date) return;
  const [y,m] = pick.due_date.split('-').map(Number);
  if (!y || !m) return;
  calCursor = new Date(y, m - 1, 1);
  calAutoFocused = true;
}

async function loadTasks() {
  setSync('Syncing…');
  const data = await api(`/api/planner/items?userId=${encodeURIComponent(USER_ID)}&includeDone=1`);
  tasks = Array.isArray(data.items) ? data.items : [];
  if (!calAutoFocused) autoFocusCalendarMonthFromTasks();
  setSync('Synced');
  render();
}

function escapeHtml(v) {
  return String(v || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderCalendar() {
  const y = calCursor.getFullYear();
  const m = calCursor.getMonth();
  calLabel.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(calCursor);

  const first = new Date(y, m, 1);
  const startOffset = first.getDay(); // Sunday-based
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  dows.forEach(d => cells.push(`<div class="cal-dow">${d}</div>`));

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  for (let i = 0; i < startOffset; i++) cells.push('<div class="cal-day empty"></div>');

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayItems = tasks
      .filter(t => (t.due_date || '') === key)
      .sort((a,b) => (a.status === 'done') - (b.status === 'done'));
    const html = dayItems.slice(0, 4).map(t => `<div class="cal-item" draggable="true" data-drag-task-id="${t.id}">${escapeHtml(t.title)}</div>`).join('');
    const more = dayItems.length > 4 ? `<div class="cal-item">+${dayItems.length - 4} more</div>` : '';
    const isPast = key < todayKey;
    cells.push(`<div class="cal-day ${key === todayKey ? 'today' : ''} ${isPast ? 'past' : ''}" data-date="${key}"><div class="cal-day-num">${day}</div>${html}${more}</div>`);
  }

  while ((cells.length - 7) % 7 !== 0) cells.push('<div class="cal-day empty"></div>');
  calendarGrid.innerHTML = cells.join('');
}

function renderList() {
  const sorted = [...tasks].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  taskList.innerHTML = sorted.map(t => `
    <div class="item ${t.status === 'done' ? 'done' : ''}" draggable="true" data-drag-task-id="${t.id}">
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

function render() {
  renderCalendar();
  renderList();
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
    if (act === 'toggle') await api('/api/planner/items/toggle', { method: 'POST', body: JSON.stringify({ id }) });
    if (act === 'delete') await api('/api/planner/items/delete', { method: 'POST', body: JSON.stringify({ id }) });
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

calPrev.addEventListener('click', () => {
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
  renderCalendar();
});
calNext.addEventListener('click', () => {
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
  renderCalendar();
});

calendarGrid.addEventListener('click', (e) => {
  const cell = e.target.closest('.cal-day[data-date]');
  if (!cell) return;
  const ymd = cell.getAttribute('data-date') || '';
  if (!ymd) return;
  taskDate.value = ymd;
});

calendarGrid.addEventListener('dragstart', (e) => {
  const item = e.target.closest('.cal-item[data-drag-task-id]');
  if (!item) return;
  dragTaskId = item.getAttribute('data-drag-task-id') || null;
  item.classList.add('dragging');
  try {
    e.dataTransfer?.setData('text/plain', dragTaskId || '');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  } catch {}
});

calendarGrid.addEventListener('dragend', (e) => {
  const item = e.target.closest('.cal-item[data-drag-task-id]');
  if (item) item.classList.remove('dragging');
  dragTaskId = null;
  document.querySelectorAll('.cal-day.drop-target').forEach((el) => el.classList.remove('drop-target'));
});

calendarGrid.addEventListener('dragover', (e) => {
  const cell = e.target.closest('.cal-day[data-date]');
  if (!cell) return;
  e.preventDefault();
  cell.classList.add('drop-target');
});

calendarGrid.addEventListener('dragleave', (e) => {
  const cell = e.target.closest('.cal-day[data-date]');
  if (!cell) return;
  cell.classList.remove('drop-target');
});

calendarGrid.addEventListener('drop', async (e) => {
  const cell = e.target.closest('.cal-day[data-date]');
  if (!cell) return;
  e.preventDefault();
  cell.classList.remove('drop-target');
  const ymd = cell.getAttribute('data-date') || '';
  const id = dragTaskId || e.dataTransfer?.getData('text/plain') || '';
  if (!id || !ymd) return;
  try {
    setSync('Syncing…');
    await api('/api/planner/items/reschedule', { method: 'POST', body: JSON.stringify({ id, dueDate: ymd }) });
    taskDate.value = ymd;
    await loadTasks();
  } catch (err) {
    setSync(err.message || 'Sync error', false);
  }
});

 taskList.addEventListener('dragstart', (e) => {
  const row = e.target.closest('[data-drag-task-id]');
  if (!row) return;
  dragTaskId = row.getAttribute('data-drag-task-id') || null;
  row.classList.add('dragging');
  try {
    e.dataTransfer?.setData('text/plain', dragTaskId || '');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  } catch {}
});

taskList.addEventListener('dragend', (e) => {
  const row = e.target.closest('[data-drag-task-id]');
  if (row) row.classList.remove('dragging');
  dragTaskId = null;
  document.querySelectorAll('.cal-day.drop-target').forEach((el) => el.classList.remove('drop-target'));
});

async function unlockApp() {
  authError.textContent = '';
  const hash = await sha256Hex(authPassword.value || '');
  if (hash !== PASSWORD_SHA256) {
    authError.textContent = 'Wrong password.';
    return;
  }
  authOverlay.classList.add('hidden');
  app.classList.remove('hidden');
  await loadTasks();
}

authSubmit.addEventListener('click', unlockApp);
authPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    unlockApp();
  }
});
