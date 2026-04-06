// TODO: Update the worker URL below after deploying
const API_BASES = [
  'https://look-ahead-planner.99redder.workers.dev',
];

const USER_ID = 'chris';
const CATEGORY_KIND = 'category';
const DEFAULT_CATEGORY_ID = 'uncategorized';
const DEFAULT_CATEGORY_COLOR = '#39ff14';
const CATEGORY_COLORS = [
  '#39ff14', '#ffffff', '#ff0033', '#00f5d4',
  '#00e5ff', '#38b6ff', '#6a5cff', '#b517ff',
  '#ff2bd6', '#ff4d6d', '#ff6b00', '#ff9f1c',
  '#ffd60a', '#c6ff00'
];

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
const modalCategory = document.getElementById('modal-category');
const modalColorWrap = document.getElementById('modal-color-wrap');
const modalColorPalette = document.getElementById('modal-color-palette');

const deleteModal = document.getElementById('delete-modal');
const deleteModalConfirm = document.getElementById('delete-modal-confirm');
const deleteModalCancel = document.getElementById('delete-modal-cancel');

const categoryModal = document.getElementById('category-modal');
const categoryModalTitle = document.getElementById('category-modal-title');
const categoryModalMessage = document.getElementById('category-modal-message');
const categoryModalInput = document.getElementById('category-modal-input');
const categoryModalPalette = document.getElementById('category-modal-palette');
const categoryModalSave = document.getElementById('category-modal-save');
const categoryModalCancel = document.getElementById('category-modal-cancel');
const categoryModalDelete = document.getElementById('category-modal-delete');

const categoryDeleteModal = document.getElementById('category-delete-modal');
const categoryDeleteModalMessage = document.getElementById('category-delete-modal-message');
const categoryDeleteModalConfirm = document.getElementById('category-delete-modal-confirm');
const categoryDeleteModalCancel = document.getElementById('category-delete-modal-cancel');

const calWorkList = document.getElementById('cal-work-list');
const calFocus = document.getElementById('cal-focus');

const workListModal = document.getElementById('work-list-modal');
const workListModalTitle = document.getElementById('work-list-modal-title');
const workListModalMessage = document.getElementById('work-list-modal-message');
const workListContent = document.getElementById('work-list-content');
const workListClose = document.getElementById('work-list-close');

const taskList = document.getElementById('task-list');
const calendarGrid = document.getElementById('calendar-grid');
const calLabel = document.getElementById('cal-label');
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');
const categoryBar = document.getElementById('category-bar');
const categoryList = document.getElementById('category-list');
const categoryManage = document.getElementById('category-manage');

let tasks = [];
let categories = [];
let calCursor = new Date();
let calAutoFocused = false;
let dragTaskId = null;
let focusMode = false;

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

