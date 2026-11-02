-- Retain existing rows for audit/recovery, but remove every listing from public display.
update public.property_listings
set status = 'inactive'
where status = 'active';

update public.properties
set is_published = false
where is_published = true;
