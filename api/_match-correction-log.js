import { put, list } from '@vercel/blob';

/*
 * Match-correction log.
 *
 * Every email reassignment is a labelled signal: Helen telling us
 * the matcher got it wrong, plus exactly what 'right' was. We append
 * one entry per reassignment so we can later review patterns without
 * scanning every email blob.
 *
 * Stored at match-corrections/log.json — single blob, array of records.
 * Same race-condition story as activity log and read state: acceptable
 * for one-ops-team scale, last-write-wins.
 *
 * Entry shape:
 *   {
 *     id, created_at,
 *     email_id,                     // stable id of the email blob
 *     gmail_message_id,             // for cross-referencing with Gmail
 *     subject, from, email_date,    // what the matcher had to work with
 *     extracted_rds_ref,            // any RDS-ref token found in subject
 *     extracted_dates: [iso, ...],  // dates pulled from subject/body
 *
 *     // What the matcher decided:
 *     original_booking_id,
 *     original_match_method,
 *
 *     // What Helen corrected to:
 *     new_booking_id,
 *     new_booking_lodge,            // lodge name at the new booking (denormalised for review)
 *     new_booking_check_in,         // check-in date at the new booking
 *
 *     // Source surface (Inbox vs LodgeDetail) — useful telemetry on
 *     // where Helen tends to spot misroutes.
 *     surface,                      // 'inbox' | 'lodge_detail'
 *     time_since_match_ms,          // gap between matcher decision and Helen's correction
 *
 *     author,                       // 'Helen' | 'Andrew'
 *   }
 */

const BLOB_PATH = 'match-corrections/log.json';

export async function loadCorrections() {
  try {
    const result = await list({ prefix: BLOB_PATH, limit: 1 });
    if (!result.blobs || result.blobs.length === 0) return [];
    const blob = result.blobs[0];
    const r = await fetch(blob.url, { cache: 'no-store' });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('loadCorrections error:', e.message);
    return [];
  }
}

async function saveCorrections(entries) {
  await put(BLOB_PATH, JSON.stringify(entries), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

function generateId() {
  return 'corr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
}

export async function appendCorrection(entry) {
  if (!entry) throw new Error('appendCorrection: entry required');
  const log = await loadCorrections();
  const record = {
    id: generateId(),
    created_at: new Date().toISOString(),
    ...entry,
  };
  log.push(record);
  await saveCorrections(log);
  return record;
}
