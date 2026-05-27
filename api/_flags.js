// Shared flag state for lodge emails.
// Stored as a single JSON blob: { "email-id": "2026-05-27T..." } 
// Presence = flagged, absence = not flagged.
import { put, list } from '@vercel/blob';

const BLOB_PATH = 'email-flags/index.json';

export async function loadFlags() {
  try {
    const result = await list({ prefix: BLOB_PATH, limit: 1 });
    if (!result.blobs || !result.blobs.length) return {};
    const r = await fetch(result.blobs[0].url, { cache: 'no-store' });
    if (!r.ok) return {};
    const data = await r.json();
    return data && typeof data === 'object' ? data : {};
  } catch(e) { return {}; }
}

async function saveFlags(flags) {
  await put(BLOB_PATH, JSON.stringify(flags), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false,
  });
}

export async function toggleFlag(emailId) {
  if (!emailId) throw new Error('emailId required');
  const flags = await loadFlags();
  if (flags[emailId]) {
    delete flags[emailId];
  } else {
    flags[emailId] = new Date().toISOString();
  }
  await saveFlags(flags);
  return { flagged: !!flags[emailId], flags };
}
