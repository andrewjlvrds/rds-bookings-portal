import { put, list } from '@vercel/blob';

/*
 * Activity log — Helen's daily action log.
 *
 * Replaces the parallel spreadsheet she's been keeping. Cross-cuts
 * bookings, lodges, tours: one log per ops team, viewable globally
 * (timeline) or filtered to a specific booking.
 *
 * Single-blob design: `notes/log.json`, an array of entries.
 *
 *   {
 *     id, created_at, author,
 *     action,          // free-text — what was done
 *     category,        // email | payment | call | whatsapp | other
 *     status,          // done | waiting | follow_up
 *     follow_up_date,  // optional ISO date
 *     recipient,       // optional free text — Mike, Livingstone Lodge, ...
 *     booking_ids,     // array of Zoho booking IDs
 *     email_id,        // optional — if the entry was triggered by an email
 *     tour_name,       // optional — denormalised for filtering
 *     amount,          // optional — { value, currency }
 *     resolved_at,     // ISO when status moved to done from waiting
 *   }
 *
 * Append-only: entries are never destructively edited. Status updates
 * mutate the record (status + resolved_at) but the original action
 * text is preserved.
 *
 * Atomicity note: same race-condition story as read-state. Acceptable
 * for one ops team. If it ever becomes a problem we move to per-entry
 * blobs and aggregate on read.
 */

const BLOB_PATH = 'notes/log.json';

export async function loadLog() {
  try {
    const result = await list({ prefix: BLOB_PATH, limit: 1 });
    if (!result.blobs || result.blobs.length === 0) return [];
    const blob = result.blobs[0];
    const r = await fetch(blob.url, { cache: 'no-store' });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('loadLog error:', e.message);
    return [];
  }
}

async function saveLog(entries) {
  await put(BLOB_PATH, JSON.stringify(entries), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

function generateId() {
  return 'log_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
}

export async function appendEntry(entry) {
  if (!entry || !entry.action) throw new Error('appendEntry: action required');
  const log = await loadLog();
  const record = {
    id: entry.id || generateId(),
    created_at: entry.created_at || new Date().toISOString(),
    author: entry.author || 'Helen',
    action: String(entry.action).trim(),
    category: entry.category || 'other',
    status: entry.status || 'done',
    follow_up_date: entry.follow_up_date || null,
    recipient: entry.recipient || null,
    booking_ids: Array.isArray(entry.booking_ids) ? entry.booking_ids.filter(Boolean) : [],
    email_id: entry.email_id || null,
    tour_name: entry.tour_name || null,
    amount: entry.amount || null,
    resolved_at: entry.status === 'done' ? (entry.resolved_at || new Date().toISOString()) : null,
  };
  log.push(record);
  await saveLog(log);
  return record;
}

export async function updateEntryStatus(id, status, opts = {}) {
  if (!id) throw new Error('updateEntryStatus: id required');
  const log = await loadLog();
  const idx = log.findIndex(e => e.id === id);
  if (idx === -1) return null;
  log[idx].status = status;
  if (status === 'done' && !log[idx].resolved_at) {
    log[idx].resolved_at = new Date().toISOString();
  }
  if (status !== 'done') log[idx].resolved_at = null;
  if (opts.follow_up_date !== undefined) log[idx].follow_up_date = opts.follow_up_date;
  await saveLog(log);
  return log[idx];
}

export async function deleteEntry(id) {
  if (!id) throw new Error('deleteEntry: id required');
  const log = await loadLog();
  const filtered = log.filter(e => e.id !== id);
  if (filtered.length === log.length) return null;
  await saveLog(filtered);
  return { id, deleted: true };
}

// Find open "waiting" entries for a booking — used by poll-gmail to
// auto-resolve when an inbound reply arrives matched to that booking.
export async function findWaitingForBooking(bookingId) {
  if (!bookingId) return [];
  const log = await loadLog();
  return log.filter(e =>
    e.status === 'waiting' &&
    Array.isArray(e.booking_ids) &&
    e.booking_ids.includes(bookingId)
  );
}

// Tag waiting entries with reply_received_at when an inbound reply
// matches their booking. Status stays 'waiting' until Helen confirms;
// the Inbox surfaces these as "reply received — mark done?" prompts.
export async function tagReplyReceived(bookingId, emailId) {
  if (!bookingId) return [];
  const log = await loadLog();
  const stamp = new Date().toISOString();
  const tagged = [];
  let modified = false;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.status !== 'waiting') continue;
    if (!Array.isArray(e.booking_ids) || !e.booking_ids.includes(bookingId)) continue;
    // Don't re-tag entries that already have a reply tagged
    if (e.reply_received_at) continue;
    log[i].reply_received_at = stamp;
    if (emailId && !e.reply_email_id) log[i].reply_email_id = emailId;
    tagged.push(log[i]);
    modified = true;
  }
  if (modified) await saveLog(log);
  return tagged;
}

// When an email is reassigned from one booking to another, any log
// entries that reference the email_id must have their booking_ids
// updated so the activity log doesn't lie about which booking the
// outbound went to. Replaces the old booking_id with the new one
// inside the booking_ids array; preserves any other linked bookings.
export async function reassignEmailLinks(emailId, oldBookingId, newBookingId) {
  if (!emailId || !newBookingId) return [];
  const log = await loadLog();
  const updated = [];
  let modified = false;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    // Match either the entry that auto-logged the send OR the entry
    // that recorded the reply
    const matchesEmail = e.email_id === emailId || e.reply_email_id === emailId;
    if (!matchesEmail) continue;
    if (!Array.isArray(e.booking_ids)) continue;
    // Replace old booking id with new one (or just add new if old not present)
    const oldIdx = oldBookingId ? e.booking_ids.indexOf(oldBookingId) : -1;
    if (oldIdx !== -1) {
      log[i].booking_ids = e.booking_ids.slice();
      log[i].booking_ids[oldIdx] = newBookingId;
      updated.push(log[i]);
      modified = true;
    } else if (!e.booking_ids.includes(newBookingId)) {
      log[i].booking_ids = e.booking_ids.concat([newBookingId]);
      updated.push(log[i]);
      modified = true;
    }
  }
  if (modified) await saveLog(log);
  return updated;
}
