// Bulk reparse — fix empty-body blobs and run AI parse across all tours or a specific tour.
// Modes:
//   delete_empty: delete empty-body inbound blobs so cron reprocesses them
//   parse_unparsed: AI parse stored inbound emails that haven't been parsed yet
// POST { tour_name?: "FoSA Apr 27", mode: "delete_empty"|"parse_unparsed", dry_run?: true }
// Omit tour_name to run across all tours.

import { list, del, put } from '@vercel/blob';
import { zohoApi } from './_zoho.js';
import { parseEmail, extractionToZohoFields } from './_ai-parse.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { tour_name, mode = 'delete_empty', dry_run } = req.body || {};

    const t0 = Date.now();
    const DEADLINE = 55000;

    // Fetch all bookings, optionally filter by tour
    let allBookings = [], page = 1, more = true;
    while (more && page <= 5) {
      const r = await zohoApi('GET', 'Lodge_Bookings?fields=id,Name,Tour,Lodge_Name,Check_in_Date,Check_out_Date,Nights,Meals,Sgl_Twin_Dbl_Guides,Guide_Rooms,Status,Deposit_Amount,Second_Payment_Amount,Third_Payment_Amount,Fourth_Payment_Amount,Deposit_Due_Date,Second_Payment_Due_Date,Third_Payment_Due_Date,Fourth_Payment_Due_Date,Deposit_Paid_Date,nd_Payment_Paid_Date,rd_Payment_Paid_Date,th_Payment_Paid_Date&per_page=200&page=' + page);
      allBookings = allBookings.concat((r && r.data) || []);
      more = r && r.info && r.info.more_records;
      page++;
    }

    const bookings = tour_name
      ? allBookings.filter(bk => {
          const t = bk.Tour && typeof bk.Tour === 'object' ? bk.Tour.name : bk.Tour || '';
          return t === tour_name;
        })
      : allBookings;

    const results = [];
    let actioned = 0, skipped = 0, errors = 0, remaining = 0;

    for (const bk of bookings) {
      if (Date.now() - t0 > DEADLINE) { remaining++; continue; }
      try {
        const blobs = await list({ prefix: 'emails/booking/' + bk.id + '/' });
        for (const blob of blobs.blobs) {
          if (Date.now() - t0 > DEADLINE) { remaining++; continue; }
          const r = await fetch(blob.url);
          const email = await r.json();
          const body = email.body || email.email_content || '';
          const isInbound = email.direction === 'inbound';

          if (mode === 'delete_empty') {
            if (!isInbound || body.trim()) { skipped++; continue; }
            if (!dry_run) await del(blob.url);
            results.push({ action: 'deleted', path: blob.pathname, booking: bk.Name });
            actioned++;

          } else if (mode === 'parse_unparsed') {
            if (!isInbound || !body.trim()) { skipped++; continue; }
            // Skip if already parsed — check blob's parsed_at field
            if (email.parsed_at) { skipped++; continue; }
            if (dry_run) {
              results.push({ action: 'would_parse', path: blob.pathname, booking: bk.Name });
              actioned++; continue;
            }
            try {
              const tourName = bk.Tour && typeof bk.Tour === 'object' ? bk.Tour.name : bk.Tour || '';
              const bookingContext = {
                lodge_name: (bk.Lodge_Name && typeof bk.Lodge_Name === 'object' ? bk.Lodge_Name.name : bk.Lodge_Name) || bk.Name || '',
                tour_name: tourName,
                check_in: bk.Check_in_Date || '',
                check_out: bk.Check_out_Date || '',
                nights: bk.Nights || '',
                rooms_requested: bk.Sgl_Twin_Dbl_Guides || '',
                guide_rooms: bk.Guide_Rooms || '',
                meals_requested: bk.Meals || '',
                status: bk.Status || '',
                deposit_amount: bk.Deposit_Amount || '',
                deposit_paid: bk.Deposit_Paid_Date ? 'yes' : 'no',
                payment_2_amount: bk.Second_Payment_Amount || '',
                payment_2_paid: bk.nd_Payment_Paid_Date ? 'yes' : 'no',
                payment_3_amount: bk.Third_Payment_Amount || '',
                payment_3_paid: bk.rd_Payment_Paid_Date ? 'yes' : 'no',
                payment_4_amount: bk.Fourth_Payment_Amount || '',
                payment_4_paid: bk.th_Payment_Paid_Date ? 'yes' : 'no',
              };
              const aiResult = await parseEmail(body, bookingContext);
              const existingAmounts = {
                Status: bk.Status,
                Total_Amount: bk.Total_Amount, Deposit_Amount: bk.Deposit_Amount,
                Second_Payment_Amount: bk.Second_Payment_Amount, Third_Payment_Amount: bk.Third_Payment_Amount,
                Fourth_Payment_Amount: bk.Fourth_Payment_Amount, Deposit_Due_Date: bk.Deposit_Due_Date,
                Second_Payment_Due_Date: bk.Second_Payment_Due_Date,
                Third_Payment_Due_Date: bk.Third_Payment_Due_Date,
                Fourth_Payment_Due_Date: bk.Fourth_Payment_Due_Date,
              };
              const fieldResult = extractionToZohoFields(aiResult, existingAmounts);
              if (Object.keys(fieldResult.updates).length > 0) {
                const updates = { ...fieldResult.updates, id: bk.id, Last_Response_Date: (email.date || email.email_date || '').split('T')[0] || new Date().toISOString().split('T')[0] };
                await zohoApi('PUT', 'Lodge_Bookings', { data: [updates] });
              }
              // Mark blob as parsed so we don't reprocess it
              email.parsed_at = new Date().toISOString();
              const safeId = (email.message_id || email.id || '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
              if (safeId) {
                await put('emails/booking/' + bk.id + '/' + safeId + '.json',
                  JSON.stringify(email), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
              }
              results.push({ action: 'parsed', booking: bk.Name, status: aiResult.extracted?.suggested_status?.value, fields: Object.keys(fieldResult.updates) });
              actioned++;
            } catch(e) { results.push({ action: 'parse_error', booking: bk.Name, error: e.message }); errors++; }
          }
        }
      } catch(e) { results.push({ booking: bk.Name, error: e.message }); errors++; }
    }

    const summary = { tour: tour_name || 'all', mode, dry_run: !!dry_run, actioned, skipped, errors, remaining, elapsed_ms: Date.now() - t0, done: remaining === 0, run_at: new Date().toISOString() };

    // Append to parse log in blob
    if (!dry_run && results.length > 0) {
      try {
        const logKey = 'parse-log/latest.json';
        const existing = await fetch('https://blob.vercel-storage.com/' + logKey).then(r => r.ok ? r.json() : null).catch(() => null);
        const prev = (existing && existing.entries) || [];
        const entry = { ...summary, errors_detail: results.filter(r => r.action === 'parse_error' || r.error).slice(0, 20) };
        const log = { entries: [entry, ...prev].slice(0, 50), updated_at: new Date().toISOString() };
        await put('parse-log/latest.json', JSON.stringify(log), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
      } catch(e) { console.error('Failed to write parse log:', e.message); }
    }

    res.json({ ...summary, results: results.slice(0, 50) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
