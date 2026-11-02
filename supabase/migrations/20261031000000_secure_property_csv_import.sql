-- Atomically import validated CSV rows through a server-only service key.
-- Imported properties remain unpublished until an administrator reviews them.

create or replace function public.import_property_batch(
  p_file_name text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_source_id uuid;
  v_property_id uuid;
  v_batch_id uuid;
  v_name text;
  v_district text;
  v_type text;
  v_area numeric;
  v_sale_price numeric;
  v_rent_price numeric;
  v_latitude double precision;
  v_longitude double precision;
  v_risk text;
  v_observed_at date;
  v_source_name text;
  v_source_url text;
  v_transit text;
  v_saved integer := 0;
  v_skipped integer := 0;
  v_row_saved boolean;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import rows must be a JSON array';
  end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 500 then
    raise exception 'Import must contain between 1 and 500 rows';
  end if;

  insert into public.import_batches (file_name, status, rows_seen)
  values (left(coalesce(nullif(btrim(p_file_name), ''), 'property-import.csv'), 255), 'pending', jsonb_array_length(p_rows))
  returning id into v_batch_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_name := nullif(btrim(v_row->>'title'), '');
    v_district := nullif(btrim(v_row->>'district'), '');
    v_type := v_row->>'property_type';
    v_area := (v_row->>'usable_area_sqm')::numeric;
    v_sale_price := (v_row->>'sale_price_thb')::numeric;
    v_rent_price := nullif(v_row->>'rent_price_thb', '')::numeric;
    v_latitude := nullif(v_row->>'latitude', '')::double precision;
    v_longitude := nullif(v_row->>'longitude', '')::double precision;
    v_risk := coalesce(nullif(v_row->>'flood_risk_level', ''), 'unknown');
    v_observed_at := nullif(v_row->>'observed_at', '')::date;
    v_source_name := coalesce(nullif(btrim(v_row->>'source_name'), ''), 'นำเข้าจาก CSV');
    v_source_url := nullif(btrim(v_row->>'source_url'), '');
    v_transit := nullif(btrim(v_row->>'transit_description'), '');

    if v_name is null or v_district is null
      or v_type is null or v_type not in ('condo', 'dormitory')
      or v_area is null or v_area <= 0
      or v_sale_price is null or v_sale_price <= 0
      or (v_rent_price is not null and v_rent_price <= 0)
      or v_risk is null or v_risk not in ('low', 'moderate', 'high', 'unknown')
      or ((v_latitude is null) <> (v_longitude is null))
      or (v_latitude is not null and (v_latitude < -90 or v_latitude > 90))
      or (v_longitude is not null and (v_longitude < -180 or v_longitude > 180)) then
      raise exception 'An import row contains invalid property data';
    end if;

    insert into public.data_sources (name, source_url)
    values (v_source_name, v_source_url)
    on conflict (name) do update
      set source_url = coalesce(excluded.source_url, public.data_sources.source_url)
    returning id into v_source_id;

    select id into v_property_id
    from public.properties
    where title = v_name and district = v_district and property_type = v_type
    order by created_at
    limit 1;

    if v_property_id is null then
      insert into public.properties (
        title, property_type, district, transit_description,
        latitude, longitude, location, usable_area_sqm, is_published
      ) values (
        v_name, v_type, v_district, v_transit,
        v_latitude, v_longitude,
        case when v_latitude is null then null
          else extensions.st_setsrid(extensions.st_makepoint(v_longitude, v_latitude), 4326)::extensions.geography
        end,
        v_area, false
      ) returning id into v_property_id;
    end if;

    v_row_saved := false;
    if not exists (
      select 1 from public.property_listings
      where property_id = v_property_id and source_id = v_source_id
        and listing_type = 'sale' and price_thb = v_sale_price
        and observed_at is not distinct from v_observed_at
    ) then
      insert into public.property_listings (
        property_id, import_batch_id, source_id, listing_type,
        price_thb, price_per_sqm_thb, source_url, status, observed_at
      ) values (
        v_property_id, v_batch_id, v_source_id, 'sale',
        v_sale_price, round(v_sale_price / v_area, 2), v_source_url, 'unknown', v_observed_at
      );
      v_row_saved := true;
    end if;

    if v_rent_price is not null and not exists (
      select 1 from public.property_listings
      where property_id = v_property_id and source_id = v_source_id
        and listing_type = 'rent' and price_thb = v_rent_price
        and observed_at is not distinct from v_observed_at
    ) then
      insert into public.property_listings (
        property_id, import_batch_id, source_id, listing_type,
        price_thb, source_url, status, observed_at
      ) values (
        v_property_id, v_batch_id, v_source_id, 'rent',
        v_rent_price, v_source_url, 'unknown', v_observed_at
      );
      v_row_saved := true;
    end if;

    insert into public.property_features (property_id, flood_risk_level, source_id)
    values (v_property_id, v_risk, v_source_id)
    on conflict (property_id) do nothing;

    if v_row_saved then
      v_saved := v_saved + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  update public.import_batches
  set status = 'completed', rows_imported = v_saved, rows_skipped = v_skipped
  where id = v_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'rows_seen', jsonb_array_length(p_rows),
    'rows_imported', v_saved,
    'rows_skipped', v_skipped,
    'published', false
  );
end;
$$;

revoke all on function public.import_property_batch(text, jsonb) from public, anon, authenticated;
grant execute on function public.import_property_batch(text, jsonb) to service_role;
