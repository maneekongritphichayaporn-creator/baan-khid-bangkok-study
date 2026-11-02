# Data model and CSV import pipeline

The schema migrations in `supabase/migrations/` separate property facts from observed sale/rent listings, valuations, and forecasts. A new asking price is an observation and must not overwrite an older observation or a valuation.

## CSV field mapping

Use `/property-import-template.csv` for a blank header-only file or `/property-import-sample.csv` to preview 50 clearly fictional test rows across all 50 Bangkok districts. Prices, rents, areas, and locations are invented for testing; they are not facts about properties or market conditions. Coordinates and source URLs are intentionally blank. The sample is openly distributed by this project for educational and testing use and must not be treated as real listing data or used for financial decisions. Real listing data previously kept locally has been removed from the project dataset.

| CSV column | Database field | Import rule |
| --- | --- | --- |
| `name` | `properties.title` | Required; trimmed and limited to 255 characters. |
| `district` | `properties.district` | Required. |
| `type` | `properties.property_type` | Normalize `คอนโด` to `condo` and `หอพัก` to `dormitory`. |
| `price_thb` | `property_listings.price_thb` | Required sale observation in baht, not millions. |
| `monthly_rent_thb` or `rent_thb` | `property_listings.price_thb` | Optional monthly rent observation in baht. |
| `area_sqm` | `properties.usable_area_sqm` | Required; positive square metres. |
| `transit` | `properties.transit_description` | Preserve supplied text. Measured distance belongs in `property_features.distance_to_transit_m`. |
| `flood_risk` | `property_features.flood_risk_level` | Normalize `low`, `moderate`, and `high`; blank or unknown values become `unknown`. |
| `latitude`, `longitude` | `properties.latitude`, `properties.longitude`, `properties.location` | Optional decimal WGS84 pair. Supply both or leave both blank. |
| `source` | `data_sources.name` | Reuse a matching source record; defaults to `นำเข้าจาก CSV`. |
| `source_url` | `property_listings.source_url` | Optional HTTP or HTTPS URL. |
| `observed_at` | `property_listings.observed_at` | Optional `YYYY-MM-DD` or `DD/MM/YYYY` Gregorian date. |

The local admin script validates the complete CSV before writing, accepts 1–500 rows, and calls the atomic `import_property_batch` database function. Exact duplicate observations are skipped. Imported listings use `unknown` status and new properties remain unpublished. The script never publishes data.

The dashboard's CSV preview is separate and stays in that browser only; it is not sent to Supabase. Previously saved CSV imports are cleared when the new sample-only app version loads. Favorites are browser-local.

The dashboard map uses Leaflet with OpenStreetMap tiles and plots only valid coordinate pairs. OpenStreetMap attribution is displayed; its standard tile service is not an unlimited production host. Choose a dedicated tile provider before scaling traffic. Property-level flood-risk labels are not a flood-zone boundary layer.

The public app is in sample-only mode and does not read Supabase. For future authorized real-data imports only, see [admin-supabase.md](./admin-supabase.md). Keep source evidence and reuse-rights decisions for every real dataset. Do not treat public accessibility as permission to republish listing descriptions, photographs, or personal data.
