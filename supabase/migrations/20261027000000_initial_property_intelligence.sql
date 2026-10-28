-- Core data model for the Bangkok Property Intelligence MVP.
-- Listing prices are observations and must remain separate from valuations.

create extension if not exists postgis with schema extensions;

create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_url text,
  license_url text,
  license_notes text,
  created_at timestamptz not null default now(),
  constraint data_sources_name_unique unique (name)
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.data_sources(id) on delete set null,
  file_name text not null,
  status text not null default 'completed'
    check (status in ('pending', 'completed', 'completed_with_errors', 'failed')),
  rows_seen integer not null default 0 check (rows_seen >= 0),
  rows_imported integer not null default 0 check (rows_imported >= 0),
  rows_skipped integer not null default 0 check (rows_skipped >= 0),
  error_summary text,
  imported_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  property_type text not null
    check (property_type in ('condo', 'dormitory', 'house', 'townhouse', 'land', 'other')),
  district text not null,
  address text,
  transit_description text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location extensions.geography(point, 4326),
  land_area_sqw numeric(12, 2) check (land_area_sqw is null or land_area_sqw > 0),
  usable_area_sqm numeric(12, 2) check (usable_area_sqm is null or usable_area_sqm > 0),
  bedrooms smallint check (bedrooms is null or bedrooms >= 0),
  bathrooms smallint check (bathrooms is null or bathrooms >= 0),
  building_age smallint check (building_age is null or building_age >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_coordinates_pair check ((latitude is null) = (longitude is null))
);

create table if not exists public.property_listings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  source_id uuid references public.data_sources(id) on delete set null,
  listing_type text not null check (listing_type in ('sale', 'rent')),
  price_thb numeric(15, 2) not null check (price_thb > 0),
  price_per_sqm_thb numeric(12, 2) check (price_per_sqm_thb is null or price_per_sqm_thb > 0),
  source_url text,
  status text not null default 'active' check (status in ('active', 'inactive', 'sold', 'rented', 'unknown')),
  observed_at date,
  created_at timestamptz not null default now()
);

create table if not exists public.property_valuations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  valuation_type text not null check (valuation_type in ('market_estimate', 'official_appraisal', 'model_estimate')),
  estimated_price_thb numeric(15, 2) not null check (estimated_price_thb > 0),
  low_estimate_thb numeric(15, 2) check (low_estimate_thb is null or low_estimate_thb > 0),
  high_estimate_thb numeric(15, 2) check (high_estimate_thb is null or high_estimate_thb > 0),
  source_id uuid references public.data_sources(id) on delete set null,
  model_version text,
  created_at timestamptz not null default now(),
  constraint property_valuations_range check (
    (low_estimate_thb is null or low_estimate_thb <= estimated_price_thb)
    and (high_estimate_thb is null or high_estimate_thb >= estimated_price_thb)
  )
);

create table if not exists public.price_forecasts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  forecast_target text not null check (forecast_target in ('sale_price', 'monthly_rent')),
  target_date date not null,
  predicted_value_thb numeric(15, 2) not null check (predicted_value_thb > 0),
  lower_bound_thb numeric(15, 2) check (lower_bound_thb is null or lower_bound_thb > 0),
  upper_bound_thb numeric(15, 2) check (upper_bound_thb is null or upper_bound_thb > 0),
  model_version text not null,
  generated_at timestamptz not null default now()
);

create table if not exists public.flood_risk_areas (
  id uuid primary key default gen_random_uuid(),
  area_name text not null,
  boundary extensions.geometry(multipolygon, 4326),
  risk_level text not null check (risk_level in ('low', 'moderate', 'high', 'unknown')),
  flood_event_date date,
  source_id uuid references public.data_sources(id) on delete set null,
  observed_at date,
  created_at timestamptz not null default now()
);

create table if not exists public.transit_stations (
  id uuid primary key default gen_random_uuid(),
  station_name text not null,
  line_name text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location extensions.geography(point, 4326) not null,
  operational_status text not null default 'unknown'
    check (operational_status in ('operational', 'under_construction', 'planned', 'unknown')),
  source_id uuid references public.data_sources(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint transit_coordinates_match check (
    extensions.st_y(location::extensions.geometry) = latitude
    and extensions.st_x(location::extensions.geometry) = longitude
  )
);

create table if not exists public.property_features (
  property_id uuid primary key references public.properties(id) on delete cascade,
  distance_to_transit_m numeric(10, 2) check (distance_to_transit_m is null or distance_to_transit_m >= 0),
  flood_exposure_score numeric(5, 2) check (flood_exposure_score is null or flood_exposure_score between 0 and 100),
  flood_risk_level text check (flood_risk_level is null or flood_risk_level in ('low', 'moderate', 'high', 'unknown')),
  nearby_amenities jsonb not null default '[]'::jsonb,
  source_id uuid references public.data_sources(id) on delete set null,
  feature_date date not null default current_date
);

create index if not exists properties_district_type_idx on public.properties (district, property_type);
create index if not exists properties_location_gix on public.properties using gist (location);
create index if not exists property_listings_property_observed_idx on public.property_listings (property_id, observed_at desc);
create index if not exists property_listings_type_price_idx on public.property_listings (listing_type, price_thb);
create index if not exists property_valuations_property_created_idx on public.property_valuations (property_id, created_at desc);
create index if not exists price_forecasts_property_target_idx on public.price_forecasts (property_id, forecast_target, target_date);
create index if not exists flood_risk_areas_boundary_gix on public.flood_risk_areas using gist (boundary);
create index if not exists transit_stations_location_gix on public.transit_stations using gist (location);

-- Enable RLS without granting table access in this base migration.
-- Later migrations may add narrowly scoped read policies after data rules are set.
alter table public.data_sources enable row level security;
alter table public.import_batches enable row level security;
alter table public.properties enable row level security;
alter table public.property_listings enable row level security;
alter table public.property_valuations enable row level security;
alter table public.price_forecasts enable row level security;
alter table public.flood_risk_areas enable row level security;
alter table public.transit_stations enable row level security;
alter table public.property_features enable row level security;
