import { getGmailToken, gmailApi } from './_gmail.js';

/*
 * /api/diag-gmail-label-tree
 *
 * Lists every Gmail label on the bookings@ridedownsouth.com mailbox,
 * grouped by parent (the part before the first '/'), so we can see
 * exactly how Helen's existing folder structure is organised.
 *
 * We compare this against what tourLabelName() generates today
 * (FoSA Mar 27/Papkuilsfontein) — if they don't share a parent tree,
 * portal-applied labels won't show up where Helen looks.
 *
 * Diagnostic only — read-only.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const token = await getGmailToken();
    const result = await gmailApi(token, 'labels');
    const labels = (result && result.labels) || [];

    // Group user-created labels by their first path segment
    const userLabels = labels.filter(l => l.type === 'user');
    const tree = {};
    for (const l of userLabels) {
      const parts = l.name.split('/');
      const root = parts[0];
      if (!tree[root]) tree[root] = [];
      tree[root].push({ name: l.name, id: l.id });
    }

    // Sort each group
    for (const root of Object.keys(tree)) {
      tree[root].sort((a, b) => a.name.localeCompare(b.name));
    }

    // System labels separately for completeness
    const systemLabels = labels.filter(l => l.type === 'system').map(l => l.name);

    return res.status(200).json({
      success: true,
      total_labels: labels.length,
      user_label_count: userLabels.length,
      system_labels: systemLabels.sort(),
      tree,
    });
  } catch (err) {
    console.error('diag-gmail-label-tree error:', err);
    return res.status(500).json({ error: err.message });
  }
}
