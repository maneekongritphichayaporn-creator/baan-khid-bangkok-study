# Admin workflow: Supabase CSV imports

> **Sample-only mode:** The public app currently uses fictional data only and does not read Supabase. Do not import or publish the fictional test CSV as real property data. The workflow below is retained for future use with data whose storage and redistribution rights have been confirmed.

## 1. Configure Supabase

1. Create a Supabase project and confirm PostGIS is available.
2. From the repository root, link the Supabase CLI to the intended project:

   ```powershell
   npx.cmd supabase login
   npx.cmd supabase link --project-ref <project-ref>
   npx.cmd supabase db push --dry-run
   npx.cmd supabase db push
   ```

3. Confirm migrations completed. The migrations create the schema, public read-only RLS policies, a development fixture, the atomic import function, and unpublish prior published data while the project is in sample-only mode.

Do not paste migration SQL into the dashboard SQL editor; use the CLI so remote migration history stays in sync.

## 2. Configure local credentials

Copy `.env.example` to `.env.local` if you have not already. Add the project URL and publishable key for local app development, and add the secret key for the import script:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

The script reads `.env.local` or existing process environment variables. Keep `.env.local` private; it is ignored by Git. Never put `SUPABASE_SECRET_KEY` in Vercel, a browser variable, a committed file, or a screenshot.

## 3. Validate and import a CSV

The CSV must have `name`, `district`, `type`, `price_thb`, and `area_sqm` columns. See [data-pipeline.md](./data-pipeline.md) for all supported fields and normalization rules. Use real source URLs and dates, and import only data you have the right to store and publish.

First validate locally without network access or database writes:

```powershell
npm run import:properties -- --dry-run .\path\to\properties.csv
```

After confirming the target project and source rights, import explicitly:

```powershell
npm run import:properties -- --confirm-import .\path\to\properties.csv
```

The script accepts up to 500 valid rows per batch and aborts before writing if any row is invalid. The database function is atomic, skips duplicate observations, and returns a batch UUID. New properties remain unpublished and imported listings stay `unknown`.

The fictional `public/property-import-sample.csv` is for testing the parser and browser preview only. Do not import it into the production dataset. Keep datasets with unverified reuse rights in the Git-ignored `data/private/` folder; do not commit them.

## 4. Review the batch

Use the batch UUID printed by the script to inspect imported rows:

```sql
select b.id as batch_id, b.status as batch_status, b.rows_seen,
       b.rows_imported, b.rows_skipped, p.id as property_id,
       p.title, p.district, p.is_published,
       l.id as listing_id, l.listing_type, l.price_thb, l.status,
       l.source_url, l.observed_at, s.name as source_name
from public.import_batches b
join public.property_listings l on l.import_batch_id = b.id
join public.properties p on p.id = l.property_id
left join public.data_sources s on s.id = l.source_id
where b.id = '<batch-uuid>'::uuid
order by p.title, l.listing_type;
```

Check titles, districts, types, areas, sale and rent prices, coordinates, observed dates, source URLs, and permission to reuse the data. Importing does not imply publication approval.

## 5. Publish the reviewed batch

Only after review, replace `<batch-uuid>` below and run the statements in the Supabase SQL editor:

```sql
begin;

update public.property_listings
set status = 'active'
where import_batch_id = '<batch-uuid>'::uuid
  and status = 'unknown';

update public.properties p
set is_published = true
where exists (
  select 1
  from public.property_listings l
  where l.property_id = p.id
    and l.import_batch_id = '<batch-uuid>'::uuid
    and l.status = 'active'
);

commit;
```

The app's anonymous read path is limited by RLS to published properties and active listings. Never disable RLS to make imports or reads work.

## Vercel deployment

Configure only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the Vercel project. Do not deploy the local import secret. Deploy the same user app from this repository; admin CSV writes run locally through the CLI script, not through a public API route or `/admin` page.

Before deploying real data, check its provenance and reuse terms, remove any development fixtures from the public dataset, and verify that the published rows are visible through the app's public read path.
