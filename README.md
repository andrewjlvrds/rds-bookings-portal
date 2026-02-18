# RDS Bookings Portal

Lodge correspondence and booking management portal for Ride Down South.

## Overview
- Select a tour → view all lodge bookings → see email correspondence per booking
- Email timeline shows both sent and received emails with Claude AI summaries
- Key booking fields (status, rates, rooms, deposits) displayed alongside correspondence

## Architecture
- **Frontend:** React (Vite) on Vercel
- **API:** Serverless functions on lodge-correspondence.vercel.app
- **Data:** Zoho CRM (tours, lodge bookings) + Vercel Blob (email storage)
- **Email capture:** Google Apps Script on bookings@ridedownsouth.com

## Related repos
- `lodge_correspondence` — API endpoints and email webhook
- `rds-crew-portal` — Crew operations portal
- `rds-portal-api` — Client/rider portal API
