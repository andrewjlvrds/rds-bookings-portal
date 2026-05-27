// POST /api/toggle-flag
// Body: { email_id: string }
// Toggles flag state for an email. Returns { flagged: bool }
import { toggleFlag } from './_flags.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { email_id } = req.body || {};
  if (!email_id) return res.status(400).json({ error: 'email_id required' });
  const result = await toggleFlag(email_id);
  res.status(200).json({ flagged: result.flagged });
}
