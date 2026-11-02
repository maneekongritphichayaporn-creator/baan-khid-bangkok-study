-- One clearly labeled, fictional record to verify the read-only app pipeline.
-- Remove or replace this fixture before using the project for real listings.

do $$
declare
  demo_source_id uuid;
  demo_property_id uuid;
begin
  insert into public.data_sources (name, license_notes)
  values (
    'ข้อมูลสมมติสำหรับทดสอบ',
    'Fictional fixture for interface and Supabase connection testing; not a real property or listing.'
  )
  on conflict (name) do update
    set license_notes = excluded.license_notes
  returning id into demo_source_id;

  select id into demo_property_id
  from public.properties
  where title = 'ทรัพย์ทดสอบ 001'
    and district = 'พระโขนง'
    and property_type = 'condo'
  limit 1;

  if demo_property_id is null then
    insert into public.properties (
      title,
      property_type,
      district,
      transit_description,
      latitude,
      longitude,
      location,
      usable_area_sqm,
      is_published
    ) values (
      'ทรัพย์ทดสอบ 001',
      'condo',
      'พระโขนง',
      'ใกล้ BTS พระโขนง',
      13.7196,
      100.5850,
      extensions.st_setsrid(extensions.st_makepoint(100.5850, 13.7196), 4326)::extensions.geography,
      30,
      true
    )
    returning id into demo_property_id;
  else
    update public.properties
    set is_published = true
    where id = demo_property_id;
  end if;

  insert into public.property_listings (
    property_id, source_id, listing_type, price_thb, status, observed_at
  )
  select demo_property_id, demo_source_id, 'sale', 2500000, 'active', date '2026-10-27'
  where not exists (
    select 1 from public.property_listings
    where property_id = demo_property_id
      and listing_type = 'sale'
      and observed_at = date '2026-10-27'
      and source_id = demo_source_id
  );

  insert into public.property_listings (
    property_id, source_id, listing_type, price_thb, status, observed_at
  )
  select demo_property_id, demo_source_id, 'rent', 12000, 'active', date '2026-10-27'
  where not exists (
    select 1 from public.property_listings
    where property_id = demo_property_id
      and listing_type = 'rent'
      and observed_at = date '2026-10-27'
      and source_id = demo_source_id
  );

  insert into public.property_features (
    property_id, flood_risk_level, source_id, feature_date
  )
  values (demo_property_id, 'unknown', demo_source_id, date '2026-10-27')
  on conflict (property_id) do update
    set flood_risk_level = excluded.flood_risk_level,
        source_id = excluded.source_id,
        feature_date = excluded.feature_date;
end
$$;
