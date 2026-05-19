// GET /api/scan-unlabelled
// Scans Gmail inbox for messages that don't have any RDS tour label.
// Read-only diagnostic — returns subject, sender, date, snippet.
// Helen can then manually reassign anything that needs moving.

import { getGmailToken, gmailApi } from './_gmail.js';

// Known RDS tour label name fragments — any message with one of these is already labelled
const TOUR_LABEL_PATTERNS = [
  '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
  'FoSA', 'BoN May', 'GL Jul', 'WH-CT', 'Complete 2026', '2025 Archive',
  'EoA', 'EoA14', 'EoA12',
];

function hasToUrLabel(labelIds, allLabels) {
  const labelNames = labelIds.map(id => {
    const l = allLabels.find(l => l.id === id);
    return l ? l.name : '';
  });
  return labelNames.some(name => 
    TOUR_LABEL_PATTERNS.some(p => name.toLowerCase().includes(p.toLowerCase()))
  );
}

function getHeader(headers, name) {
  const h = (headers || []).find(h => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const maxResults = parseInt(req.query.max || '100');
  const t0 = Date.now();

  try {
    const token = await getGmailToken();

    // Fetch all labels for name lookup
    const labelsResult = await gmailApi(token, 'labels');
    const allLabels = labelsResult.labels || [];

    // Search inbox — exclude known tour labels using -label: queries
    // Gmail API doesn't support multiple -label in one query well,
    // so we fetch inbox messages and filter client-side
    const query = 'in:inbox -label:Zoho -label:Programmes -label:Finances -is:draft';
    const listResult = await gmailApi(token, 
      'messages?q=' + encodeURIComponent(query) + '&maxResults=' + maxResults
    );
    const messages = listResult.messages || [];

    const unlabelled = [];
    const alreadyLabelled = [];

    // Fetch metadata for each message in batches
    const BATCH = 10;
    for (let i = 0; i < messages.length; i += BATCH) {
      if (Date.now() - t0 > 25000) break; // 25s limit

      const batch = messages.slice(i, i + BATCH);
      const details = await Promise.all(batch.map(async msg => {
        try {
          const full = await gmailApi(token, 
            'messages/' + msg.id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date'
          );
          return full;
        } catch (e) { return null; }
      }));

      for (const full of details) {
        if (!full) continue;
        const headers = full.payload?.headers || [];
        const labelIds = full.labelIds || [];
        const hasTourLabel = hasToUrLabel(labelIds, allLabels);

        const entry = {
          id: full.id,
          thread_id: full.threadId,
          from: getHeader(headers, 'From'),
          subject: getHeader(headers, 'Subject'),
          date: getHeader(headers, 'Date'),
          snippet: full.snippet || '',
          labels: labelIds.map(id => {
            const l = allLabels.find(l => l.id === id);
            return l ? l.name : id;
          }).filter(n => !['INBOX','UNREAD','CATEGORY_PERSONAL','IMPORTANT'].includes(n)),
        };

        if (hasTourLabel) {
          alreadyLabelled.push(entry);
        } else {
          unlabelled.push(entry);
        }
      }
    }

    // Sort by date descending
    unlabelled.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    return res.status(200).json({
      unlabelled_count: unlabelled.length,
      already_labelled_count: alreadyLabelled.length,
      total_scanned: messages.length,
      unlabelled,
      truncated: messages.length >= maxResults,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
