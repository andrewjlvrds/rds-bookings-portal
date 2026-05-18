// GET  /api/invoices?booking_id=xxx         — fetch line items
// POST /api/invoices                         — add or update a line item
// DELETE /api/invoices?booking_id=xxx&id=yyy — delete a line item

import { getInvoices, saveInvoices, buildZohoSummary } from './invoice-store.js';
import { zohoApi } from './_zoho.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const bookingId = (req.query && req.query.booking_id) || (req.body && req.body.booking_id);
  if (!bookingId) return res.status(400).json({ error: 'booking_id required' });

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const items = await getInvoices(bookingId);
      return res.status(200).json({ items });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST (add or update item) ─────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const items = await getInvoices(bookingId);

      if (body.item) {
        const item = body.item;
        // Validate
        if (!item.amount || !item.date) {
          return res.status(400).json({ error: 'item.amount and item.date required' });
        }
        item.amount = Math.round(parseFloat(item.amount) * 100) / 100;
        item.type = item.type || 'invoice';
        item.currency = item.currency || '';

        if (item.id) {
          // Update existing
          const idx = items.findIndex(i => i.id === item.id);
          if (idx > -1) {
            items[idx] = { ...items[idx], ...item };
          } else {
            items.push(item);
          }
        } else {
          // New item
          item.id = 'inv_' + Date.now();
          item.created_at = new Date().toISOString();
          items.push(item);
        }
      }

      await saveInvoices(bookingId, items);

      // Update Zoho Invoice_Line_Items summary + Total_Amount if requested
      const currency = body.currency || '';
      const summary = buildZohoSummary(items, currency);
      const zohoUpdates = { id: bookingId, Invoice_Line_Items: summary };

      if (body.sync_total) {
        // Derive total from line items and write to Total_Amount
        const derived = items.reduce(function(sum, i) {
          const amt = parseFloat(i.amount) || 0;
          return sum + (i.type === 'credit' ? -amt : amt);
        }, 0);
        zohoUpdates.Total_Amount = Math.round(derived * 100) / 100;
      }

      try {
        await zohoApi('PUT', 'Lodge_Bookings', { data: [zohoUpdates] });
      } catch (zohoErr) {
        console.error('Zoho update failed:', zohoErr.message);
        // Non-fatal — blob is saved
      }

      return res.status(200).json({ items, summary });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      const itemId = req.query.id;
      if (!itemId) return res.status(400).json({ error: 'id required' });

      let items = await getInvoices(bookingId);
      items = items.filter(i => i.id !== itemId);
      await saveInvoices(bookingId, items);

      const currency = req.query.currency || '';
      const summary = buildZohoSummary(items, currency);
      try {
        await zohoApi('PUT', 'Lodge_Bookings', { data: [{ id: bookingId, Invoice_Line_Items: summary }] });
      } catch (zohoErr) {
        console.error('Zoho update failed:', zohoErr.message);
      }

      return res.status(200).json({ items, summary });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
