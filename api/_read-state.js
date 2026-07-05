import { put, list, del } from '@vercel/blob';

/*
 * Read-state — shared (Helen + Andrew) tracking of which inbound
 * lodge emails have been opened in the portal.
 *
 * v2 (Jul 2026): per-email tombstone blobs replace the single shared
 * index blob. The old design did load -> mutate -> save on ONE blob per
 * dismiss; blob reads are eventually consistent (~1s), so rapid
 * sequential dismissals (Helen + Nate clearing an inbox) each started
 * from a stale base and clobbered earlier writes — dismissed emails
 * all returned on refresh.
 *
 * Now each read-mark is its own blob:
 *
 *   email-read-state/items/{emailId}.json   → { read_at }
 *
 * Writes are idempotent puts with no read-modify-write cycle, so there
 * is nothing to race. loadReadState() lists the prefix (pathname alone
 * carries the emailId; no per-blob fetches needed) and merges the
 * legacy single-blob index underneath for pre-migration state.
 *
 * The legacy blob at email-read-state/index.json is frozen — never
 * written again except by markUnread removing a legacy entry.
 */

const LEGACY_PATH = 'email-read-state/index.json';
const ITEM_PREFIX = 'email-read-state/items/';
const MAX_LIST_PAGES = 10;

function itemPath(emailId) {
  const safe = String(emailId).replace(/[^a-zA-Z0-9_.\-@]/g, '_').substring(0, 120);
  return ITEM_PREFIX + safe + '.json';
}

async function loadLegacyState() {
  try {
    const result = await list({ prefix: LEGACY_PATH, limit: 1 });
    if (!result.blobs || result.blobs.length === 0) return {};
    const r = await fetch(result.blobs[0].url, { cache: 'no-store' });
    if (!r.ok) return {};
    const data = await r.json();
    return data && typeof data === 'object' ? data : {};
  } catch (e) {
    console.error('loadLegacyState error:', e.message);
    return {};
  }
}

export async function loadReadState() {
  // Legacy blob first, tombstones override.
  const state = await loadLegacyState();
  try {
    let cursor;
    for (let i = 0; i < MAX_LIST_PAGES; i++) {
      const opts = { prefix: ITEM_PREFIX, limit: 1000 };
      if (cursor) opts.cursor = cursor;
      const result = await list(opts);
      for (const b of result.blobs || []) {
        const name = b.pathname.slice(ITEM_PREFIX.length).replace(/\.json$/, '');
        if (name) state[name] = b.uploadedAt || new Date().toISOString();
      }
      if (!result.hasMore) break;
      cursor = result.cursor;
    }
  } catch (e) {
    console.error('loadReadState list error:', e.message);
  }
  return state;
}

export async function markRead(emailId, readAt) {
  if (!emailId) throw new Error('markRead: emailId required');
  const stamp = readAt || new Date().toISOString();
  await put(itemPath(emailId), JSON.stringify({ read_at: stamp }), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { [emailId]: stamp };
}

export async function markManyRead(emailIds) {
  const stamp = new Date().toISOString();
  const out = {};
  const ids = (emailIds || []).filter(Boolean);
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    await Promise.all(batch.map(async (id) => {
      await put(itemPath(id), JSON.stringify({ read_at: stamp }), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      out[id] = stamp;
    }));
  }
  return out;
}

export async function markUnread(emailId) {
  if (!emailId) throw new Error('markUnread: emailId required');
  // Delete the tombstone if present.
  try {
    const result = await list({ prefix: itemPath(emailId), limit: 1 });
    if (result.blobs && result.blobs.length > 0) {
      await del(result.blobs[0].url);
    }
  } catch (e) {
    console.error('markUnread tombstone delete error:', e.message);
  }
  // Rare path: entry may live in the frozen legacy blob. Read-modify-write
  // is acceptable here — markUnread is a one-off action, not a bulk flow.
  try {
    const legacy = await loadLegacyState();
    if (emailId in legacy) {
      delete legacy[emailId];
      await put(LEGACY_PATH, JSON.stringify(legacy), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    }
  } catch (e) {
    console.error('markUnread legacy update error:', e.message);
  }
  return { removed: emailId };
}
