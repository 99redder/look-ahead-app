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

// GET /api/planner/items?userId=xxx&includeDone=1
async function handleGetItems(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB not bound' }, 500, corsHeaders);

  const userId = url.searchParams.get('userId');
  if (!userId) return json({ ok: false, error: 'Missing userId' }, 400, corsHeaders);

  const includeDone = url.searchParams.get('includeDone') === '1';
  
  let query = 'SELECT id, user_id, kind, title, due_date, status, notes, source, created_at FROM planner_items WHERE user_id = ?1';
  if (!includeDone) {
    query += " AND status = 'open'";
  }
  query += ' ORDER BY due_date ASC, id DESC';

  const result = await env.DB.prepare(query).bind(userId).all();
  
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
  const notes = data.notes || null;
  const source = data.source || 'lookahead';
  const itemId = data.id;

  if (!userId || !title) {
    return json({ ok: false, error: 'Missing userId or title' }, 400, corsHeaders);
  }

  if (itemId) {
    // Update existing
    await env.DB.prepare(
      `UPDATE planner_items SET title = ?1, due_date = ?2, status = ?3, notes = ?4, source = ?5, updated_at = datetime('now') WHERE id = ?6 AND user_id = ?7`
    ).bind(title, dueDate, status, notes, source, itemId, userId).run();
    return json({ ok: true, id: itemId }, 200, corsHeaders);
  } else {
    // Create new
    const result = await env.DB.prepare(
      `INSERT INTO planner_items (user_id, kind, title, due_date, status, notes, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    ).bind(userId, kind, title, dueDate, status, notes, source).run();
    const id = result.meta?.last_row_id;
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

  // Get current status
  const existing = await env.DB.prepare('SELECT status FROM planner_items WHERE id = ?1').bind(id).first();
  if (!existing) return json({ ok: false, error: 'Item not found' }, 404, corsHeaders);

  const newStatus = existing.status === 'done' ? 'open' : 'done';
  await env.DB.prepare('UPDATE planner_items SET status = ?1, updated_at = datetime(\'now\') WHERE id = ?2').bind(newStatus, id).run();

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

  await env.DB.prepare('UPDATE planner_items SET due_date = ?1, updated_at = datetime(\'now\') WHERE id = ?2').bind(dueDate, id).run();

  return json({ ok: true }, 200, corsHeaders);
}
