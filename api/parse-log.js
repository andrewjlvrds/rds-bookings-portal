import { list } from '@vercel/blob';

export default async function handler(req, res) {
  try {
    const result = await list({ prefix: 'parse-log/latest.json', limit: 1 });
    if (!result.blobs || result.blobs.length === 0) return res.json({ found: false });
    const r = await fetch(result.blobs[0].url);
    const data = await r.json();
    res.json({ found: true, ...data });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
