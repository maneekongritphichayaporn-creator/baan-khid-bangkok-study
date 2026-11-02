-- Keep the development-only published fixture out of production listings.
with demo_property as (
  select p.id
  from public.properties p
  where p.title = 'ทรัพย์ทดสอบ 001'
    and p.district = 'พระโขนง'
    and p.property_type = 'condo'
    and exists (
      select 1
      from public.property_listings l
      join public.data_sources s on s.id = l.source_id
      where l.property_id = p.id
        and s.name = 'ข้อมูลสมมติสำหรับทดสอบ'
    )
)
update public.property_listings
set status = 'inactive'
where property_id in (select id from demo_property)
  and status = 'active';

with demo_property as (
  select p.id
  from public.properties p
  where p.title = 'ทรัพย์ทดสอบ 001'
    and p.district = 'พระโขนง'
    and p.property_type = 'condo'
    and exists (
      select 1
      from public.data_sources s
      join public.property_listings l on l.source_id = s.id
      where l.property_id = p.id
        and s.name = 'ข้อมูลสมมติสำหรับทดสอบ'
    )
)
update public.properties
set is_published = false
where id in (select id from demo_property);
