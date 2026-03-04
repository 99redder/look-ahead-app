// TODO: Update the worker URL below after deploying
const API_BASES = [
  'https://look-ahead-planner.99redder.workers.dev',
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
const modalDelete = document.getElementById('modal-delete');
const modalNotes = document.getElementById('modal-notes');

const deleteModal = document.getElementById('delete-modal');
const deleteModalConfirm = document.getElementById('delete-modal-confirm');
const deleteModalCancel = document.getElementById('delete-modal-cancel');

const taskList = document.getElementById('task-list');
const calendarGrid = document.getElementById('calendar-grid');
const calLabel = document.getElementById('cal-label');
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');

let tasks = [];
let calCursor = new Date();
let calAutoFocused = false;
let dragTaskId = null;


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
    modalNotes.style.display = 'none';
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

function getTaskNotes(taskId) {
  try {
    return localStorage.getItem(`lookahead:task-notes:${taskId}`) || '';
  } catch {
    return '';
  }
}

function setTaskNotes(taskId, notes) {
  try {
    const key = `lookahead:task-notes:${taskId}`;
    if ((notes || '').trim()) localStorage.setItem(key, notes);
    else localStorage.removeItem(key);
  } catch {}
}

function taskEditorModal(task) {
  return new Promise((resolve) => {
    modalTitle.textContent = 'Edit Task';
    modalMessage.textContent = 'Update title and private notes.';
    modalInput.value = task?.title || '';
    modalNotes.style.display = 'block';
    modalNotes.value = getTaskNotes(task.id);
    modalSave.textContent = 'Save';
    modalDelete.style.display = 'block';
    modalBackdrop.style.display = 'grid';
    modalBackdrop.setAttribute('aria-hidden', 'false');
    setTimeout(() => modalInput.focus(), 0);

    const close = (val) => {
      modalBackdrop.style.display = 'none';
      modalBackdrop.setAttribute('aria-hidden', 'true');
      modalNotes.style.display = 'none';
      modalDelete.style.display = 'none';
      modalSave.removeEventListener('click', onSave);
      modalCancel.removeEventListener('click', onCancel);
      modalDelete.removeEventListener('click', onDelete);
      modalBackdrop.removeEventListener('click', onBackdrop);
      modalInput.removeEventListener('keydown', onKey);
      modalNotes.removeEventListener('keydown', onNotesKey);
      resolve(val);
    };
    const onSave = () => close({ title: modalInput.value, notes: modalNotes.value });
    const onCancel = () => close(null);
    const onDelete = () => close({ delete: true });
    const onBackdrop = (e) => { if (e.target === modalBackdrop) close(null); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    const onNotesKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };

    modalSave.addEventListener('click', onSave);
    modalCancel.addEventListener('click', onCancel);
    modalDelete.addEventListener('click', onDelete);
    modalBackdrop.addEventListener('click', onBackdrop);
    modalInput.addEventListener('keydown', onKey);
    modalNotes.addEventListener('keydown', onNotesKey);
  });
}

function confirmDelete(message = 'Are you sure you want to delete this task?') {
  return new Promise((resolve) => {
    document.getElementById('delete-modal-message').textContent = message;
    deleteModal.style.display = 'grid';
    deleteModal.setAttribute('aria-hidden', 'false');
    
    const close = (val) => {
      deleteModal.style.display = 'none';
      deleteModal.setAttribute('aria-hidden', 'true');
      deleteModalConfirm.removeEventListener('click', onConfirm);
      deleteModalCancel.removeEventListener('click', onCancel);
      deleteModal.removeEventListener('click', onBackdrop);
      resolve(val);
    };
    const onConfirm = () => close(true);
    const onCancel = () => close(false);
    const onBackdrop = (e) => { if (e.target === deleteModal) close(false); };
    
    deleteModalConfirm.addEventListener('click', onConfirm);
    deleteModalCancel.addEventListener('click', onCancel);
    deleteModal.addEventListener('click', onBackdrop);
  });
}

function ymdToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

calCursor = startOfWeek(new Date());

function autoFocusCalendarMonthFromTasks() {
  const open = tasks.filter(t => (t.status || 'open') !== 'done' && (t.due_date || '').trim());
  if (!open.length) return;
  const today = ymdToday();
  const future = open.filter(t => t.due_date >= today).sort((a,b) => a.due_date.localeCompare(b.due_date));
  const pick = future[0] || open.sort((a,b) => a.due_date.localeCompare(b.due_date))[0];
  if (!pick?.due_date) return;
  const [y,m] = pick.due_date.split('-').map(Number);
  if (!y || !m) return;
  calCursor = startOfWeek(new Date(y, m - 1, 1));
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
  const start = startOfWeek(calCursor);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 83); // 12 weeks window

  const startLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(start);
  const endLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(end);
  calLabel.textContent = `${startLabel} – ${endLabel}`;

  const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const cells = [];
  dows.forEach(d => cells.push(`<div class="cal-dow">${d}</div>`));

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  for (let i = 0; i < 84; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayItems = tasks
      .filter(t => (t.due_date || '') === key)
      .sort((a,b) => (a.status === 'done') - (b.status === 'done'));
    const html = dayItems.slice(0, 4).map(t => `<div class="cal-item" draggable="true" data-drag-task-id="${t.id}"><span class="cal-item-title">${escapeHtml(t.title)}</span><span class="cal-item-delete" data-delete-id="${t.id}">×</span></div>`).join('');
    const more = dayItems.length > 4 ? `<div class="cal-item">+${dayItems.length - 4} more</div>` : '';
    const isPast = key < todayKey;
    const monthStarts = d.getDate() === 1;
    const monthBadge = monthStarts
      ? `<div class="cal-month-badge">${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d)}</div>`
      : '';
    cells.push(`<div class="cal-day ${key === todayKey ? 'today' : ''} ${isPast ? 'past' : ''} ${monthStarts ? 'month-start' : ''}" data-date="${key}">${monthBadge}<div class="cal-day-num">${d.getDate()}</div>${html}${more}</div>`);
  }

  calendarGrid.innerHTML = `<div class="rolling-grid">${cells.join('')}</div>`;
}

