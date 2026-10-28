type Relation<T> = T | T[] | null | undefined;

type ListingRecord = {
  listing_type: "sale" | "rent";
  price_thb: number | string;
  status: string;
  source_url: string | null;
  observed_at: string | null;
  created_at: string;
  data_sources: Relation<{ name: string }>;
};

type PropertyRecord = {
  title: string;
  property_type: "condo" | "dormitory";
  district: string;
  transit_description: string | null;
  usable_area_sqm: number | string | null;
  latitude: number | null;
  longitude: number | null;
  property_features: Relation<{ flood_risk_level: string | null }>;
  property_listings: Relation<ListingRecord>;
};

function asRows<T>(relation: Relation<T>): T[] {
  if (Array.isArray(relation)) return relation;
  return relation ? [relation] : [];
}

function latestListing(
  listings: ListingRecord[],
  type: ListingRecord["listing_type"],
) {
  return listings
    .filter(
      (listing) =>
        listing.status === "active" && listing.listing_type === type,
    )
    .sort((a, b) => {
      const aDate = a.observed_at || a.created_at;
      const bDate = b.observed_at || b.created_at;
      return bDate.localeCompare(aDate);
    })[0];
}

function safeHttpUrl(value: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function mapProperty(record: PropertyRecord) {
  const listings = asRows(record.property_listings);
  const sale = latestListing(listings, "sale");
  const rent = latestListing(listings, "rent");
  const area = Number(record.usable_area_sqm);
  const salePrice = Number(sale?.price_thb);
  if (!sale || !Number.isFinite(area) || area <= 0 || !Number.isFinite(salePrice))
    return null;

  const feature = asRows(record.property_features)[0];
  const source = asRows(sale.data_sources)[0];
  const risk =
    feature?.flood_risk_level === "low"
      ? "ต่ำ"
      : feature?.flood_risk_level === "moderate"
        ? "เฝ้าระวัง"
        : feature?.flood_risk_level === "high"
          ? "สูง"
          : "ไม่ระบุ";
  const type = record.property_type === "dormitory" ? "หอพัก" : "คอนโด";
  const transit = record.transit_description?.trim();
  const monthlyRent = rent ? Number(rent.price_thb) : 0;

  return {
    name: record.title,
    location: transit ? `${record.district} · ${transit}` : record.district,
    type,
    price: salePrice / 1_000_000,
    rent: Number.isFinite(monthlyRent) && monthlyRent > 0 ? monthlyRent : 0,
    size: area,
    risk,
    icon: type === "คอนโด" ? "🏢" : "🏠",
    latitude: record.latitude ?? undefined,
    longitude: record.longitude ?? undefined,
    source: source?.name || undefined,
    sourceUrl: safeHttpUrl(sale.source_url),
    observedAt: sale.observed_at || undefined,
    isRemote: true,
  };
}

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ configured: false, properties: [] });

  try {
    const url = new URL("/rest/v1/properties", supabaseUrl);
    url.searchParams.set(
      "select",
      "title,property_type,district,transit_description,usable_area_sqm,latitude,longitude,property_features(flood_risk_level),property_listings(listing_type,price_thb,status,source_url,observed_at,created_at,data_sources(name))",
    );
    url.searchParams.set("is_published", "eq.true");
    url.searchParams.set("property_type", "in.(condo,dormitory)");
    url.searchParams.set("property_listings.status", "eq.active");
    url.searchParams.set(
      "property_listings.order",
      "observed_at.desc.nullslast,created_at.desc",
    );
    url.searchParams.set("property_listings.limit", "50");
    url.searchParams.set("order", "updated_at.desc");
    url.searchParams.set("limit", "500");

    const response = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        ...(supabaseKey.startsWith("eyJ")
          ? { Authorization: `Bearer ${supabaseKey}` }
          : {}),
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      console.error(
        "Supabase property query failed with status",
        response.status,
      );
      return Response.json(
        { configured: true, error: "ไม่สามารถอ่านข้อมูลจาก Supabase ได้" },
        { status: 502 },
      );
    }

    const records = (await response.json()) as PropertyRecord[];
    const properties = records.map(mapProperty).filter((item) => item !== null);
    return Response.json({ configured: true, properties });
  } catch {
    return Response.json(
      { configured: true, error: "ตั้งค่า Supabase URL ไม่ถูกต้อง" },
      { status: 500 },
    );
  }
}
