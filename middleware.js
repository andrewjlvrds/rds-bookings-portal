// rds-bookings-portal is MIGRATED (RDS OS, 2026-07-22 — lodge bookings).
// UI: rds-dashboard /lodge. APIs: rds-client-ops /api/lodge/. Crons moved too.
export const config = { matcher: "/(.*)" };
export default function middleware(req) {
  const url = new URL(req.url);
  const p = url.pathname;
  const target = p.startsWith("/api/")
    ? `https://rds-client-ops.vercel.app/api/lodge/${p.slice(5)}`
    : "https://rds-dashboard-drab.vercel.app/lodge";
  return Response.redirect(target + url.search, 308);
}