function renderList() {
  if (!taskList) return;
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

if (taskList) {
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
}

calPrev.addEventListener('click', () => {
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth(), calCursor.getDate() - 84);
  renderCalendar();
});
calNext.addEventListener('click', () => {
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth(), calCursor.getDate() + 84);
  renderCalendar();
});

calendarGrid.addEventListener('click', async (e) => {
  const deleteBtn = e.target.closest('.cal-item-delete');
  if (deleteBtn) {
    e.preventDefault();
    e.stopPropagation();
    const id = deleteBtn.getAttribute('data-delete-id') || '';
    if (!id) return;
    if (!await confirmDelete()) return;
    try {
      setSync('Deleting...');
      await api('/api/planner/items/delete', { method: 'POST', body: JSON.stringify({ id }) });
      await loadTasks();
    } catch (err) {
      setSync(err.message || 'Delete error', false);
    }
    return;
  }

  const taskChip = e.target.closest('.cal-item[data-drag-task-id]');
  if (taskChip) {
    e.preventDefault();
    e.stopPropagation();
    const id = taskChip.getAttribute('data-drag-task-id') || '';
    const existing = tasks.find(t => String(t.id) === String(id));
    if (!existing) return;

    const next = await taskEditorModal(existing);
    if (next == null) return;

    // Handle delete
    if (next.delete) {
      if (!await confirmDelete()) return;
      try {
        setSync('Deleting...');
        await api('/api/planner/items/delete', { method: 'POST', body: JSON.stringify({ id: existing.id }) });
        await loadTasks();
      } catch (err) {
        setSync(err.message || 'Delete error', false);
      }
      return;
    }

    const title = (next.title || '').trim();
    if (!title) return;

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
      setTaskNotes(existing.id, next.notes || '');
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

if (taskList) {
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
}

loadTasks().catch((err) => {
  setSync(err?.message || 'Network error when attempting to fetch resource', false);
});
