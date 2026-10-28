-- Public clients may read only records explicitly published by an administrator.
-- No anonymous insert, update, or delete policies are created here.

alter table public.properties
  add column if not exists is_published boolean not null default false;

alter table public.properties enable row level security;
alter table public.property_listings enable row level security;
alter table public.property_features enable row level security;
alter table public.data_sources enable row level security;

grant select on public.properties, public.property_listings,
  public.property_features, public.data_sources to anon, authenticated;

drop policy if exists published_properties_read
  on public.properties;
create policy published_properties_read
  on public.properties for select to anon, authenticated
  using (is_published);

drop policy if exists published_property_listings_read
  on public.property_listings;
create policy published_property_listings_read
  on public.property_listings for select to anon, authenticated
  using (
    status = 'active'
    and exists (
      select 1
      from public.properties
      where properties.id = property_listings.property_id
        and properties.is_published
    )
  );

drop policy if exists published_property_features_read
  on public.property_features;
create policy published_property_features_read
  on public.property_features for select to anon, authenticated
  using (
    exists (
      select 1
      from public.properties
      where properties.id = property_features.property_id
        and properties.is_published
    )
  );

drop policy if exists published_property_sources_read
  on public.data_sources;
create policy published_property_sources_read
  on public.data_sources for select to anon, authenticated
  using (
    exists (
      select 1
      from public.property_listings
      join public.properties
        on properties.id = property_listings.property_id
      where property_listings.source_id = data_sources.id
        and property_listings.status = 'active'
        and properties.is_published
    )
    or exists (
      select 1
      from public.property_features
      join public.properties
        on properties.id = property_features.property_id
      where property_features.source_id = data_sources.id
        and properties.is_published
    )
  );
