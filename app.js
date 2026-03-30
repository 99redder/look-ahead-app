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
const modalTime = document.getElementById('modal-time');

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
let focusMode = false; // When true, show only 1 week instead of 12

const APP_PASSWORD_KEY = 'lookahead:app-password';

function getSavedPassword() {
  try { return localStorage.getItem(APP_PASSWORD_KEY) || ''; } catch { return ''; }
}

function setSavedPassword(value) {
  try {
    if (value) localStorage.setItem(APP_PASSWORD_KEY, value);
    else localStorage.removeItem(APP_PASSWORD_KEY);
  } catch {}
}

async function ensureAppPassword(force = false) {
  let pwd = force ? '' : getSavedPassword();
  if (pwd) return pwd;

  const entered = await promptModal({
    title: 'Look Ahead Login',
    message: 'Enter your planner password to sync tasks.',
    initialValue: '',
    saveLabel: 'Unlock',
    inputType: 'password'
  });

  pwd = (entered || '').trim();
  if (!pwd) throw new Error('Password is required');
  setSavedPassword(pwd);
  return pwd;
}

async function api(path, options = {}) {
  let lastErr = null;
  let appPassword = await ensureAppPassword(false);

  for (const base of API_BASES) {
    try {
      const call = async () => fetch(`${base}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-App-Password': appPassword,
          ...(options.headers || {})
        }
      });

      let res = await call();
      if (res.status === 401) {
        setSavedPassword('');
        appPassword = await ensureAppPassword(true);
        res = await call();
      }

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

function promptModal({ title = 'Edit', message = '', initialValue = '', saveLabel = 'Save', inputType = 'text' }) {
  return new Promise((resolve) => {
    const previousType = modalInput.type;
    const isPassword = inputType === 'password';
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalInput.type = inputType;
    modalInput.value = initialValue || '';
    modalTime.style.display = isPassword ? 'none' : 'block';
    modalTime.value = '';
    modalNotes.style.display = 'none';
    modalDelete.style.display = 'none';
    modalSave.textContent = saveLabel;
    modalBackdrop.style.display = 'grid';
    modalBackdrop.setAttribute('aria-hidden', 'false');
    setTimeout(() => modalInput.focus(), 0);

    const close = (val) => {
      modalBackdrop.style.display = 'none';
      modalBackdrop.setAttribute('aria-hidden', 'true');
      modalInput.type = previousType;
      modalTime.style.display = 'block';
      modalTime.value = '';
      modalSave.removeEventListener('click', onSave);
      modalCancel.removeEventListener('click', onCancel);
      modalBackdrop.removeEventListener('click', onBackdrop);
      modalInput.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onSave = () => close(isPassword ? modalInput.value : { title: modalInput.value, dueTime: formatMilitaryTime(modalTime.value) || null });
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
    modalMessage.textContent = 'Update title, time, and private notes.';
    modalInput.value = task?.title || '';
    modalNotes.style.display = 'block';
    modalTime.style.display = 'block';
    modalTime.value = formatMilitaryTime(task?.due_time);
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
      modalTime.value = '';
      modalDelete.style.display = 'none';
      modalSave.removeEventListener('click', onSave);
      modalCancel.removeEventListener('click', onCancel);
      modalDelete.removeEventListener('click', onDelete);
      modalBackdrop.removeEventListener('click', onBackdrop);
      modalInput.removeEventListener('keydown', onKey);
      modalNotes.removeEventListener('keydown', onNotesKey);
      resolve(val);
    };
    const onSave = async () => {
      const title = (modalInput.value || '').trim();
      if (!title) return;
      close({ title, notes: modalNotes.value, dueTime: formatMilitaryTime(modalTime.value) || null });
    };
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

function localDayAnchor(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function ymdToday() {
  const d = localDayAnchor();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function startOfWeek(date) {
  const d = localDayAnchor(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return localDayAnchor(d);
}

calCursor = startOfWeek(localDayAnchor()); // Always start from current week

function autoFocusCalendarMonthFromTasks() {
  // Keep the calendar anchored to the current week unless the user moves it.
  calCursor = startOfWeek(localDayAnchor());
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

function timeSortValue(task) {
  const raw = String(task?.due_time || '').trim();
  return /^\d{4}$/.test(raw) ? raw : '9999';
}

function sortTasksByTime(tasksList) {
  return [...tasksList].sort((a, b) => {
    const byTime = timeSortValue(a).localeCompare(timeSortValue(b));
    if (byTime !== 0) return byTime;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

function formatMilitaryTime(raw) {
  const v = String(raw || '').trim();
  return /^\d{4}$/.test(v) ? v : '';
}

function escapeHtml(v) {
  return String(v || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderCalendar() {
  const today = localDayAnchor();
  const currentWeekStart = startOfWeek(today);
  const cursor = startOfWeek(localDayAnchor(calCursor || currentWeekStart));
  const start = cursor < currentWeekStart ? currentWeekStart : cursor;
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const startYear = start.getFullYear();
  const startMonth = start.getMonth();
  const startDay = start.getDate();

  const daysToShow = focusMode ? 7 : 28;

  // Format date explicitly using local time
  const dateFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const startLabel = dateFormatter.format(start);

  if (focusMode) {
    calLabel.textContent = `Showing: ${startLabel}`;
  } else {
    const endDate = new Date(startYear, startMonth, startDay + (daysToShow - 1), 12, 0, 0, 0);
    const endLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(endDate);
    calLabel.textContent = `${startLabel} – ${endLabel}`;
  }

  if (focusMode) {
    // Focus mode: today big on left, remaining days on right
    const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dowLabels = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');
    
    // Build the week starting from current cursor week
    let todayCell = '';
    let otherDays = [];
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(startYear, startMonth, startDay + i, 12, 0, 0, 0);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayItems = sortTasksByTime(tasks.filter(t => (t.due_date || '') === key))
        .sort((a,b) => (a.status === 'done') - (b.status === 'done'));
      const html = dayItems.slice(0, 8).map(t => `<div class="cal-item" draggable="true" data-drag-task-id="${t.id}"><span class="cal-item-title">${formatMilitaryTime(t.due_time) ? escapeHtml(formatMilitaryTime(t.due_time) + ' ') : ''}${escapeHtml(t.title)}</span><span class="cal-item-delete" data-delete-id="${t.id}">×</span></div>`).join('');
      const more = dayItems.length > 8 ? `<div class="cal-item">+${dayItems.length - 8} more</div>` : '';
      const isToday = key === todayKey;
      
      const timeline = isToday ? dayItems.map(t => `<div class=\"focus-time-item ${t.status === 'done' ? 'done' : ''}\"><span class=\"focus-time\">${escapeHtml(formatMilitaryTime(t.due_time) || 'UNSET')}</span><span class=\"focus-time-title\">${escapeHtml(t.title)}</span></div>`).join('') || '<div class=\"empty-state\">No tasks for this day</div>' : `${html}${more}`;
      const dayContent = `
        <div class="cal-day ${isToday ? 'today' : ''}" data-date="${key}">
          <div class="cal-day-header">${dows[d.getDay()]}</div>
          <div class="cal-day-num">${d.getDate()}</div>
          ${timeline}
        </div>`;
      
      if (isToday) {
        todayCell = `<div class="focus-today">${dayContent}</div>`;
      } else {
        otherDays.push(dayContent);
      }
    }
    
    calendarGrid.innerHTML = `<div class="focus-grid">${todayCell}<div class="focus-remaining">${otherDays.join('')}</div></div>`;
  } else {
    // Normal mode: fixed Sun-Sat columns, starting with the current week
    const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const cells = [];
    dows.forEach(d => cells.push(`<div class="cal-dow">${d}</div>`));

    const offset = start.getDay();
    for (let i = 0; i < offset; i++) {
      cells.push(`<div class="cal-day past"></div>`);
    }

    for (let i = 0; i < daysToShow; i++) {
      const d = new Date(startYear, startMonth, startDay + i, 12, 0, 0, 0);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayItems = sortTasksByTime(tasks.filter(t => (t.due_date || '') === key))
        .sort((a,b) => (a.status === 'done') - (b.status === 'done'));
      const html = dayItems.slice(0, 4).map(t => `<div class="cal-item" draggable="true" data-drag-task-id="${t.id}"><span class="cal-item-title">${formatMilitaryTime(t.due_time) ? escapeHtml(formatMilitaryTime(t.due_time) + ' ') : ''}${escapeHtml(t.title)}</span><span class="cal-item-delete" data-delete-id="${t.id}">×</span></div>`).join('');
      const more = dayItems.length > 4 ? `<div class="cal-item">+${dayItems.length - 4} more</div>` : '';
      const monthStarts = d.getDate() === 1;
      const monthBadge = monthStarts
        ? `<div class="cal-month-badge">${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d)}</div>`
        : '';
      cells.push(`<div class="cal-day ${key === todayKey ? 'today' : ''}" data-date="${key}">${monthBadge}<div class="cal-day-num">${d.getDate()}</div>${html}${more}</div>`);
    }

    calendarGrid.innerHTML = `<div class="rolling-grid">${cells.join('')}</div>`;
  }
}

function renderList() {
  if (!taskList) return;
  const sorted = [...tasks].sort((a, b) => ((a.due_date || '').localeCompare(b.due_date || '') || timeSortValue(a).localeCompare(timeSortValue(b))));
  taskList.innerHTML = sorted.map(t => `
    <div class="item ${t.status === 'done' ? 'done' : ''}" draggable="true" data-drag-task-id="${t.id}">
      <div>
        <div class="title">${escapeHtml(t.title)}</div>
        <div>${escapeHtml(t.due_date || 'No date')}${formatMilitaryTime(t.due_time) ? ' · ' + escapeHtml(formatMilitaryTime(t.due_time)) : ''}</div>
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
      const scrollPos = { grid: document.querySelector(".rolling-grid")?.scrollTop || 0, window: window.scrollY };// debug removed
      await loadTasks();
      if(document.querySelector(".rolling-grid")) document.querySelector(".rolling-grid").scrollTop = scrollPos.grid; window.scrollTo(0, scrollPos.window);// debug removed
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
      const scrollPos = { grid: document.querySelector(".rolling-grid")?.scrollTop || 0, window: window.scrollY };// debug removed
      await loadTasks();
      if(document.querySelector(".rolling-grid")) document.querySelector(".rolling-grid").scrollTop = scrollPos.grid; window.scrollTo(0, scrollPos.window);// debug removed
    } catch (err) {
      setSync(err.message || 'Sync error', false);
    }
  });
}

calPrev.addEventListener('click', () => {
  const currentWeekStart = startOfWeek(localDayAnchor());
  const step = focusMode ? 7 : 56;
  const prev = new Date(calCursor.getFullYear(), calCursor.getMonth(), calCursor.getDate() - step, 12, 0, 0, 0);
  calCursor = prev < currentWeekStart ? currentWeekStart : prev;
  renderCalendar();
});

calNext.addEventListener('click', () => {
  const step = focusMode ? 7 : 56;
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth(), calCursor.getDate() + step, 12, 0, 0, 0);
  renderCalendar();
});

document.getElementById('cal-focus').addEventListener('click', () => {
  focusMode = !focusMode;
  document.getElementById('cal-focus').textContent = focusMode ? 'EXPAND' : 'FOCUS';
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
      const scrollPos = { grid: document.querySelector(".rolling-grid")?.scrollTop || 0, window: window.scrollY };// debug removed
      await loadTasks();
      if(document.querySelector(".rolling-grid")) document.querySelector(".rolling-grid").scrollTop = scrollPos.grid; window.scrollTo(0, scrollPos.window);// debug removed
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
        const scrollPos = { grid: document.querySelector(".rolling-grid")?.scrollTop || 0, window: window.scrollY };// debug removed
        await loadTasks();
        if(document.querySelector(".rolling-grid")) document.querySelector(".rolling-grid").scrollTop = scrollPos.grid; window.scrollTo(0, scrollPos.window);// debug removed
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
          dueTime: next.dueTime ?? existing.due_time ?? null,
          status: existing.status || 'open',
          source: existing.source || 'lookahead-app'
        })
      });
      setTaskNotes(existing.id, next.notes || '');
      const scrollPos = { grid: document.querySelector(".rolling-grid")?.scrollTop || 0, window: window.scrollY };// debug removed
      await loadTasks();
      if(document.querySelector(".rolling-grid")) document.querySelector(".rolling-grid").scrollTop = scrollPos.grid; window.scrollTo(0, scrollPos.window);// debug removed
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
  const next = await promptModal({
    title: 'New Task',
    message: `Create a task for ${ymd}:`,
    initialValue: '',
    saveLabel: 'Create'
  });
  if (next == null) return;
  const title = String(typeof next === 'string' ? next : next.title || '').trim();
  const dueTime = formatMilitaryTime(typeof next === 'object' ? next.dueTime : '') || null;
  if (!title) return;
  try {
    setSync('Syncing…');
    await api('/api/planner/items', {
      method: 'POST',
      body: JSON.stringify({ userId: USER_ID, kind: 'task', title, dueDate: ymd, dueTime, source: 'lookahead-app' })
    });
    const scrollPos = { grid: document.querySelector(".rolling-grid")?.scrollTop || 0, window: window.scrollY };// debug removed
    await loadTasks();
    if(document.querySelector(".rolling-grid")) document.querySelector(".rolling-grid").scrollTop = scrollPos.grid; window.scrollTo(0, scrollPos.window);// debug removed
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
    const scrollPos = { grid: document.querySelector(".rolling-grid")?.scrollTop || 0, window: window.scrollY };// debug removed
    await loadTasks();
    if(document.querySelector(".rolling-grid")) document.querySelector(".rolling-grid").scrollTop = scrollPos.grid; window.scrollTo(0, scrollPos.window);// debug removed
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
  render(); // Still render the calendar even if API fails
});
