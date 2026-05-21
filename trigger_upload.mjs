#!/usr/bin/env node
// Run after deploying: node trigger_upload.mjs
// Reads PDFs from ./gl_visas/, encodes as base64, POSTs to portal endpoint

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PDF_DIR = join(__dir, 'gl_visas');
const ENDPOINT = 'https://rds-bookings-portal.vercel.app/api/upload-guest-docs';

const GUESTS = [
  { first: 'Rob',    last: 'Aguis',         zoho_id: '6543704000003136260' },
  { first: 'Gina',   last: 'Taylor',        zoho_id: '6543704000003136261' },
  { first: 'Ray',    last: 'Bonti',         zoho_id: '6543704000003136262' },
  { first: 'Greg',   last: 'Pugh',          zoho_id: '6543704000003136263' },
  { first: 'Tania',  last: 'Pugh',          zoho_id: '6543704000003136264' },
  { first: 'Luca',   last: 'Bruno',         zoho_id: '6543704000003136265' },
  { first: 'Andrew', last: 'Mason',         zoho_id: '6543704000003136266' },
  { first: 'Iain',   last: 'Adams',         zoho_id: '6543704000004665255' },
  { first: 'Daniel', last: 'Lopez',         zoho_id: '6543704000005180441' },
  { first: 'Paul',   last: 'Loasby',        zoho_id: '6543704000005227002' },
  { first: 'Andreas',last: 'Illing',        zoho_id: '6543704000005671032' },
  { first: 'Simon',  last: 'Carr',          zoho_id: '6543704000005779024' },
  { first: 'Petr',   last: 'Aleksandronov', zoho_id: '6543704000010737089' },
];

const guests = GUESTS.map(g => {
  const fname = `GL26_Visa_${g.last}_${g.first}.pdf`;
  const pdf_b64 = readFileSync(join(PDF_DIR, fname)).toString('base64');
  return { ...g, pdf_b64 };
});

console.log(`Uploading ${guests.length} PDFs to ${ENDPOINT}...`);

const resp = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ guests }),
});

const data = await resp.json();
console.log('\nResults:');
for (const r of data.results || []) {
  if (r.ok) {
    console.log(`  ✓ ${r.first} ${r.last}: ${r.url}`);
  } else {
    console.log(`  ✗ ${r.first} ${r.last}: ${r.error}`);
  }
}
