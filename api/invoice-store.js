// Invoice line items store — Vercel Blob
// Path: invoices/{bookingId}.json
// Structure: { booking_id, items: [{ id, date, description, amount, currency, type, created_at }] }

import { put, list } from '@vercel/blob';

function blobPath(bookingId) {
  return 'invoices/' + bookingId + '.json';
}

export async function getInvoices(bookingId) {
  if (!bookingId) return [];
  try {
    var result = await list({ prefix: 'invoices/' + bookingId + '.json', limit: 1 });
    if (!result.blobs || result.blobs.length === 0) return [];
    var r = await fetch(result.blobs[0].url);
    if (!r.ok) return [];
    var data = await r.json();
    return data.items || [];
  } catch (e) {
    return [];
  }
}

export async function saveInvoices(bookingId, items) {
  var data = {
    booking_id: bookingId,
    items: items,
    updated_at: new Date().toISOString(),
  };
  await put(blobPath(bookingId), JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
  return items;
}

// Build a short human-readable Zoho summary (max ~1800 chars to stay under 2000 limit)
export function buildZohoSummary(items, currency) {
  if (!items || items.length === 0) return '';
  var lines = items.map(function(item) {
    var typeLabel = item.type === 'credit' ? 'Credit' : item.type === 'adjustment' ? 'Adj' : 'Inv';
    var amt = item.type === 'credit' ? '-' + item.amount : item.amount;
    return typeLabel + ' ' + item.date + ': ' + (item.currency || currency || '') + ' ' + amt + (item.description ? ' (' + item.description + ')' : '');
  });
  var total = items.reduce(function(sum, item) {
    var amt = parseFloat(item.amount) || 0;
    return sum + (item.type === 'credit' ? -amt : amt);
  }, 0);
  var totalLine = 'TOTAL: ' + (currency || '') + ' ' + Math.round(total * 100) / 100;
  var summary = lines.join(' | ') + ' | ' + totalLine;
  // Truncate if needed
  if (summary.length > 1900) {
    summary = summary.substring(0, 1897) + '...';
  }
  return summary;
}
