import { list } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';
import { loadReadState, markManyRead } from './_read-state.js';

/*
 * /api/sync-gmail-read-state
 *
 * One-shot backfill that brings the portal's read state in line with
 * Helen's Gmail read state. Run this once at cutover; the portal
 * becomes the source of truth from this point.
 *
 * Logic:
 *   1. List every stored inbound email blob under emails/booking/
 *   2. Skip outbound emails and any blob already marked read
 *   3. For each candidate:
 *        - If the email is >30 days old → mark read (Helen has
 *          already dealt with it; if not, it'll surface again as
 *          a fresh reply from the lodge)
 *        - Else fetch Gmail metadata (cheap, just labelIds) and
 *          mark read if UNREAD is missing from labelIds
 *   4. Write a single bulk update to read-state blob
 *
 * Parallel batches of 20 against Gmail to fit Vercel's 120s budget.
 *
 * Idempotent: re-running is a no-op once everything is synced.
 *
 * Optional ?dry_run=1 — counts what would change without writing.
 */

const STALE_DAYS = 30;
const PARALLEL_BATCH = 20;
const MAX_PAGES = 20; // 20 * default page = thousands of blobs, well within scale

async function listAllInboundBlobs() {
  const out = [];
  let cursor;
  for (let i = 0; i < MAX_PAGES; i++) {
    const opts = { prefix: 'emails/booking/' };
    if (cursor) opts.cursor = cursor;
    const r = await list(opts);
    if (r.blobs) out.push(...r.blobs);
    if (!r.hasMore) break;
    cursor = r.cursor;
  }
  return out;
}

async function fetchBlobMetadata(blobs) {
  const out = [];
  for (let i = 0; i < blobs.length; i += PARALLEL_BATCH) {
    const batch = blobs.slice(i, i + PARALLEL_BATCH);
    const results = await Promise.all(batch.map(async (b) => {
      try {
        const r = await fetch(b.url, { cache: 'no-store' });
        if (!r.ok) return null;
        const d = await r.json();
        return {
          id: d.id,
          gmail_message_id: d.gmail_message_id || d.message_id,
          direction: d.direction,
          email_date: d.email_date || d.date,
          blob_path: b.pathname,
        };
      } catch (e) {
        return null;
      }
    }));
    results.forEach(r => { if (r) out.push(r); });
  }
  return out;
}

async function checkGmailRead(token, gmailMessageId) {
  try {
    const meta = await gmailApi(token, 'messages/' + gmailMessageId + '?format=metadata&metadataHeaders=Subject');
    if (!meta || !Array.isArray(meta.labelIds)) return null; // unknown
    return !meta.labelIds.includes('UNREAD');
  } catch (e) {
    return null; // treat as unknown — leave read state as-is
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';
    const startedAt = Date.now();
    const deadlineMs = 110_000; // leave 10s headroom inside the 120s function budget

    // 1. Read existing state — anything already marked read can skip
    const readState = await loadReadState();

    // 2. List all inbound emails
    const allBlobs = await listAllInboundBlobs();
    console.log('sync-gmail-read-state: listed', allBlobs.length, 'blobs');

    // 3. Fetch metadata so we can filter inbound + already-read
    const metas = await fetchBlobMetadata(allBlobs);
    console.log('sync-gmail-read-state: fetched', metas.length, 'blob metadata');

    const inbound = metas.filter(m => m && m.direction !== 'outbound');
    const candidates = inbound.filter(m => m.id && !readState[m.id]);

    // 4. Split: stale auto-marked, recent need Gmail check
    const staleCutoff = Date.now() - STALE_DAYS * 86400_000;
    const toMarkRead = [];
    const toCheckGmail = [];
    const skippedNoGmailId = [];

    for (const m of candidates) {
      const ts = m.email_date ? Date.parse(m.email_date) : NaN;
      if (!isNaN(ts) && ts < staleCutoff) {
        toMarkRead.push(m.id);
        continue;
      }
      if (!m.gmail_message_id) {
        skippedNoGmailId.push(m.id);
        continue;
      }
      toCheckGmail.push(m);
    }

    // 5. Hit Gmail for the recent ones — parallel batches
    let gmailUnknown = 0;
    let gmailStillUnread = 0;
    let hitDeadline = false;

    if (toCheckGmail.length > 0) {
      const token = await getGmailToken();
      for (let i = 0; i < toCheckGmail.length; i += PARALLEL_BATCH) {
        if (Date.now() - startedAt > deadlineMs) {
          hitDeadline = true;
          break;
        }
        const batch = toCheckGmail.slice(i, i + PARALLEL_BATCH);
        const results = await Promise.all(batch.map(async (m) => {
          const isRead = await checkGmailRead(token, m.gmail_message_id);
          return { id: m.id, isRead };
        }));
        for (const r of results) {
          if (r.isRead === true) toMarkRead.push(r.id);
          else if (r.isRead === false) gmailStillUnread++;
          else gmailUnknown++;
        }
      }
    }

    // 6. Write updates
    if (!dryRun && toMarkRead.length > 0) {
      await markManyRead(toMarkRead);
    }

    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      stats: {
        total_blobs: allBlobs.length,
        inbound: inbound.length,
        already_read_skipped: inbound.length - candidates.length,
        marked_stale: candidates.length - toCheckGmail.length - skippedNoGmailId.length,
        gmail_checked: toCheckGmail.length,
        marked_via_gmail: toMarkRead.length - (candidates.length - toCheckGmail.length - skippedNoGmailId.length),
        gmail_still_unread: gmailStillUnread,
        gmail_unknown: gmailUnknown,
        skipped_no_gmail_id: skippedNoGmailId.length,
        total_marked_read: toMarkRead.length,
        hit_timeout: hitDeadline,
        elapsed_ms: Date.now() - startedAt,
      },
    });
  } catch (err) {
    console.error('sync-gmail-read-state error:', err);
    return res.status(500).json({ error: err.message });
  }
}
