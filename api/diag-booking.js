// ONE-SHOT: Diagnose a booking's blob and sent-index state
// Usage: ?rds_ref=RDS-EoA-Jan27-PhophonyaneLodge-27/01/31&correct_id=6543704000010859047
// DELETE AFTER USE
import { list } from '@vercel/blob';

export default async function handler(req, res) {
  const correctId = req.query.correct_id;
  const rdsRef = req.query.rds_ref;
  const results = {};

  // Check blobs under correct ID
  if (correctId) {
    const correctBlobs = await list({ prefix: 'emails/booking/' + correctId + '/' });
    results.correct_id_blobs = correctBlobs.blobs.map(b => b.pathname.split('/').pop());
  }

  // Check sent-index entries for this booking
  if (correctId) {
    const allIdx = await list({ prefix: 'emails/sent-index/', limit: 500 });
    const matching = [];
    for (const blob of allIdx.blobs) {
      const r = await fetch(blob.url);
      const data = await r.json();
      if (data.booking_ids && data.booking_ids.includes(correctId)) {
        matching.push({ key: blob.pathname, rfc: data.rfc_message_id });
      }
      if (rdsRef && data.subject && data.subject.includes(rdsRef.split('-').pop())) {
        matching.push({ key: blob.pathname, subject: data.subject, booking_ids: data.booking_ids });
      }
    }
    results.sent_index_matches = matching;
  }

  // Search all booking blobs for this RDS ref
  if (rdsRef) {
    const allBookings = await list({ prefix: 'emails/booking/', limit: 1000 });
    const refMatches = [];
    for (const blob of allBookings.blobs) {
      if (blob.pathname.includes(rdsRef.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 15))) {
        refMatches.push(blob.pathname);
      }
    }
    results.ref_blob_matches = refMatches;
  }

  res.status(200).json(results);
}
