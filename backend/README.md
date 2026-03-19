# Backend (TypeScript)

This folder contains the Express + SQLite backend for the IATF document control system, now migrated to TypeScript.

## Setup

1. Install dependencies.
2. Build the TypeScript output.
3. Run the server.

## Scripts

- `npm run dev` — run the API using `tsx` (TypeScript directly)
- `npm run build` — compile to `dist/`
- `npm start` — run compiled output from `dist/`
- `npm run seed:kpi` — seed KPI document using the strict tool
- `npm run backfill:categories` — normalize storage paths

## Notes

- The compiled output is written to `dist/`.
- Database is stored in `db/nskiatf_doccontrol.db` by default.
