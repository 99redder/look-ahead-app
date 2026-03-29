const WORKER_BASE = process.env.LOOKAHEAD_WORKER_BASE;
const ALEXA_SECRET = process.env.LOOKAHEAD_ALEXA_SECRET;
const DEFAULT_USER_ID = process.env.LOOKAHEAD_USER_ID || 'chris';

function response(text, endSession = true) {
  return {
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text },
      shouldEndSession: endSession
    }
  };
}

function getIntent(req) {
  return req?.request?.intent || null;
}

function getSlot(intent, name) {
  const slot = intent?.slots?.[name];
  if (!slot) return '';
  if (slot.value) return slot.value;
  if (Array.isArray(slot.resolutions?.resolutionsPerAuthority)) {
    const resolved = slot.resolutions.resolutionsPerAuthority
      .flatMap((entry) => entry?.values || [])
      .map((entry) => entry?.value?.name)
      .find(Boolean);
    if (resolved) return resolved;
  }
  return '';
}

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nextWeekday(targetDay, from = new Date()) {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12, 0, 0, 0);
  const currentDay = date.getDay();
  let diff = (targetDay - currentDay + 7) % 7;
  if (diff === 0) diff = 7;
  date.setDate(date.getDate() + diff);
  return localDateString(date);
}

function parseDatePhrase(phrase) {
  const raw = String(phrase || '').trim().toLowerCase();
  if (!raw) return null;

  const now = new Date();
  if (raw === 'today') return localDateString(now);
  if (raw === 'tomorrow') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0);
    return localDateString(d);
  }

  const weekdays = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
  };

  const nextWeekdayMatch = raw.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (nextWeekdayMatch) {
    return nextWeekday(weekdays[nextWeekdayMatch[1]], now);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  return null;
}

function parseTaskPhrase(taskPhrase) {
  const raw = String(taskPhrase || '').trim();
  if (!raw) return { title: '', dueDate: null };

  const patterns = [
    /^(.*?)\s+for\s+(today|tomorrow|next\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|\d{4}-\d{2}-\d{2})$/i,
    /^(.*?)\s+(today|tomorrow|next\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|\d{4}-\d{2}-\d{2})$/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) {
      const title = String(match[1] || '').trim();
      const dueDate = parseDatePhrase(match[2] || '');
      if (title) return { title, dueDate };
    }
  }

  return { title: raw, dueDate: null };
}

async function callWorker(path, payload) {
  if (!WORKER_BASE || !ALEXA_SECRET) {
    throw new Error('Alexa integration env vars are not configured');
  }

  const res = await fetch(`${WORKER_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ALEXA_SECRET}`
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Worker request failed (${res.status})`);
  }
  return data;
}

async function handleAddTaskIntent(intent) {
  const taskPhrase = String(
    getSlot(intent, 'taskPhrase')
    || getSlot(intent, 'title')
    || getSlot(intent, 'query')
  ).trim();
  const { title, dueDate } = parseTaskPhrase(taskPhrase);

  if (!title) {
    return response('I did not catch the task title. Please try again.');
  }

  const finalDate = dueDate || localDateString();

  await callWorker('/api/integrations/alexa/add', {
    userId: DEFAULT_USER_ID,
    title,
    dueDate: finalDate,
    notes: '',
    kind: 'task'
  });

  return response(`Okay, I added ${title} for ${finalDate}.`);
}

async function handleGetTodayIntent() {
  const date = localDateString();
  const data = await callWorker('/api/integrations/alexa/today', {
    userId: DEFAULT_USER_ID,
    date
  });

  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    return response('You have nothing scheduled for today.');
  }

  const titles = items.slice(0, 5).map(i => i.title).filter(Boolean);
  const spoken = titles.length === 1
    ? titles[0]
    : `${titles.slice(0, -1).join(', ')}, and ${titles[titles.length - 1]}`;

  return response(`You have ${items.length} item${items.length === 1 ? '' : 's'} today: ${spoken}.`);
}

export const handler = async (event) => {
  try {
    const type = event?.request?.type;

    if (type === 'LaunchRequest') {
      return response('Look Ahead is ready. You can say, add buy milk tomorrow, or ask what is on my calendar today.');
    }

    if (type === 'IntentRequest') {
      const intent = getIntent(event);
      const name = intent?.name;

      if (name === 'AddTaskIntent') {
        return await handleAddTaskIntent(intent);
      }

      if (name === 'GetTodayIntent') {
        return await handleGetTodayIntent();
      }

      if (name === 'AMAZON.HelpIntent') {
        return response('Try saying, add dentist appointment tomorrow, or what is on my calendar today.');
      }

      if (name === 'AMAZON.CancelIntent' || name === 'AMAZON.StopIntent') {
        return response('Okay, goodbye.');
      }
    }

    return response('Sorry, I could not handle that request.');
  } catch (err) {
    console.error(err);
    return response('Sorry, something went wrong talking to Look Ahead.');
  }
};
