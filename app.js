const STORAGE_KEY = 'lookahead.tasks.v1';
// password: change-me-now
const PASSWORD_SHA256 = '4f6d054536d6613a91472139cc60f0729702665f48f59a9b56208079c9d31f97';

const authOverlay = document.getElementById('auth-overlay');
const authPassword = document.getElementById('auth-password');
const authSubmit = document.getElementById('auth-submit');
const authError = document.getElementById('auth-error');
const app = document.getElementById('app');

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

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
function load() {
  try { tasks = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { tasks = []; }
}

function render() {
  const sorted = [...tasks].sort((a,b) => (a.date||'').localeCompare(b.date||''));
  taskList.innerHTML = sorted.map(t => `
    <div class="item ${t.done ? 'done' : ''}">
      <div>
        <div class="title">${t.title}</div>
        <div>${t.date || 'No date'}</div>
      </div>
      <div class="actions">
        <button data-id="${t.id}" data-act="toggle">${t.done ? 'Undo' : 'Done'}</button>
        <button data-id="${t.id}" data-act="delete">Delete</button>
      </div>
    </div>
  `).join('');
}

addTaskBtn.addEventListener('click', () => {
  const title = taskTitle.value.trim();
  const date = taskDate.value;
  if (!title) return;
  tasks.push({ id: crypto.randomUUID(), title, date, done: false });
  save();
  render();
  taskTitle.value = '';
});

taskList.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  if (act === 'toggle') t.done = !t.done;
  if (act === 'delete') tasks = tasks.filter(x => x.id !== id);
  save();
  render();
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
  load();
  render();
});