function escapeHtml(v) {
  return String(v || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function localDayAnchor(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function startOfWeek(date) {
  const d = localDayAnchor(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return localDayAnchor(d);
}

calCursor = startOfWeek(localDayAnchor());

function autoFocusCalendarMonthFromTasks() {
  calCursor = startOfWeek(localDayAnchor());
  calAutoFocused = true;
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

function slugifyCategoryName(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `category-${Date.now()}`;
}

function normalizeHexColor(value, fallback = DEFAULT_CATEGORY_COLOR) {
  const v = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback;
}

function buildColorPaletteMarkup(selectedColor = DEFAULT_CATEGORY_COLOR) {
  const normalized = normalizeHexColor(selectedColor, DEFAULT_CATEGORY_COLOR);
  return CATEGORY_COLORS.map((color) => {
    const active = normalizeHexColor(color) === normalized ? ' active' : '';
    return `<button class="color-swatch${active}" type="button" data-color="${escapeHtml(color)}" style="--swatch:${escapeHtml(color)};" aria-label="Select ${escapeHtml(color)}"></button>`;
  }).join('');
}

function wirePaletteSelection(container, selectedColor = DEFAULT_CATEGORY_COLOR) {
  if (!container) return { getValue: () => normalizeHexColor(selectedColor) };
  let current = normalizeHexColor(selectedColor, DEFAULT_CATEGORY_COLOR);
  container.innerHTML = buildColorPaletteMarkup(current);
  const onClick = (e) => {
    const swatch = e.target.closest('[data-color]');
    if (!swatch) return;
    current = normalizeHexColor(swatch.getAttribute('data-color'), DEFAULT_CATEGORY_COLOR);
    container.querySelectorAll('[data-color]').forEach((node) => {
      node.classList.toggle('active', node === swatch);
    });
  };
  container.addEventListener('click', onClick);
  return {
    getValue: () => current,
    destroy: () => container.removeEventListener('click', onClick)
  };
}

function categoryIdForName(name, existingId = '') {
  if (existingId) return existingId;
  let base = slugifyCategoryName(name);
  let next = base;
  let i = 2;
  const used = new Set(categories.map((category) => String(category.categoryId || category.id || '')));
  while (used.has(next)) {
    next = `${base}-${i++}`;
  }
  return next;
}

function ensureDefaultCategory() {
  if (!categories.some((category) => category.categoryId === DEFAULT_CATEGORY_ID)) {
    categories = [{
      id: `category:${DEFAULT_CATEGORY_ID}`,
      categoryId: DEFAULT_CATEGORY_ID,
      name: 'Uncategorized',
      color: DEFAULT_CATEGORY_COLOR,
      title: 'Uncategorized',
      kind: CATEGORY_KIND,
      user_id: USER_ID,
      status: 'open',
      source: 'lookahead-app'
    }, ...categories];
  }
}

function normalizeCategory(item = {}) {
  const name = String(item.name || item.title || 'Uncategorized').trim() || 'Uncategorized';
  const categoryId = String(item.categoryId || item.category_id || slugifyCategoryName(name) || DEFAULT_CATEGORY_ID);
  return {
    ...item,
    id: item.id || `category:${categoryId}`,
    categoryId,
    name,
    color: normalizeHexColor(item.color || item.categoryColor || item.notes || DEFAULT_CATEGORY_COLOR),
    kind: CATEGORY_KIND,
    title: name
  };
}

function parseCategoryPayload(rawItems) {
  categories = rawItems
    .filter((item) => String(item.kind || '').toLowerCase() === CATEGORY_KIND)
    .map(normalizeCategory)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  ensureDefaultCategory();
}

function normalizeTask(item = {}) {
  const task = { ...item };
  task.categoryId = String(
    task.categoryId
      || task.category_id
      || task.meta?.categoryId
      || task.source_id
      || DEFAULT_CATEGORY_ID
  );
  task.categoryName = String(task.categoryName || task.category_name || '').trim();
  task.categoryColor = normalizeHexColor(task.categoryColor || task.category_color || '', DEFAULT_CATEGORY_COLOR);
  return task;
}

function getCategoryById(categoryId) {
  ensureDefaultCategory();
  return categories.find((category) => String(category.categoryId) === String(categoryId))
    || categories.find((category) => category.categoryId === DEFAULT_CATEGORY_ID)
    || { categoryId: DEFAULT_CATEGORY_ID, name: 'Uncategorized', color: DEFAULT_CATEGORY_COLOR };
}

function getTaskCategory(task) {
  const category = getCategoryById(task?.categoryId || DEFAULT_CATEGORY_ID);
  const taskCategoryName = String(task?.categoryName || task?.category_name || '').trim();
  const taskCategoryColor = String(task?.categoryColor || task?.category_color || '').trim();
  if (!taskCategoryName && !taskCategoryColor) return category;
  return {
    ...category,
    name: taskCategoryName || category.name,
    title: taskCategoryName || category.title,
    color: normalizeHexColor(taskCategoryColor || category.color, DEFAULT_CATEGORY_COLOR)
  };
}

function getTaskChipStyle(task) {
  const category = getTaskCategory(task);
  const color = normalizeHexColor(category.color, DEFAULT_CATEGORY_COLOR);
  return `background:${color};border-color:${color};color:${getContrastColor(color)};`;
}

function getContrastColor(hex) {
  const clean = normalizeHexColor(hex, DEFAULT_CATEGORY_COLOR).slice(1);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#081009' : '#f4fff1';
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

function fillCategoryOptions(selectedId = DEFAULT_CATEGORY_ID) {
  if (!modalCategory) return;
  ensureDefaultCategory();
  modalCategory.innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category.categoryId)}">${escapeHtml(category.name)}</option>`)
    .join('');
  modalCategory.value = categories.some((category) => category.categoryId === selectedId) ? selectedId : DEFAULT_CATEGORY_ID;
}

function promptModal({ title = 'Edit', message = '', initialValue = '', saveLabel = 'Save', inputType = 'text', selectedCategoryId = DEFAULT_CATEGORY_ID, showCategory = false, showTime = true }) {
  return new Promise((resolve) => {
    const previousType = modalInput.type;
    const isPassword = inputType === 'password';
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalInput.type = inputType;
    modalInput.value = initialValue || '';
    modalTime.style.display = !isPassword && showTime ? 'block' : 'none';
    modalTime.value = '';
    modalNotes.style.display = 'none';
    modalDelete.style.display = 'none';
    if (modalColorWrap) modalColorWrap.classList.add('hidden');
    if (modalColorPalette) modalColorPalette.innerHTML = '';
    if (modalCategory) {
      modalCategory.style.display = !isPassword && showCategory ? 'block' : 'none';
      fillCategoryOptions(selectedCategoryId);
    }
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
      if (modalCategory) modalCategory.style.display = 'none';
      if (modalColorWrap) modalColorWrap.classList.add('hidden');
      if (modalColorPalette) modalColorPalette.innerHTML = '';
      modalSave.removeEventListener('click', onSave);
      modalCancel.removeEventListener('click', onCancel);
      modalBackdrop.removeEventListener('click', onBackdrop);
      modalInput.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onSave = () => close(isPassword ? modalInput.value : {
      title: modalInput.value,
      dueTime: showTime ? formatMilitaryTime(modalTime.value) || null : null,
      categoryId: showCategory && modalCategory ? modalCategory.value || DEFAULT_CATEGORY_ID : selectedCategoryId
    });
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

function taskEditorModal(task) {
  return new Promise((resolve) => {
    modalTitle.textContent = 'Edit Task';
    modalMessage.textContent = 'Update title, time, category, and private notes.';
    modalInput.value = task?.title || '';
    modalNotes.style.display = 'block';
    modalTime.style.display = 'block';
    modalTime.value = formatMilitaryTime(task?.due_time);
    modalNotes.value = getTaskNotes(task.id);
    if (modalCategory) {
      modalCategory.style.display = 'block';
      fillCategoryOptions(task?.categoryId || DEFAULT_CATEGORY_ID);
    }
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
      if (modalCategory) modalCategory.style.display = 'none';
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
      close({
        title,
        notes: modalNotes.value,
        dueTime: formatMilitaryTime(modalTime.value) || null,
        categoryId: modalCategory?.value || DEFAULT_CATEGORY_ID
      });
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

function categoryEditorModal(category = null) {
  return new Promise((resolve) => {
    const isExisting = !!category;
    categoryModalTitle.textContent = isExisting ? 'Edit Category' : 'New Category';
    categoryModalMessage.textContent = isExisting
      ? (category.categoryId === DEFAULT_CATEGORY_ID
        ? 'Update the default category name or color.'
        : 'Update the category name or color. You can also delete it and move its tasks to Uncategorized.')
      : 'Create a category with a name and color.';
    categoryModalInput.value = category?.name || '';
    categoryModalSave.textContent = isExisting ? 'Save' : 'Create';
    categoryModalDelete.style.display = isExisting && category.categoryId !== DEFAULT_CATEGORY_ID ? 'inline-flex' : 'none';
    const palette = wirePaletteSelection(categoryModalPalette, category?.color || DEFAULT_CATEGORY_COLOR);
    categoryModal.style.display = 'grid';
    categoryModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => categoryModalInput.focus(), 0);

    const close = (val) => {
      categoryModal.style.display = 'none';
      categoryModal.setAttribute('aria-hidden', 'true');
      palette.destroy?.();
      categoryModalSave.removeEventListener('click', onSave);
      categoryModalCancel.removeEventListener('click', onCancel);
      categoryModalDelete.removeEventListener('click', onDelete);
      categoryModal.removeEventListener('click', onBackdrop);
      categoryModalInput.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onSave = () => close({ name: categoryModalInput.value.trim(), color: palette.getValue() });
    const onDelete = () => close({ delete: true, name: categoryModalInput.value.trim(), color: palette.getValue() });
    const onCancel = () => close(null);
    const onBackdrop = (e) => { if (e.target === categoryModal) close(null); };
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onSave(); }
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };

    categoryModalSave.addEventListener('click', onSave);
    categoryModalCancel.addEventListener('click', onCancel);
    categoryModalDelete.addEventListener('click', onDelete);
    categoryModal.addEventListener('click', onBackdrop);
    categoryModalInput.addEventListener('keydown', onKey);
  });
}

function confirmCategoryDelete(categoryName) {
  return new Promise((resolve) => {
    categoryDeleteModalMessage.textContent = `Delete “${categoryName}”? Tasks in it will move to Uncategorized.`;
    categoryDeleteModal.style.display = 'grid';
    categoryDeleteModal.setAttribute('aria-hidden', 'false');

    const close = (val) => {
      categoryDeleteModal.style.display = 'none';
      categoryDeleteModal.setAttribute('aria-hidden', 'true');
      categoryDeleteModalConfirm.removeEventListener('click', onConfirm);
      categoryDeleteModalCancel.removeEventListener('click', onCancel);
      categoryDeleteModal.removeEventListener('click', onBackdrop);
      resolve(val);
    };
    const onConfirm = () => close(true);
    const onCancel = () => close(false);
    const onBackdrop = (e) => { if (e.target === categoryDeleteModal) close(false); };

    categoryDeleteModalConfirm.addEventListener('click', onConfirm);
    categoryDeleteModalCancel.addEventListener('click', onCancel);
    categoryDeleteModal.addEventListener('click', onBackdrop);
  });
}

function categoryMeta(categoryId) {
  const category = getCategoryById(categoryId);
  return {
    categoryId: category.categoryId,
    categoryColor: category.color,
    categoryName: category.name
  };
}

async function saveCategory(category) {
  const name = String(category?.name || '').trim();
  if (!name) throw new Error('Category name is required');
  const id = category?.id || '';
  const color = normalizeHexColor(category?.color);
  const categoryId = categoryIdForName(name, String(id).replace(/^category:/, '') || category?.categoryId);
  await api('/api/planner/items', {
    method: 'POST',
    body: JSON.stringify({
      ...(id ? { id } : {}),
      userId: USER_ID,
      kind: CATEGORY_KIND,
      title: name,
      notes: color,
      categoryId,
      categoryName: name,
      categoryColor: color,
      dueDate: null,
      dueTime: null,
      status: 'open',
      source: 'lookahead-app'
    })
  });
}

async function deleteCategory(category) {
  const categoryId = category?.categoryId;
  if (!categoryId || categoryId === DEFAULT_CATEGORY_ID) throw new Error('Default category cannot be deleted');
  const affectedTasks = tasks.filter((task) => task.categoryId === categoryId);
  for (const task of affectedTasks) {
    const fallback = categoryMeta(DEFAULT_CATEGORY_ID);
    await api('/api/planner/items', {
      method: 'POST',
      body: JSON.stringify({
        id: task.id,
        userId: USER_ID,
        kind: task.kind || 'task',
        title: task.title,
        dueDate: task.due_date || null,
        dueTime: task.due_time || null,
        status: task.status || 'open',
        source: task.source || 'lookahead-app',
        ...fallback
      })
    });
  }
  await api('/api/planner/items/delete', { method: 'POST', body: JSON.stringify({ id: category.id }) });
}

async function manageCategories() {
  const created = await categoryEditorModal();
  if (!created?.name) return;
  await saveCategory({ name: created.name, color: created.color });
  await loadTasks();
}

async function loadTasks() {
  setSync('Syncing…');
  const data = await api(`/api/planner/items?userId=${encodeURIComponent(USER_ID)}&includeDone=1`);
  const items = Array.isArray(data.items) ? data.items : [];
  parseCategoryPayload(items);
  tasks = items
    .filter((item) => String(item.kind || 'task').toLowerCase() !== CATEGORY_KIND)
    .map(normalizeTask);
  if (!calAutoFocused) autoFocusCalendarMonthFromTasks();
  setSync('Synced');
  render();
}

function renderCategories() {
  if (!categoryList) return;
  ensureDefaultCategory();
  categoryList.innerHTML = categories.map((category) => `
    <button class="category-chip" style="background:${escapeHtml(normalizeHexColor(category.color))};" data-category-id="${escapeHtml(category.categoryId)}" type="button">
      <span>${escapeHtml(category.name)}</span>
    </button>
  `).join('');
}

function renderTaskItem(task, compact = false) {
  const title = `${formatMilitaryTime(task.due_time) ? `${formatMilitaryTime(task.due_time)} ` : ''}${task.title}`;
  return `<div class="cal-item${task.status === 'done' ? ' done' : ''}" draggable="true" data-drag-task-id="${task.id}" style="${getTaskChipStyle(task)}">
    <span class="cal-item-title">${escapeHtml(title)}</span>
    <span class="cal-item-delete" data-delete-id="${task.id}">×</span>
  </div>`;
}

function renderCalendar() {
  const today = localDayAnchor();
  const currentWeekStart = startOfWeek(today);
  const cursor = startOfWeek(localDayAnchor(calCursor || currentWeekStart));
  const start = cursor < currentWeekStart ? currentWeekStart : cursor;
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const startYear = start.getFullYear();
  const startMonth = start.getMonth();
  const startDay = start.getDate();
  const daysToShow = focusMode ? 7 : 42;

  // Hide navigation in focus mode, show in expand mode
  calPrev.style.display = focusMode ? 'none' : 'inline-block';
  calLabel.style.display = focusMode ? 'none' : 'block';
  calNext.style.display = focusMode ? 'none' : 'inline-block';

  if (!focusMode) {
    const dateFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const startLabel = dateFormatter.format(start);
    const endDate = new Date(startYear, startMonth, startDay + (daysToShow - 1), 12, 0, 0, 0);
    const endLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(endDate);
    calLabel.textContent = `${startLabel} – ${endLabel}`;
  }

  if (focusMode) {
    const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let todayCell = '';
    const otherDays = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(startYear, startMonth, startDay + i, 12, 0, 0, 0);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayItems = sortTasksByTime(tasks.filter((task) => (task.due_date || '') === key))
        .sort((a, b) => (a.status === 'done') - (b.status === 'done'));
      const html = dayItems.slice(0, 8).map((task) => renderTaskItem(task, true)).join('');
      const more = dayItems.length > 8 ? `<div class="cal-item cal-item-more">+${dayItems.length - 8} more</div>` : '';
      const isToday = key === todayKey;
      const timeline = isToday
        ? dayItems.map((task) => {
          const time = formatMilitaryTime(task.due_time);
          const color = getTaskCategory(task).color;
          return `<div class="focus-time-item ${task.status === 'done' ? 'done' : ''}" style="background:linear-gradient(to right, #0b120d calc(100% - 33%), ${color} calc(100% - 33%))"><span class="focus-time">${escapeHtml(time || '')}</span><span class="focus-time-title">${escapeHtml(task.title)}</span></div>`;
        }).join('') || '<div class="empty-state">No tasks for this day</div>'
        : `${html}${more}`;
      const dayContent = `
        <div class="cal-day ${isToday ? 'today' : ''}" data-date="${key}">
          <div class="cal-day-header">${dows[d.getDay()]}</div>
          <div class="cal-day-num">${d.getDate()}</div>
          ${timeline}
        </div>`;

      if (isToday) todayCell = `<div class="focus-today">${dayContent}</div>`;
      else otherDays.push(dayContent);
    }

    calendarGrid.innerHTML = `<div class="focus-grid">${todayCell}<div class="focus-remaining">${otherDays.join('')}</div></div>`;
    return;
  }

  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cells = [];
  dows.forEach((d) => cells.push(`<div class="cal-dow">${d}</div>`));

  const offset = start.getDay();
  for (let i = 0; i < offset; i++) {
    cells.push('<div class="cal-day past"></div>');
  }

  for (let i = 0; i < daysToShow; i++) {
    const d = new Date(startYear, startMonth, startDay + i, 12, 0, 0, 0);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayItems = sortTasksByTime(tasks.filter((task) => (task.due_date || '') === key))
      .sort((a, b) => (a.status === 'done') - (b.status === 'done'));
    const html = dayItems.slice(0, 8).map((task) => renderTaskItem(task)).join('');
    const more = dayItems.length > 8 ? `<div class="cal-item cal-item-more">+${dayItems.length - 8} more</div>` : '';
    const monthStarts = d.getDate() === 1;
    const monthBadge = monthStarts
      ? `<div class="cal-month-badge">${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d)}</div>`
      : '';
    cells.push(`<div class="cal-day ${key === todayKey ? 'today' : ''}" data-date="${key}">${monthBadge}<div class="cal-day-num">${d.getDate()}</div>${html}${more}</div>`);
  }

  calendarGrid.innerHTML = `<div class="rolling-grid">${cells.join('')}</div>`;
}

function renderList() {
  if (!taskList) return;
  const sorted = [...tasks].sort((a, b) => ((a.due_date || '').localeCompare(b.due_date || '') || timeSortValue(a).localeCompare(timeSortValue(b))));
  taskList.innerHTML = sorted.map((task) => {
    const category = getTaskCategory(task);
    return `
      <div class="item ${task.status === 'done' ? 'done' : ''}" draggable="true" data-drag-task-id="${task.id}">
        <div>
          <div class="title">${escapeHtml(task.title)}</div>
          <div class="item-meta"><span class="task-category-dot" style="background:${escapeHtml(normalizeHexColor(category.color))};"></span>${escapeHtml(task.due_date || 'No date')}${formatMilitaryTime(task.due_time) ? ` · ${escapeHtml(formatMilitaryTime(task.due_time))}` : ''}</div>
        </div>
        <div class="actions">
          <input type="date" value="${escapeHtml(task.due_date || '')}" data-id="${task.id}" data-act="date" style="width:140px;padding:6px;" />
          <button data-id="${task.id}" data-act="toggle">${task.status === 'done' ? 'Undo' : 'Done'}</button>
          <button data-id="${task.id}" data-act="delete">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function render() {
  renderCategories();
  renderCalendar();
  renderList();
}

function rememberScroll() {
  return { grid: document.querySelector('.rolling-grid')?.scrollTop || 0, window: window.scrollY };
}

function restoreScroll(scrollPos) {
  if (document.querySelector('.rolling-grid')) document.querySelector('.rolling-grid').scrollTop = scrollPos.grid;
  window.scrollTo(0, scrollPos.window);
}

async function refreshAfterMutation() {
  const scrollPos = rememberScroll();
  await loadTasks();
  restoreScroll(scrollPos);
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
      await refreshAfterMutation();
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
      await refreshAfterMutation();
    } catch (err) {
      setSync(err.message || 'Sync error', false);
    }
  });
}

calPrev.addEventListener('click', () => {
  const currentWeekStart = startOfWeek(localDayAnchor());
  const step = focusMode ? 7 : 42;
  const prev = new Date(calCursor.getFullYear(), calCursor.getMonth(), calCursor.getDate() - step, 12, 0, 0, 0);
  calCursor = prev < currentWeekStart ? currentWeekStart : prev;
  renderCalendar();
});

calNext.addEventListener('click', () => {
  const step = focusMode ? 7 : 42;
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth(), calCursor.getDate() + step, 12, 0, 0, 0);
  renderCalendar();
});

document.getElementById('cal-focus').addEventListener('click', () => {
  focusMode = !focusMode;
  document.getElementById('cal-focus').textContent = focusMode ? 'EXPAND' : 'WEEK FOCUS';
  renderCalendar();
});

if (categoryManage) {
  categoryManage.addEventListener('click', async () => {
    try {
      await manageCategories();
    } catch (err) {
      setSync(err.message || 'Category error', false);
    }
  });
}

if (categoryList) {
  categoryList.addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-category-id]');
    if (!chip) return;
    const category = getCategoryById(chip.getAttribute('data-category-id') || DEFAULT_CATEGORY_ID);
    const edited = await categoryEditorModal(category);
    if (!edited) return;
    try {
      setSync('Syncing…');
      if (edited.delete) {
        if (!await confirmCategoryDelete(category.name)) return;
        await deleteCategory(category);
      } else {
        if (!edited.name) return;
        await saveCategory({ ...category, name: edited.name, color: edited.color });
      }
      await refreshAfterMutation();
    } catch (err) {
      setSync(err.message || 'Category error', false);
    }
  });
}

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
      await refreshAfterMutation();
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
    const existing = tasks.find((task) => String(task.id) === String(id));
    if (!existing) return;

    const next = await taskEditorModal(existing);
    if (next == null) return;

    if (next.delete) {
      if (!await confirmDelete()) return;
      try {
        setSync('Deleting...');
        await api('/api/planner/items/delete', { method: 'POST', body: JSON.stringify({ id: existing.id }) });
        await refreshAfterMutation();
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
          notes: existing.notes ?? null,
          status: existing.status || 'open',
          source: existing.source || 'lookahead-app',
          ...categoryMeta(next.categoryId || existing.categoryId || DEFAULT_CATEGORY_ID)
        })
      });
      setTaskNotes(existing.id, next.notes || '');
      await refreshAfterMutation();
    } catch (err) {
      setSync(err.message || 'Sync error', false);
    }
    return;
  }
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
    saveLabel: 'Create',
    showCategory: true,
    showTime: false,
    selectedCategoryId: DEFAULT_CATEGORY_ID
  });
  if (next == null) return;
  const title = String(typeof next === 'string' ? next : next.title || '').trim();
  const dueTime = formatMilitaryTime(typeof next === 'object' ? next.dueTime : '') || null;
  const nextCategoryId = typeof next === 'object' ? next.categoryId : DEFAULT_CATEGORY_ID;
  if (!title) return;
  try {
    setSync('Syncing…');
    await api('/api/planner/items', {
      method: 'POST',
      body: JSON.stringify({
        userId: USER_ID,
        kind: 'task',
        title,
        dueDate: ymd,
        dueTime,
        source: 'lookahead-app',
        ...categoryMeta(nextCategoryId)
      })
    });
    await refreshAfterMutation();
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
    await refreshAfterMutation();
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

// Work List Modal
function renderWorkList(editingTaskId = null, newSlotInfo = null) {
  if (!workListContent) return;
  
  // Get unscheduled tasks (tasks without a due_date)
  const unscheduledTasks = tasks.filter((task) => !task.due_date || task.due_date === '');
  
  // Group by category
  const tasksByCategory = {};
  categories.forEach((cat) => {
    tasksByCategory[cat.categoryId] = {
      category: cat,
      tasks: unscheduledTasks.filter((t) => t.categoryId === cat.categoryId)
    };
  });
  
  // Render each category section with 10 slots
  let html = '';
  Object.values(tasksByCategory).forEach((catData) => {
    const cat = catData.category;
    const catTasks = catData.tasks;
    const color = normalizeHexColor(cat.color, DEFAULT_CATEGORY_COLOR);
    
    html += `<div class="work-list-category" data-category-id="${escapeHtml(cat.categoryId)}">
      <div class="work-list-category-header">
        <div class="category-color-swatch" style="background:${escapeHtml(color)};"></div>
        <div class="category-title">${escapeHtml(cat.name)}</div>
      </div>
      <div class="work-list-slots">`;
    
    // Render 10 slots per category
    for (let i = 0; i < 10; i++) {
      const task = catTasks[i] || null;
      if (task) {
        const isEditing = editingTaskId === task.id;
        if (isEditing) {
          // Show inline edit mode
          html += `<div class="work-list-slot has-task editing" data-task-id="${task.id}" data-category-id="${cat.categoryId}">
            <div class="slot-actions left">
              <button class="slot-add" data-add-id="${task.id}" title="Add to Today" style="visibility:hidden">+</button>
            </div>
            <div class="slot-content">
              <input type="text" class="slot-edit-input" value="${escapeHtml(task.title)}" data-edit-id="${task.id}" placeholder="Task name..." />
            </div>
            <div class="slot-actions right">
              <button class="slot-delete" data-delete-id="${task.id}" title="Delete">×</button>
            </div>
          </div>`;
        } else {
          // Show normal view with + and × buttons
          html += `<div class="work-list-slot has-task" data-task-id="${task.id}" data-category-id="${cat.categoryId}">
            <div class="slot-actions left">
              <button class="slot-add" data-add-id="${task.id}" title="Add to Today">+</button>
            </div>
            <div class="slot-content">
              <div class="slot-title" data-click-edit="${task.id}">${escapeHtml(task.title)}</div>
            </div>
            <div class="slot-actions right">
              <button class="slot-delete" data-delete-id="${task.id}" title="Delete">×</button>
            </div>
          </div>`;
        }
      } else {
        // Check if this slot should show an input for new task
        const isNewSlot = newSlotInfo && newSlotInfo.categoryId === cat.categoryId && newSlotInfo.slotIndex === i;
        if (isNewSlot) {
          html += `<div class="work-list-slot new-task" data-slot-category="${cat.categoryId}" data-slot-index="${i}">
            <div class="slot-actions left">
              <button class="slot-add" style="visibility:hidden">+</button>
            </div>
            <div class="slot-content">
              <input type="text" class="slot-edit-input new-task-input" data-new-slot-category="${cat.categoryId}" placeholder="Type task name, press Enter..." />
            </div>
            <div class="slot-actions right">
              <button class="slot-delete" style="visibility:hidden">×</button>
            </div>
          </div>`;
        } else {
          html += `<div class="work-list-slot empty" data-slot-category="${cat.categoryId}" data-slot-index="${i}" title="Click to add task"></div>`;
        }
      }
    }
    
    html += '</div></div>';
  });
  
  workListContent.innerHTML = html;
}

function wireWorkListEvents() {
  if (!workListContent) return;
  
  workListContent.addEventListener('click', async (e) => {
    const slot = e.target.closest('.work-list-slot');
    if (!slot) return;
    
    const deleteBtn = e.target.closest('.slot-delete');
    const addBtn = e.target.closest('.slot-add');
    const titleEl = e.target.closest('.slot-title[data-click-edit]');
    
    if (deleteBtn) {
      e.stopPropagation();
      const taskId = deleteBtn.getAttribute('data-delete-id');
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        const confirmed = await confirmDelete(`Delete "${task.title}"?`);
        if (confirmed) {
          try {
            setSync('Syncing…');
            await api('/api/planner/items/delete', { method: 'POST', body: JSON.stringify({ id: task.id }) });
            await refreshAfterMutation();
            renderWorkList();
          } catch (err) {
            setSync(err.message || 'Sync error', false);
          }
        }
      }
    } else if (addBtn) {
      e.stopPropagation();
      const taskId = addBtn.getAttribute('data-add-id');
      const task = tasks.find((t) => String(t.id) === String(taskId));
      if (task) {
        // Reschedule the existing task to today — moves it off the work list
        try {
          setSync('Syncing…');
          await api('/api/planner/items/reschedule', {
            method: 'POST',
            body: JSON.stringify({ id: task.id, dueDate: ymdToday() })
          });
          await refreshAfterMutation();
          renderWorkList();
        } catch (err) {
          setSync(err.message || 'Sync error', false);
        }
      }
    } else if (titleEl) {
      // Clicked on task title - enter inline edit mode
      e.stopPropagation();
      const taskId = titleEl.getAttribute('data-click-edit');
      renderWorkList(taskId);
      // Focus the input after render
      setTimeout(() => {
        const input = workListContent.querySelector('.slot-edit-input');
        if (input) {
          input.focus();
          input.select();
        }
      }, 10);
    } else if (!deleteBtn && !addBtn && slot.classList.contains('has-task')) {
      // Clicked on an empty area of a task slot (not buttons) - do nothing
      return;
    } else if (!deleteBtn && !addBtn && (slot.classList.contains('empty') || slot.classList.contains('new-task'))) {
      // Clicked on an empty slot - show inline input for new task
      const categoryId = slot.getAttribute('data-slot-category') || DEFAULT_CATEGORY_ID;
      const slotIndex = parseInt(slot.getAttribute('data-slot-index'), 10);
      renderWorkList(null, { categoryId, slotIndex });
      // Focus the new task input after render
      setTimeout(() => {
        const input = workListContent.querySelector('.new-task-input');
        if (input) {
          input.focus();
        }
      }, 10);
    }
  });
  
  // Handle inline edit input
  workListContent.addEventListener('keydown', async (e) => {
    if (e.target.classList.contains('slot-edit-input')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const taskId = e.target.getAttribute('data-edit-id');
        const newTaskCategory = e.target.getAttribute('data-new-slot-category');
        
        if (newTaskCategory) {
          // Creating a new task
          const newTitle = e.target.value.trim();
          if (!newTitle) return;
          
          const today = localDayAnchor().toISOString().split('T')[0];
          try {
            setSync('Syncing…');
            await api('/api/planner/items', {
              method: 'POST',
              body: JSON.stringify({
                userId: USER_ID,
                kind: 'task',
                title: newTitle,
                dueDate: null, // Work list tasks have no due date
                source: 'lookahead-app',
                ...categoryMeta(newTaskCategory)
              })
            });
            await refreshAfterMutation();
            renderWorkList();
          } catch (err) {
            setSync(err.message || 'Sync error', false);
          }
        } else if (taskId) {
          // Editing existing task
          const newTitle = e.target.value.trim();
          if (!newTitle) return;
          
          const task = tasks.find((t) => t.id === taskId);
          if (!task) return;
          
          try {
            setSync('Syncing…');
            await api('/api/planner/items', {
              method: 'POST',
              body: JSON.stringify({
                id: task.id,
                userId: USER_ID,
                kind: task.kind || 'task',
                title: newTitle,
                dueDate: task.due_date || null,
                dueTime: task.due_time || null,
                notes: task.notes || null,
                status: task.status || 'open',
                source: task.source || 'lookahead-app',
                ...categoryMeta(task.categoryId || DEFAULT_CATEGORY_ID)
              })
            });
            await refreshAfterMutation();
            renderWorkList();
          } catch (err) {
            setSync(err.message || 'Sync error', false);
          }
        }
      } else if (e.key === 'Escape') {
        renderWorkList();
      }
    }
  });
  
  // Handle blur to save
  workListContent.addEventListener('blur', async (e) => {
    if (e.target.classList.contains('slot-edit-input')) {
      const taskId = e.target.getAttribute('data-edit-id');
      const newTaskCategory = e.target.getAttribute('data-new-slot-category');
      const newTitle = e.target.value.trim();
      
      // Only save if there's a title
      if (newTitle) {
        if (newTaskCategory) {
          // Creating new task
          try {
            setSync('Syncing…');
            await api('/api/planner/items', {
              method: 'POST',
              body: JSON.stringify({
                userId: USER_ID,
                kind: 'task',
                title: newTitle,
                dueDate: null,
                source: 'lookahead-app',
                ...categoryMeta(newTaskCategory)
              })
            });
            await refreshAfterMutation();
          } catch (err) {
            setSync(err.message || 'Sync error', false);
          }
        } else if (taskId) {
          // Editing existing task
          const task = tasks.find((t) => t.id === taskId);
          if (task) {
            try {
              setSync('Syncing…');
              await api('/api/planner/items', {
                method: 'POST',
                body: JSON.stringify({
                  id: task.id,
                  userId: USER_ID,
                  kind: task.kind || 'task',
                  title: newTitle,
                  dueDate: task.due_date || null,
                  dueTime: task.due_time || null,
                  notes: task.notes || null,
                  status: task.status || 'open',
                  source: task.source || 'lookahead-app',
                  ...categoryMeta(task.categoryId || DEFAULT_CATEGORY_ID)
                })
              });
              await refreshAfterMutation();
            } catch (err) {
              setSync(err.message || 'Sync error', false);
            }
          }
        }
      }
      renderWorkList();
    }
  }, true);
}

workListClose?.addEventListener('click', () => {
  workListModal.style.display = 'none';
  workListModal.setAttribute('aria-hidden', 'true');
});

workListModal?.addEventListener('click', (e) => {
  if (e.target === workListModal) {
    workListModal.style.display = 'none';
    workListModal.setAttribute('aria-hidden', 'true');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && workListModal && workListModal.style.display === 'grid') {
    workListModal.style.display = 'none';
    workListModal.setAttribute('aria-hidden', 'true');
  }
});

// Open work list modal from button
calWorkList?.addEventListener('click', () => {
  // Hide the main prompt modal backdrop if open
  modalBackdrop.style.display = 'none';
  modalBackdrop.setAttribute('aria-hidden', 'true');
  
  renderWorkList();
  wireWorkListEvents();
  workListModal.style.display = 'grid';
  workListModal.setAttribute('aria-hidden', 'false');
});

loadTasks().catch((err) => {
  setSync(err?.message || 'Network error when attempting to fetch resource', false);
  render();
});
