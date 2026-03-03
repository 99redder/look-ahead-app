const API_BASES = [
  'https://eastern-shore-ai-contact.99redder.workers.dev',
  'https://eastern-shore-ai-contact.florencemaegifts.workers.dev'
];
const USER_ID = 'chris';

const app = document.getElementById('app');
const syncPill = document.getElementById('sync-pill');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalInput = document.getElementById('modal-input');
const modalCancel = document.getElementById('modal-cancel');
const modalSave = document.getElementById('modal-save');

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


async function api(path, options = {}) {
  let lastErr = null;
  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Network error');
}

function setSync(text, ok = true) {
  syncPill.textContent = text;
  syncPill.style.color = ok ? 'var(--muted)' : '#ff8fb3';
}

function promptModal({ title = 'Edit', message = '', initialValue = '', saveLabel = 'Save' }) {
  return new Promise((resolve) => {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalInput.value = initialValue || '';
    modalSave.textContent = saveLabel;
    modalBackdrop.style.display = 'grid';
    modalBackdrop.setAttribute('aria-hidden', 'false');
    setTimeout(() => modalInput.focus(), 0);

    const close = (val) => {
      modalBackdrop.style.display = 'none';
      modalBackdrop.setAttribute('aria-hidden', 'true');
      modalSave.removeEventListener('click', onSave);
      modalCancel.removeEventListener('click', onCancel);
      modalBackdrop.removeEventListener('click', onBackdrop);
      modalInput.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onSave = () => close(modalInput.value);
    const onCancel = () => close(null);
    const onBackdrop = (e) => { if (e.target === modalBackdrop) close(null); };
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onSave(); }
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };

    modalSave.addEventListener('click', onSave);
    modalCancel.addEventListener('click', onCancel);
    modalBackdrop.addEventListener('click', onBackdrop);
    modalInput.addEventListener('keydown', onKey);
  });
}

function ymdToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function quarterStart(date) {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
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
  calCursor = quarterStart(new Date(y, m - 1, 1));
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

function renderMonthGrid(year, month, todayKey) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  dows.forEach(d => cells.push(`<div class="cal-dow">${d}</div>`));

  for (let i = 0; i < startOffset; i++) cells.push('<div class="cal-day empty"></div>');

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayItems = tasks
      .filter(t => (t.due_date || '') === key)
      .sort((a,b) => (a.status === 'done') - (b.status === 'done'));
    const html = dayItems.slice(0, 4).map(t => `<div class="cal-item" draggable="true" data-drag-task-id="${t.id}">${escapeHtml(t.title)}</div>`).join('');
    const more = dayItems.length > 4 ? `<div class="cal-item">+${dayItems.length - 4} more</div>` : '';
    const isPast = key < todayKey;
    cells.push(`<div class="cal-day ${key === todayKey ? 'today' : ''} ${isPast ? 'past' : ''}" data-date="${key}"><div class="cal-day-num">${day}</div>${html}${more}</div>`);
  }

  while ((cells.length - 7) % 7 !== 0) cells.push('<div class="cal-day empty"></div>');

  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
  return `<div class="month-block"><div class="month-label">${monthLabel}</div><div class="month-grid">${cells.join('')}</div></div>`;
}

function renderCalendar() {
  calCursor = quarterStart(calCursor);
  const qStart = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);
  const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 2, 1);

  const startLabel = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(qStart);
  const endLabel = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(qEnd);
  calLabel.textContent = `${startLabel} – ${endLabel}`;

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const monthsHtml = [0, 1, 2]
    .map(offset => {
      const d = new Date(qStart.getFullYear(), qStart.getMonth() + offset, 1);
      return renderMonthGrid(d.getFullYear(), d.getMonth(), todayKey);
    })
    .join('');

  calendarGrid.innerHTML = `<div class="quarter-stack">${monthsHtml}</div>`;
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
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 3, 1);
  renderCalendar();
});
calNext.addEventListener('click', () => {
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 3, 1);
  renderCalendar();
});

calendarGrid.addEventListener('click', async (e) => {
  const taskChip = e.target.closest('.cal-item[data-drag-task-id]');
  if (taskChip) {
    e.preventDefault();
    e.stopPropagation();
    const id = taskChip.getAttribute('data-drag-task-id') || '';
    const current = taskChip.textContent?.trim() || '';
    const next = await promptModal({
      title: 'Rename Task',
      message: 'Update the task title:',
      initialValue: current,
      saveLabel: 'Save'
    });
    if (next == null) return;
    const title = next.trim();
    if (!title) return;
    const existing = tasks.find(t => String(t.id) === String(id));
    if (!existing) return;
    try {
      setSync('Syncing…');
      await api('/api/planner/items', {
        method: 'POST',
        body: JSON.stringify({
          id: existing.id,
          userId: USER_ID,
          kind: existing.kind || 'task',
          title,
          dueDate: existing.due_date || null,
          status: existing.status || 'open',
          source: existing.source || 'lookahead-app'
        })
      });
      await loadTasks();
    } catch (err) {
      setSync(err.message || 'Sync error', false);
    }
    return;
  }

  const cell = e.target.closest('.cal-day[data-date]');
  if (!cell) return;
  const ymd = cell.getAttribute('data-date') || '';
  if (!ymd) return;
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

async function openCreateTaskModalForDay(ymd) {
  if (!ymd) return;
  const titleRaw = await promptModal({
    title: 'New Task',
    message: `Create a task for ${ymd}:`,
    initialValue: '',
    saveLabel: 'Create'
  });
  if (titleRaw == null) return;
  const title = titleRaw.trim();
  if (!title) return;
  try {
    setSync('Syncing…');
    await api('/api/planner/items', {
      method: 'POST',
      body: JSON.stringify({ userId: USER_ID, kind: 'task', title, dueDate: ymd, source: 'lookahead-app' })
    });
    await loadTasks();
  } catch (err) {
    setSync(err.message || 'Sync error', false);
  }
}

calendarGrid.addEventListener('contextmenu', async (e) => {
  const cell = e.target.closest('.cal-day[data-date]');
  if (!cell) return;
  e.preventDefault();
  const ymd = cell.getAttribute('data-date') || '';
  await openCreateTaskModalForDay(ymd);
});

calendarGrid.addEventListener('dblclick', async (e) => {
  const cell = e.target.closest('.cal-day[data-date]');
  if (!cell) return;
  const ymd = cell.getAttribute('data-date') || '';
  await openCreateTaskModalForDay(ymd);
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

loadTasks().catch((err) => {
  setSync(err?.message || 'Network error when attempting to fetch resource', false);
});
