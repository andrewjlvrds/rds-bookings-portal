/**
 * /api/backfill-sent-index
 *
 * One-off: scans all stored outbound email blobs, fetches each email's
 * Message-ID header from Gmail, and writes a sent-index entry so Tier 0
 * matching works for emails sent before storeSentIndex was added (22 Apr 2026).
 *
 * Safe to re-run — storeSentIndex uses addRandomSuffix:false so it's idempotent.
 *
 * GET ?dry_run=1   — report what would be written without writing
 * GET ?limit=N     — max blobs to process (default 500)
 *
 * DELETE THIS ENDPOINT after running successfully.
 */

import { list } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';
import { storeSentIndex, normalizeMessageId } from './_email-store.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const t0 = Date.now();
  const DEADLINE = 110000; // 110s — leave 10s headroom for 120s maxDuration
  const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';
  const limit = Math.min(parseInt(req.query.limit || '500', 10), 2000);

  try {
    // 1. List all outbound email blobs
    const allBlobs = [];
    let cursor;
    for (let p = 0; p < 20; p++) {
      if (Date.now() - t0 > 30000) break;
      const r = await list({ prefix: 'emails/booking/', limit: 1000, cursor });
      allBlobs.push(...(r.blobs || []));
      cursor = r.cursor;
      if (!cursor) break;
    }

    // 2. Fetch blob records in parallel batches to find outbound ones
    const outboundBlobs = [];
    const batchSize = 20;
    for (let i = 0; i < allBlobs.length && outboundBlobs.length < limit; i += batchSize) {
      if (Date.now() - t0 > DEADLINE) break;
      const batch = allBlobs.slice(i, i + batchSize);
      const records = await Promise.all(batch.map(async b => {
        try {
          const r = await fetch(b.url);
          if (!r.ok) return null;
          const d = await r.json();
          return { blob: b, record: d };
        } catch { return null; }
      }));
      for (const item of records) {
        if (!item) continue;
        const { record, blob } = item;
        // Only outbound emails that have a gmail_message_id and booking_id
        if (record.direction === 'outbound' && record.gmail_message_id && record.booking_id) {
          outboundBlobs.push({ record, blob });
        }
      }
    }

    // 3. For each outbound blob, check if sent-index already exists; if not, backfill
    let token;
    try { token = await getGmailToken(); } catch (e) {
      return res.status(500).json({ error: 'Gmail token failed: ' + e.message });
    }

    let written = 0;
    let alreadyExisted = 0;
    let gmailFetchFailed = 0;
    let errors = 0;
    const details = [];

    for (const { record } of outboundBlobs) {
      if (Date.now() - t0 > DEADLINE) {
        details.push({ status: 'deadline_reached' });
        break;
      }

      const gmailMsgId = record.gmail_message_id;
      const bookingId = record.booking_id;
      const subject = record.subject || record.email_subject || '';
      const gmailThreadId = record.gmail_thread_id || null;

      // Check if sent-index already exists via thread ID (fast)
      let alreadyDone = false;
      if (gmailThreadId) {
        try {
          const { list: blobList } = await import('@vercel/blob');
          const existing = await blobList({
            prefix: 'emails/sent-index/thread-' + gmailThreadId + '.json',
            limit: 1,
          });
          if (existing.blobs && existing.blobs.length > 0) {
            alreadyExisted++;
            alreadyDone = true;
          }
        } catch {}
      }

      if (alreadyDone) continue;

      // Fetch the actual Message-ID header from Gmail
      let rfcMessageId = record.rfc_message_id || null;
      if (!rfcMessageId) {
        try {
          const msgData = await gmailApi(
            token,
            'messages/' + gmailMsgId + '?format=metadata&metadataHeaders=Message-ID'
          );
          const hdrs = (msgData.payload && msgData.payload.headers) || [];
          for (const h of hdrs) {
            if (h.name && h.name.toLowerCase() === 'message-id') {
              rfcMessageId = normalizeMessageId(h.value);
              break;
            }
          }
        } catch (e) {
          gmailFetchFailed++;
          details.push({ gmail_id: gmailMsgId, error: 'gmail_fetch: ' + e.message });
          continue;
        }
      }

      if (!rfcMessageId) {
        gmailFetchFailed++;
        details.push({ gmail_id: gmailMsgId, error: 'no_message_id' });
        continue;
      }

      if (!dryRun) {
        try {
          await storeSentIndex({
            rfc_message_id: rfcMessageId,
            gmail_message_id: gmailMsgId,
            gmail_thread_id: gmailThreadId,
            booking_ids: [bookingId],
            subject,
            sent_at: record.date || record.processed_at || new Date().toISOString(),
          });
          written++;
          details.push({ rfc: rfcMessageId, booking: bookingId, status: 'written' });
        } catch (e) {
          errors++;
          details.push({ rfc: rfcMessageId, booking: bookingId, error: e.message });
        }
      } else {
        written++;
        details.push({ rfc: rfcMessageId, booking: bookingId, status: 'dry_run' });
      }
    }

    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      outbound_found: outboundBlobs.length,
      already_existed: alreadyExisted,
      written,
      gmail_fetch_failed: gmailFetchFailed,
      errors,
      elapsed_ms: Date.now() - t0,
      details: details.slice(0, 50), // cap detail output
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
