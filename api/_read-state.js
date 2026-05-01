import { put, list } from '@vercel/blob';

/*
 * Read-state — shared (Helen + Andrew) tracking of which inbound
 * lodge emails have been opened in the portal.
 *
 * Stored as a single JSON blob at `email-read-state/index.json`.
 *
 *   { "email-id-1": "2026-05-01T12:34:56.789Z",
 *     "email-id-2": "2026-05-01T12:35:01.123Z" }
 *
 * Single-blob design chosen over per-email writes:
 *   - portal load reads ONE blob, not N
 *   - shared state across users (intentional, per Andrew)
 *   - last-write-wins is fine at this volume (one ops team)
 *
 * Race condition note: two near-simultaneous read-marks could lose one
 * of the writes. Acceptable — worst case Helen sees a single email
 * still bolded after Andrew opened it; she clicks once more.
 */

const BLOB_PATH = 'email-read-state/index.json';

export async function loadReadState() {
  try {
    const result = await list({ prefix: BLOB_PATH, limit: 1 });
    if (!result.blobs || result.blobs.length === 0) return {};
    const blob = result.blobs[0];
    const r = await fetch(blob.url, { cache: 'no-store' });
    if (!r.ok) return {};
    const data = await r.json();
    return data && typeof data === 'object' ? data : {};
  } catch (e) {
    console.error('loadReadState error:', e.message);
    return {};
  }
}

async function saveReadState(state) {
  await put(BLOB_PATH, JSON.stringify(state), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

export async function markRead(emailId, readAt) {
  if (!emailId) throw new Error('markRead: emailId required');
  const state = await loadReadState();
  state[emailId] = readAt || new Date().toISOString();
  await saveReadState(state);
  return state;
}

export async function markUnread(emailId) {
  if (!emailId) throw new Error('markUnread: emailId required');
  const state = await loadReadState();
  if (emailId in state) {
    delete state[emailId];
    await saveReadState(state);
  }
  return state;
}

export async function markManyRead(emailIds) {
  if (!Array.isArray(emailIds) || emailIds.length === 0) return {};
  const state = await loadReadState();
  const stamp = new Date().toISOString();
  emailIds.forEach(id => { if (id) state[id] = stamp; });
  await saveReadState(state);
  return state;
}
