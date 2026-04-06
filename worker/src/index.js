// ===== LOOK AHEAD PLANNER WORKER =====

export default {
  async fetch(request, env) {
    try {
      const origin = request.headers.get('Origin') || '';
      const allowedOrigins = (env.ALLOWED_ORIGINS || '*')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      const allowAll = allowedOrigins.includes('*');
      const originAllowed = allowAll || !origin || allowedOrigins.includes(origin);

      const corsHeaders = {
        'Access-Control-Allow-Origin': allowAll ? '*' : (originAllowed ? origin : allowedOrigins[0] || ''),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-App-Password',
        'Vary': 'Origin'
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      if (!originAllowed) {
        return json({ ok: false, error: 'Origin not allowed' }, 403, corsHeaders);
      }

      const url = new URL(request.url);

      const appPassword = (env.APP_PASSWORD || '').trim();
      if (!appPassword) {
        return json({ ok: false, error: 'Server auth misconfigured' }, 503, corsHeaders);
      }

      const supplied = (request.headers.get('X-App-Password') || '').trim();
      if (supplied !== appPassword) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }

      // GET /api/planner/items - List items
      if (url.pathname === '/api/planner/items' && request.method === 'GET') {
        return handleGetItems(request, env, corsHeaders, url);
      }

      // POST /api/planner/items - Create or update item
      if (url.pathname === '/api/planner/items' && request.method === 'POST') {
        return handleSaveItem(request, env, corsHeaders, url);
      }

      // POST /api/planner/items/toggle - Toggle done status
      if (url.pathname === '/api/planner/items/toggle' && request.method === 'POST') {
        return handleToggleItem(request, env, corsHeaders, url);
      }

      // POST /api/planner/items/delete - Delete item
      if (url.pathname === '/api/planner/items/delete' && request.method === 'POST') {
        return handleDeleteItem(request, env, corsHeaders, url);
      }

      // POST /api/planner/items/reschedule - Change due date
      if (url.pathname === '/api/planner/items/reschedule' && request.method === 'POST') {
        return handleRescheduleItem(request, env, corsHeaders, url);
      }

      return json({ ok: false, error: 'Not found' }, 404, corsHeaders);
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

// Test whether category columns (category_id etc.) exist in the table.
// Uses a LIMIT 0 query — no rows fetched, just schema validation.
async function hasCategoryColumns(env) {
  try {
    await env.DB.prepare('SELECT category_id FROM planner_items LIMIT 0').all();
    return true;
  } catch {
    return false;
  }
}

// GET /api/planner/items?userId=xxx&includeDone=1
async function handleGetItems(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB not bound' }, 500, corsHeaders);

  const userId = url.searchParams.get('userId');
  if (!userId) return json({ ok: false, error: 'Missing userId' }, 400, corsHeaders);

  const includeDone = url.searchParams.get('includeDone') === '1';
  const statusClause = includeDone ? '' : " AND status = 'open'";
  const orderClause = " ORDER BY due_date ASC, COALESCE(due_time, '9999') ASC, id DESC";

  const hasCategories = await hasCategoryColumns(env);

  const cols = hasCategories
    ? 'id, user_id, kind, title, due_date, due_time, status, notes, source, category_id, category_name, category_color, created_at'
    : "id, user_id, kind, title, due_date, due_time, status, notes, source, NULL as category_id, NULL as category_name, NULL as category_color, created_at";

  const result = await env.DB.prepare(
    `SELECT ${cols} FROM planner_items WHERE user_id = ?1${statusClause}${orderClause}`
  ).bind(userId).all();

  return json({ ok: true, items: result.results || [] }, 200, corsHeaders);
}

// POST /api/planner/items - Create or update
async function handleSaveItem(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB not bound' }, 500, corsHeaders);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
  }

  const userId = data.userId;
  const title = (data.title || '').trim();
  const kind = data.kind || 'task';
  const dueDate = data.dueDate || null;
  const status = data.status || 'open';
  const dueTime = data.dueTime || null;
  const notes = data.notes || null;
  const source = data.source || 'lookahead';
  const categoryId = data.categoryId || null;
  const categoryName = data.categoryName || null;
  const categoryColor = data.categoryColor || null;
  const itemId = data.id;
  const isCategory = String(kind).toLowerCase() === 'category';

  if (!userId || !title) {
    return json({ ok: false, error: 'Missing userId or title' }, 400, corsHeaders);
  }

  const hasCategories = await hasCategoryColumns(env);

  if (itemId) {
    // Update existing
    if (hasCategories) {
      await env.DB.prepare(
        `UPDATE planner_items SET title = ?1, due_date = ?2, due_time = ?3, status = ?4, notes = ?5, source = ?6, category_id = ?7, category_name = ?8, category_color = ?9, updated_at = datetime('now') WHERE id = ?10 AND user_id = ?11`
      ).bind(title, dueDate, dueTime, status, notes, source, categoryId, categoryName, categoryColor, itemId, userId).run();

      if (isCategory && categoryId) {
        await env.DB.prepare(
          `UPDATE planner_items SET category_name = ?1, category_color = ?2, updated_at = datetime('now') WHERE user_id = ?3 AND kind != 'category' AND category_id = ?4`
        ).bind(title, categoryColor || notes || null, userId, categoryId).run();
      }
    } else {
      await env.DB.prepare(
        `UPDATE planner_items SET title = ?1, due_date = ?2, due_time = ?3, status = ?4, notes = ?5, source = ?6, updated_at = datetime('now') WHERE id = ?7 AND user_id = ?8`
      ).bind(title, dueDate, dueTime, status, notes, source, itemId, userId).run();
    }
    return json({ ok: true, id: itemId }, 200, corsHeaders);
  } else {
    // Create new
    let id;
    if (hasCategories) {
      const result = await env.DB.prepare(
        `INSERT INTO planner_items (user_id, kind, title, due_date, due_time, status, notes, source, category_id, category_name, category_color) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
      ).bind(userId, kind, title, dueDate, dueTime, status, notes, source, categoryId, categoryName, categoryColor).run();
      id = result.meta?.last_row_id;

      if (isCategory && categoryId) {
        await env.DB.prepare(
          `UPDATE planner_items SET category_name = ?1, category_color = ?2, updated_at = datetime('now') WHERE user_id = ?3 AND kind != 'category' AND category_id = ?4`
        ).bind(title, categoryColor || notes || null, userId, categoryId).run();
      }
    } else {
      const result = await env.DB.prepare(
        `INSERT INTO planner_items (user_id, kind, title, due_date, due_time, status, notes, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      ).bind(userId, kind, title, dueDate, dueTime, status, notes, source).run();
      id = result.meta?.last_row_id;
    }
    return json({ ok: true, id: Number(id) }, 200, corsHeaders);
  }
}

// POST /api/planner/items/toggle
async function handleToggleItem(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB not bound' }, 500, corsHeaders);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
  }

  const id = data.id;
  if (!id) return json({ ok: false, error: 'Missing id' }, 400, corsHeaders);

  const existing = await env.DB.prepare('SELECT status FROM planner_items WHERE id = ?1').bind(id).first();
  if (!existing) return json({ ok: false, error: 'Item not found' }, 404, corsHeaders);

  const newStatus = existing.status === 'done' ? 'open' : 'done';
  await env.DB.prepare("UPDATE planner_items SET status = ?1, updated_at = datetime('now') WHERE id = ?2").bind(newStatus, id).run();

  return json({ ok: true, status: newStatus }, 200, corsHeaders);
}

// POST /api/planner/items/delete
async function handleDeleteItem(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB not bound' }, 500, corsHeaders);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
  }

  const id = data.id;
  if (!id) return json({ ok: false, error: 'Missing id' }, 400, corsHeaders);

  await env.DB.prepare('DELETE FROM planner_items WHERE id = ?1').bind(id).run();

  return json({ ok: true }, 200, corsHeaders);
}

// POST /api/planner/items/reschedule
async function handleRescheduleItem(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB not bound' }, 500, corsHeaders);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
  }

  const id = data.id;
  const dueDate = data.dueDate || null;

  if (!id) return json({ ok: false, error: 'Missing id' }, 400, corsHeaders);

  await env.DB.prepare("UPDATE planner_items SET due_date = ?1, updated_at = datetime('now') WHERE id = ?2").bind(dueDate, id).run();

  return json({ ok: true }, 200, corsHeaders);
}
