# Data model and CSV import pipeline

The initial PostgreSQL/PostGIS schema is in `supabase/migrations/20261027000000_initial_property_intelligence.sql`.
It keeps property facts, observed listings, valuations, and forecasts in separate tables so a new asking price never overwrites an older observation or a valuation.

## CSV field mapping

Use `/property-import-template.csv` for a blank header-only file or `/property-import-sample.csv` to try importing one clearly fictional property row. The sample values are for interface testing and are not a real listing.

| CSV column | Database field | Import rule |
| --- | --- | --- |
| `name` | `properties.title` | Trim whitespace; keep the original display name. |
| `district` | `properties.district` | Required. |
| `type` | `properties.property_type` | Normalize `คอนโด` to `condo` and `หอพัก` to `dormitory`. |
| `price_thb` | `property_listings.price_thb` | Create a `sale` listing in baht; do not store millions. |
| `monthly_rent_thb` or `rent_thb` | `property_listings.price_thb` | Create a separate `rent` listing in baht when supplied. |
| `area_sqm` | `properties.usable_area_sqm` | Required; positive square metres. |
| `transit` | `properties.transit_description` | Preserve the supplied text. A measured distance belongs in `property_features.distance_to_transit_m`. |
| `flood_risk` | `property_features.flood_risk_level` | Normalize `low` to ต่ำ, `moderate` to เฝ้าระวัง, `high` to สูง, and blank or unknown values to ไม่ระบุ; retain the source in `data_sources`. |
| `latitude`, `longitude` | `properties.latitude`, `properties.longitude`, `properties.location` | Optional pair in decimal degrees (WGS84). Supply both or leave both blank. The current schematic map plots points only inside its Bangkok bounds. |
| `source` | `data_sources.name` | Reuse a matching source record. |
| `source_url` | `property_listings.source_url` | Optional `http` or `https` reference; invalid URLs are ignored by the browser importer. |
| `observed_at` | `property_listings.observed_at` | Date attached to each imported listing. |

When browser CSV imports are later connected to a server-side import job, each file should create an `import_batches` row, then insert or match `properties`, followed by one sale listing and, when present, one rent listing per row. Preserve source URLs and batch IDs on listing rows. Record rejected rows in the batch counts and error summary; do not silently discard them. The current importer is browser-local and does not write to these tables.

## Apply the migration

This migration targets PostgreSQL with the PostGIS extension enabled (for example, a Supabase project). Review the migration in the SQL editor before applying it to a hosted database. The app can read published property records through its server route after Supabase credentials are configured; CSV imports still stay in the current browser. Do not put a database password or Supabase service role key in client code or commit it to the repository.

The initial migration enables row-level security on every table. The published-read migration adds anonymous/authenticated read-only access to explicitly published properties and their active listings, features, and sources. It does not grant public writes or access to import batch records. Keep real data in the database only when its source and reuse rights are documented.

## Supabase setup checklist

The app's Supabase read path is server-side and uses the project's publishable/anon key under row-level security. Create `.env.local` from `.env.example` and set `SUPABASE_URL` and `SUPABASE_ANON_KEY`; do not commit `.env.local`.

1. Create a Supabase project and confirm the PostGIS extension is available.
2. Review and run `supabase/migrations/20261027000000_initial_property_intelligence.sql`, then `supabase/migrations/20261028000000_public_published_property_reads.sql` in the project's SQL editor.
3. The second migration adds `properties.is_published` (default false) and public read policies for published properties, active listings, their features, and sources. It grants no public writes or access to import batch records. Publish only records whose source and reuse rights have been checked.
4. Copy `.env.example` to `.env.local`, add the project URL and publishable/anon key, then restart the development server. The dashboard will use published condo and dormitory records when available, and show the sample dataset when Supabase is unconfigured or has no published rows.

To publish a reviewed record from the SQL editor, set `is_published = true` for its `properties.id` only after checking the listing source and its reuse rights. The default is false, so newly inserted records remain hidden from the app until reviewed.

CSV imports and favorites remain browser-local. Before syncing user uploads or adding accounts, add ownership fields and user-scoped policies. Keep `service_role` credentials server-only and never expose them through `NEXT_PUBLIC_*` variables. Do not disable row-level security to make the initial connection appear to work.
