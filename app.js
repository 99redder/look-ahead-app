// TODO: Update the worker URL below after deploying
const API_BASES = [
  'https://look-ahead-planner.99redder.workers.dev',
];

const USER_ID = 'chris';
const CATEGORY_KIND = 'category';
const DEFAULT_CATEGORY_ID = 'uncategorized';
const DEFAULT_CATEGORY_COLOR = '#b6ffac';
const CATEGORY_COLORS = [
  '#b6ffac', '#7dff63', '#39ff14', '#00f5d4',
  '#7bdff2', '#6fa8ff', '#b794ff', '#ff4fd8',
  '#ff8fb3', '#ffb86b', '#ffe66d', '#c3f73a'
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
  return task;
}

function getCategoryById(categoryId) {
  ensureDefaultCategory();
  return categories.find((category) => String(category.categoryId) === String(categoryId))
    || categories.find((category) => category.categoryId === DEFAULT_CATEGORY_ID)
    || { categoryId: DEFAULT_CATEGORY_ID, name: 'Uncategorized', color: DEFAULT_CATEGORY_COLOR };
}

function getTaskCategory(task) {
  return getCategoryById(task?.categoryId || DEFAULT_CATEGORY_ID);
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
  const id = category?.id || `category:${categoryIdForName(name, category?.categoryId)}`;
  const categoryId = categoryIdForName(name, String(id).replace(/^category:/, ''));
  await api('/api/planner/items', {
    method: 'POST',
    body: JSON.stringify({
      id,
      userId: USER_ID,
      kind: CATEGORY_KIND,
      title: name,
      name,
      color: normalizeHexColor(category?.color),
      categoryId,
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
    <button class="category-chip${category.categoryId === DEFAULT_CATEGORY_ID ? ' category-chip-default' : ''}" data-category-id="${escapeHtml(category.categoryId)}" type="button">
      <span class="category-dot" style="background:${escapeHtml(normalizeHexColor(category.color))};"></span>
      <span>${escapeHtml(category.name)}</span>
    </button>
  `).join('');
}

function renderTaskItem(task, compact = false) {
  const category = getTaskCategory(task);
  const title = `${formatMilitaryTime(task.due_time) ? `${formatMilitaryTime(task.due_time)} ` : ''}${task.title}`;
  return `<div class="cal-item${task.status === 'done' ? ' done' : ''}" draggable="true" data-drag-task-id="${task.id}" style="${getTaskChipStyle(task)}">
    <span class="cal-item-title">${escapeHtml(title)}</span>
    ${compact ? '' : `<span class="cal-item-category">${escapeHtml(category.name)}</span>`}
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
        ? dayItems.map((task) => `<div class="focus-time-item ${task.status === 'done' ? 'done' : ''}" style="border-left:4px solid ${escapeHtml(getTaskCategory(task).color)}"><span class="focus-time">${escapeHtml(formatMilitaryTime(task.due_time) || 'UNSET')}</span><span class="focus-time-title">${escapeHtml(task.title)}</span></div>`).join('') || '<div class="empty-state">No tasks for this day</div>'
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
          <div>${escapeHtml(task.due_date || 'No date')}${formatMilitaryTime(task.due_time) ? ` · ${escapeHtml(formatMilitaryTime(task.due_time))}` : ''} · ${escapeHtml(category.name)}</div>
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
  document.getElementById('cal-focus').textContent = focusMode ? 'EXPAND' : 'FOCUS';
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

loadTasks().catch((err) => {
  setSync(err?.message || 'Network error when attempting to fetch resource', false);
  render();
});
