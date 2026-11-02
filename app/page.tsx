"use client";

// Interactive dashboard and property detail experience.
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import detailStyles from "./property-detail.module.css";
import compareStyles from "./property-compare.module.css";
import investmentStyles from "./investment-lab.module.css";

type Property = {
  name: string;
  location: string;
  type: "คอนโด" | "หอพัก";
  price: number;
  rent: number;
  size: number;
  risk: "ต่ำ" | "เฝ้าระวัง" | "สูง" | "ไม่ระบุ";
  icon: string;
  latitude?: number;
  longitude?: number;
  source?: string;
  sourceUrl?: string;
  observedAt?: string;
  isImported?: boolean;
};
type ImportErrorRow = { rowNumber: number; reason: string; values: string[] };

const properties: Property[] = [
  {
    name: "ชุดตัวอย่างสมมติ 01",
    location: "พระโขนง",
    type: "คอนโด",
    price: 3.85,
    rent: 16500,
    size: 35,
    risk: "ต่ำ",
    icon: "🏢",
  },
  {
    name: "ชุดตัวอย่างสมมติ 02",
    location: "บางนา",
    type: "คอนโด",
    price: 4.2,
    rent: 18000,
    size: 38,
    risk: "ต่ำ",
    icon: "🏙️",
  },
  {
    name: "ชุดตัวอย่างสมมติ 03",
    location: "ห้วยขวาง",
    type: "คอนโด",
    price: 5.1,
    rent: 22000,
    size: 42,
    risk: "เฝ้าระวัง",
    icon: "🏢",
  },
  {
    name: "ชุดตัวอย่างสมมติ 04",
    location: "วัฒนา",
    type: "คอนโด",
    price: 2.75,
    rent: 12500,
    size: 31,
    risk: "ต่ำ",
    icon: "🏬",
  },
  {
    name: "ชุดตัวอย่างสมมติ 05",
    location: "ดุสิต",
    type: "หอพัก",
    price: 1.85,
    rent: 9500,
    size: 24,
    risk: "เฝ้าระวัง",
    icon: "🏠",
  },
  {
    name: "ชุดตัวอย่างสมมติ 06",
    location: "จตุจักร",
    type: "คอนโด",
    price: 3.6,
    rent: 17000,
    size: 34,
    risk: "ต่ำ",
    icon: "🏙️",
  },
];

const money = (value: number) => new Intl.NumberFormat("th-TH").format(value);

const windows1252HighBytes =
  "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";
function repairThaiMojibake(value: string): string {
  if (!/à[¸¹]/.test(value)) return value;
  const bytes: number[] = [];
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x7f || (code >= 0xa0 && code <= 0xff)) bytes.push(code);
    else {
      const cp1252Index = windows1252HighBytes.indexOf(char);
      if (cp1252Index < 0) return value;
      bytes.push(0x80 + cp1252Index);
    }
  }
  const decoded = new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  return /[\u0e00-\u0e7f]/.test(decoded) && !decoded.includes("\uFFFD")
    ? decoded
    : value;
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      record.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field.trim());
      if (record.some((cell) => cell.length > 0)) records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("ไฟล์ CSV มีเครื่องหมายอัญประกาศไม่ครบ");
  record.push(field.trim());
  if (record.some((cell) => cell.length > 0)) records.push(record);
  return records.map((record) => record.map(repairThaiMojibake));
}

function parsePropertyCsv(text: string): {
  items: Property[];
  errors: ImportErrorRow[];
  headers: string[];
} {
  const [headerRow, ...rows] = parseCsvRecords(text);
  if (!headerRow) throw new Error("ไฟล์ CSV ไม่มีหัวตาราง");
  const headers = headerRow.map((header) =>
    header
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase(),
  );
  const indexOf = (name: string) => headers.indexOf(name);
  const required = ["name", "district", "type", "price_thb", "area_sqm"];
  const missing = required.filter((header) => indexOf(header) < 0);
  if (missing.length)
    throw new Error(`ขาดคอลัมน์ที่จำเป็น: ${missing.join(", ")}`);
  const cell = (row: string[], header: string) => {
    const index = indexOf(header);
    return index < 0 ? "" : (row[index] ?? "").trim();
  };
  const number = (value: string) => Number(value.replace(/[฿,\s]/g, ""));
  const errors: ImportErrorRow[] = [];
  const items = rows.flatMap((row, rowIndex) => {
    const name = cell(row, "name");
    const district = cell(row, "district");
    const rawType = cell(row, "type").toLowerCase();
    const rawPrice = number(cell(row, "price_thb"));
    const size = number(cell(row, "area_sqm"));
    const rawLatitude = cell(row, "latitude");
    const rawLongitude = cell(row, "longitude");
    const hasCoordinates = rawLatitude !== "" || rawLongitude !== "";
    const latitude = hasCoordinates ? Number(rawLatitude) : undefined;
    const longitude = hasCoordinates ? Number(rawLongitude) : undefined;
    const type =
      rawType.includes("หอพัก") ||
      rawType.includes("dorm") ||
      rawType.includes("hostel")
        ? "หอพัก"
        : rawType.includes("คอนโด") || rawType.includes("condo")
          ? "คอนโด"
          : null;
    const invalidCoordinates =
      hasCoordinates &&
      (rawLatitude === "" ||
        rawLongitude === "" ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude! < -90 ||
        latitude! > 90 ||
        longitude! < -180 ||
        longitude! > 180);
    const reasons: string[] = [];
    if (!name) reasons.push("ไม่มีชื่อทรัพย์");
    if (!district) reasons.push("ไม่ระบุเขต/ย่าน");
    if (!type) reasons.push("ประเภทต้องเป็น คอนโด หรือ หอพัก");
    if (!Number.isFinite(rawPrice) || rawPrice <= 0)
      reasons.push("ราคาขายต้องเป็นตัวเลขมากกว่า 0");
    if (!Number.isFinite(size) || size <= 0)
      reasons.push("พื้นที่ต้องเป็นตัวเลขมากกว่า 0");
    if (invalidCoordinates)
      reasons.push(
        "พิกัดต้องใส่ latitude และ longitude ให้ครบและอยู่ในช่วงที่ถูกต้อง",
      );
    if (reasons.length) {
      errors.push({
        rowNumber: rowIndex + 2,
        reason: reasons.join("; "),
        values: row,
      });
      return [];
    }
    const rawRisk = cell(row, "flood_risk").toLowerCase();
    const risk: Property["risk"] =
      rawRisk === "ต่ำ" || rawRisk === "low"
        ? "ต่ำ"
        : rawRisk === "เฝ้าระวัง" || rawRisk === "watch" || rawRisk === "medium"
          ? "เฝ้าระวัง"
          : rawRisk === "สูง" || rawRisk === "high"
            ? "สูง"
            : "ไม่ระบุ";
    const rentValue = number(
      cell(row, "monthly_rent_thb") || cell(row, "rent_thb"),
    );
    const transit = cell(row, "transit");
    const rawSourceUrl = cell(row, "source_url");
    let sourceUrl: string | undefined;
    if (rawSourceUrl) {
      try {
        const parsedUrl = new URL(rawSourceUrl);
        if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:")
          sourceUrl = parsedUrl.toString();
      } catch {
        /* Ignore an invalid optional source link while keeping the row. */
      }
    }
    return [
      {
        name,
        location: transit ? `${district} · ${transit}` : district,
        type: type!,
        price: rawPrice / 1_000_000,
        rent: Number.isFinite(rentValue) && rentValue > 0 ? rentValue : 0,
        size,
        risk,
        latitude,
        longitude,
        icon: type === "คอนโด" ? "🏢" : "🏠",
        source: cell(row, "source") || "นำเข้าจาก CSV",
        sourceUrl,
        observedAt: cell(row, "observed_at"),
        isImported: true,
      } satisfies Property,
    ];
  });
  return { items, errors, headers };
}

const comparisonRows: {
  label: string;
  value: (property: Property) => string;
}[] = [
  { label: "ประเภท", value: (property) => property.type },
  {
    label: "ราคาเสนอขาย",
    value: (property) => `฿ ${property.price.toFixed(2)} ล้านบาท`,
  },
  {
    label: "ราคาต่อ ตร.ม.",
    value: (property) =>
      `฿ ${money(Math.round((property.price * 1_000_000) / property.size))}`,
  },
  { label: "พื้นที่ใช้สอย", value: (property) => `${property.size} ตร.ม.` },
  {
    label: "ค่าเช่าต่อเดือน",
    value: (property) => `฿ ${money(property.rent)}`,
  },
  {
    label: "Gross rental yield",
    value: (property) =>
      `${(((property.rent * 12) / (property.price * 1_000_000)) * 100).toFixed(2)}%`,
  },
  {
    label: "ใกล้รถไฟฟ้า",
    value: (property) =>
      property.location.split("·")[1]?.trim() ?? "ไม่มีข้อมูล",
  },
  {
    label: "ความเสี่ยงน้ำท่วม",
    value: (property) =>
      `${property.risk} · ${property.isImported ? "นำเข้าจากไฟล์" : "ข้อมูลสมมติ"}`,
  },
];

function BangkokMap({
  onSelectProperty,
  mapProperties,
}: {
  onSelectProperty: (property: Property) => void;
  mapProperties: Property[];
}) {
  const [showPrices, setShowPrices] = useState(true);
  const [showFloodRisk, setShowFloodRisk] = useState(false);
  const [mapType, setMapType] = useState("all");
  const [mapRisk, setMapRisk] = useState("all");
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const onSelectPropertyRef = useRef(onSelectProperty);
  const [mapReady, setMapReady] = useState(false);
  const [mapStatus, setMapStatus] = useState<
    "loading" | "ready" | "tile-error" | "error"
  >("loading");
  useEffect(() => {
    onSelectPropertyRef.current = onSelectProperty;
  }, [onSelectProperty]);

  useEffect(() => {
    let cancelled = false;
    void import("leaflet")
      .then((L) => {
        if (cancelled || !mapContainerRef.current) return;

        const map = L.map(mapContainerRef.current, {
          center: [13.7563, 100.5018],
          zoom: 11,
          scrollWheelZoom: true,
          zoomControl: false,
        });
        const tiles = L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors",
          },
        );
        tiles.on("tileerror", () => setMapStatus("tile-error"));
        tiles.on("tileload", () =>
          setMapStatus((status) =>
            status === "tile-error" ? "ready" : status,
          ),
        );
        tiles.addTo(map);
        mapRef.current = map;
        markerLayerRef.current = L.layerGroup().addTo(map);
        leafletRef.current = L;
        setMapReady(true);
        setMapStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Failed to load the property map", error);
        setMapStatus("error");
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  const mappedImports = useMemo(
    () =>
      mapProperties.flatMap((property) => {
        const latitude = property.latitude;
        const longitude = property.longitude;
        if (
          typeof latitude !== "number" ||
          typeof longitude !== "number" ||
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180
        )
          return [];
        return [
          {
            property,
            position: [latitude, longitude] as Leaflet.LatLngTuple,
          },
        ];
      }),
    [mapProperties],
  );
  const visiblePins = useMemo(
    () =>
      mappedImports.filter(
        ({ property }) =>
          (mapType === "all" || property.type === mapType) &&
          (mapRisk === "all" ||
            (mapRisk === "low" && property.risk === "ต่ำ") ||
            (mapRisk === "watch" && property.risk === "เฝ้าระวัง") ||
            (mapRisk === "high" && property.risk === "สูง") ||
            (mapRisk === "unknown" && property.risk === "ไม่ระบุ")),
      ),
    [mappedImports, mapType, mapRisk],
  );
  useEffect(() => {
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    const L = leafletRef.current;
    if (!map || !markerLayer || !L) return;

    markerLayer.clearLayers();
    visiblePins.forEach(({ property, position }) => {
      const marker = L.circleMarker(position, {
          radius: 8,
          color: "#fff",
          weight: 2,
          fillColor: showFloodRisk
            ? property.risk === "ต่ำ"
              ? "#538968"
              : property.risk === "เฝ้าระวัง"
                ? "#dc835c"
                : property.risk === "สูง"
                  ? "#c94b43"
                  : "#818b84"
            : "#1e725d",
          fillOpacity: 0.95,
        },
      );
      if (showPrices) {
        const priceLabel = document.createElement("span");
        priceLabel.textContent = `฿ ${property.price.toFixed(2)} ล.`;
        marker.bindTooltip(priceLabel, {
          direction: "top",
          offset: [0, -8],
          opacity: 0.95,
        });
      }
      marker.on("click", () => onSelectPropertyRef.current(property));
      marker.addTo(markerLayer);
    });

    if (visiblePins.length) {
      const bounds = L.latLngBounds(
        visiblePins.map(({ position }) => position),
      );
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
    } else {
      map.setView([13.7563, 100.5018], 11);
    }
    map.invalidateSize();
  }, [mapReady, visiblePins, showPrices, showFloodRisk]);
  return (
    <div className="map-canvas">
      <div
        ref={mapContainerRef}
        className="leaflet-map"
        role="img"
        aria-label="แผนที่จริงพร้อมตำแหน่งทรัพย์สินตามพิกัด"
      />
      <div className="map-controls">
        <button
          aria-label="ซูมเข้าแผนที่"
          title="ซูมเข้า"
          onClick={() => mapRef.current?.zoomIn()}
        >
          +
        </button>
        <button
          aria-label="ซูมออกจากแผนที่"
          title="ซูมออก"
          onClick={() => mapRef.current?.zoomOut()}
        >
          −
        </button>
        <button
          className={showPrices ? "selected" : ""}
          aria-pressed={showPrices}
          onClick={() => setShowPrices((value) => !value)}
        >
          ฿ ราคาเสนอขาย
        </button>
        <button
          className={showFloodRisk ? "selected" : ""}
          aria-pressed={showFloodRisk}
          onClick={() => setShowFloodRisk((value) => !value)}
        >
          สีหมุดตามความเสี่ยง
        </button>
        <select
          aria-label="กรองประเภททรัพย์สินบนแผนที่"
          value={mapType}
          onChange={(event) => setMapType(event.target.value)}
        >
          <option value="all">ทุกประเภท</option>
          <option value="คอนโด">คอนโด</option>
          <option value="หอพัก">หอพัก</option>
        </select>
        <select
          aria-label="กรองความเสี่ยงบนแผนที่"
          value={mapRisk}
          onChange={(event) => setMapRisk(event.target.value)}
        >
          <option value="all">ทุกระดับ</option>
          <option value="low">ความเสี่ยงต่ำ</option>
          <option value="watch">เฝ้าระวัง</option>
          <option value="high">ความเสี่ยงสูง</option>
          <option value="unknown">ไม่มีข้อมูลเสี่ยง</option>
        </select>
      </div>
      {mapStatus === "loading" && (
        <div className="map-status">กำลังโหลดแผนที่…</div>
      )}
      {mapStatus === "error" && (
        <div className="map-status" role="alert">
          โหลดแผนที่ไม่สำเร็จ โปรดลองรีเฟรชหน้า
        </div>
      )}
      {mapStatus === "tile-error" && (
        <div className="map-status" role="status">
          โหลดแผนที่บางส่วนไม่ได้ · ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต
        </div>
      )}
      {mapStatus === "ready" && visiblePins.length === 0 && (
        <div className="map-status">
          {mappedImports.length === 0
            ? `ยังไม่มีทรัพย์ที่ระบุพิกัดครบ (${mapProperties.length} รายการไม่มีพิกัด)`
            : "ไม่มีทรัพย์ที่ตรงกับตัวกรองแผนที่"}
        </div>
      )}
      <div className="map-legend">
        {showFloodRisk && (
          <>
            <span>
              <i className="low-dot" />
              ความเสี่ยงต่ำ
            </span>
            <span>
              <i className="orange-dot" />
              เฝ้าระวัง
            </span>
            <span>
              <i className="red-dot" />
              ความเสี่ยงสูง
            </span>
            <span>
              <i className="unknown-dot" />
              ไม่ระบุ
            </span>
          </>
        )}
      </div>
      <div className="map-disclaimer">
        OpenStreetMap · แสดงหมุด {visiblePins.length} รายการจากพิกัดจริง
      </div>
    </div>
  );
}

export default function Home() {
  const [districtFilter, setDistrictFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [budget, setBudget] = useState("all");
  const [rentBudget, setRentBudget] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recommended");
  const [listingPagination, setListingPagination] = useState({
    key: "",
    page: 1,
  });
  const [active, setActive] = useState("ภาพรวม");
  const [notice, setNotice] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [importedProperties, setImportedProperties] = useState<Property[]>([]);
  const [importErrors, setImportErrors] = useState<{
    headers: string[];
    rows: ImportErrorRow[];
  } | null>(null);
  const [importsReady, setImportsReady] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(
    null,
  );
  const dialogRef = useRef<HTMLElement | null>(null);
  const listingSectionRef = useRef<HTMLElement | null>(null);
  const [occupiedMonths, setOccupiedMonths] = useState(11);
  const [monthlyCosts, setMonthlyCosts] = useState(1500);
  const [compareNames, setCompareNames] = useState<string[]>([]);
  const [compareReady, setCompareReady] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showInvestment, setShowInvestment] = useState(false);
  const [homePrice, setHomePrice] = useState(4_000_000);
  const [monthlyRent, setMonthlyRent] = useState(16_500);
  const [downPaymentPercent, setDownPaymentPercent] = useState(20);
  const [interestPercent, setInterestPercent] = useState(6);
  const [loanTermYears, setLoanTermYears] = useState(30);
  const [propertyGrowthPercent, setPropertyGrowthPercent] = useState(2.5);
  const [investmentReturnPercent, setInvestmentReturnPercent] = useState(4);
  const activeDialog = showCompare
    ? "compare"
    : showInvestment
      ? "investment"
      : selectedProperty
        ? "property"
        : null;

  const availableProperties = useMemo(() => {
    const importedNames = new Set(
      importedProperties.map((property) => property.name),
    );
    return [
      ...properties.filter((property) => !importedNames.has(property.name)),
      ...importedProperties,
    ];
  }, [importedProperties]);

  const districtOptions = useMemo(
    () =>
      [
        ...new Set(
          availableProperties
            .map((property) => property.location.split("·")[0].trim())
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, "th")),
    [availableProperties],
  );
  const districtProperties = useMemo(
    () =>
      districtFilter === "all"
        ? availableProperties
        : availableProperties.filter(
            (property) =>
              property.location.split("·")[0].trim() === districtFilter,
          ),
    [availableProperties, districtFilter],
  );

  const dashboardStats = useMemo(() => {
    const withRent = districtProperties.filter(
      (property) => property.rent > 0,
    );
    const totalAskingPrice = districtProperties.reduce(
      (sum, property) => sum + property.price,
      0,
    );
    const totalRent = withRent.reduce(
      (sum, property) => sum + property.rent,
      0,
    );
    const totalRentablePrice = withRent.reduce(
      (sum, property) => sum + property.price,
      0,
    );
    return {
      total: districtProperties.length,
      averageAskingPrice: districtProperties.length
        ? totalAskingPrice / districtProperties.length
        : 0,
      averageRent: withRent.length ? totalRent / withRent.length : 0,
      grossYield: totalRentablePrice
        ? ((totalRent * 12) / (totalRentablePrice * 1_000_000)) * 100
        : 0,
      rentCount: withRent.length,
    };
  }, [districtProperties]);

  const importedCoverage = useMemo(() => {
    const total = importedProperties.length;
    const counts = [
      { label: "มีค่าเช่า", count: importedProperties.filter((item) => item.rent > 0).length },
      { label: "ระบุแหล่งข้อมูล", count: importedProperties.filter((item) => item.source && item.source !== "นำเข้าจาก CSV").length },
      { label: "มีพิกัด", count: importedProperties.filter((item) => item.latitude !== undefined && item.longitude !== undefined).length },
      { label: "มีวันที่สังเกต", count: importedProperties.filter((item) => Boolean(item.observedAt)).length },
    ];
    const percentage = total
      ? Math.round(counts.reduce((sum, item) => sum + item.count / total, 0) / counts.length * 100)
      : 0;
    return { total, counts, percentage };
  }, [importedProperties]);

  const yieldByDistrict = useMemo(() => {
    const districts = new Map<string, Property[]>();
    districtProperties.forEach((property) => {
      const district = property.location.split("·")[0].trim() || "ไม่ระบุย่าน";
      districts.set(district, [...(districts.get(district) ?? []), property]);
    });
    return [...districts.entries()]
      .map(([district, districtProperties]) => {
        const withRent = districtProperties.filter(
          (property) => property.rent > 0,
        );
        const totalRent = withRent.reduce(
          (sum, property) => sum + property.rent,
          0,
        );
        const totalPrice = withRent.reduce(
          (sum, property) => sum + property.price,
          0,
        );
        return {
          district,
          listingCount: districtProperties.length,
          rentCount: withRent.length,
          grossYield: totalPrice
            ? ((totalRent * 12) / (totalPrice * 1_000_000)) * 100
            : null,
        };
      })
      .sort((a, b) => (b.grossYield ?? -1) - (a.grossYield ?? -1))
      .slice(0, 3);
  }, [districtProperties]);

  const priceByDistrict = useMemo(() => {
    const districts = new Map<string, Property[]>();
    districtProperties.forEach((property) => {
      const district = property.location.split("·")[0].trim() || "ไม่ระบุย่าน";
      districts.set(district, [...(districts.get(district) ?? []), property]);
    });
    const ranked = [...districts.entries()]
      .map(([district, districtProperties]) => ({
        district,
        listingCount: districtProperties.length,
        averagePricePerSqm:
          districtProperties.reduce(
            (sum, property) =>
              sum + (property.price * 1_000_000) / property.size,
            0,
          ) / districtProperties.length,
      }))
      .sort((a, b) => b.averagePricePerSqm - a.averagePricePerSqm)
      .slice(0, 4);
    const maxPricePerSqm = ranked[0]?.averagePricePerSqm ?? 0;
    return ranked.map((area) => ({
      ...area,
      barWidth: maxPricePerSqm
        ? (area.averagePricePerSqm / maxPricePerSqm) * 100
        : 0,
    }));
  }, [districtProperties]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem("baanคิด:favorites");
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (Array.isArray(parsed))
            setFavorites(
              parsed.filter((name): name is string => typeof name === "string"),
            );
        }
      } catch {
        setFavorites([]);
      } finally {
        setFavoritesReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const cleanupKey = "baanคิด:sample-only-cleanup:v1";
        if (window.localStorage.getItem(cleanupKey) !== "done") {
          window.localStorage.removeItem("baanคิด:imported-properties");
          window.localStorage.setItem(cleanupKey, "done");
        }
        const stored = window.localStorage.getItem(
          "baanคิด:imported-properties",
        );
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (Array.isArray(parsed))
            setImportedProperties(
              parsed
                .filter(
                  (item): item is Property =>
                    item &&
                    typeof item.name === "string" &&
                    typeof item.location === "string" &&
                    (item.type === "คอนโด" || item.type === "หอพัก") &&
                    typeof item.price === "number" &&
                    typeof item.size === "number",
                )
                .map((item) => ({
                  ...item,
                  name: repairThaiMojibake(item.name),
                  location: repairThaiMojibake(item.location),
                  source: item.source
                    ? repairThaiMojibake(item.source)
                    : item.source,
                })),
            );
        }
      } catch {
        setImportedProperties([]);
        setNotice("ไม่สามารถโหลดหรือล้างข้อมูล CSV ในเบราว์เซอร์ได้");
      } finally {
        setImportsReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!importsReady) return;
    try {
      window.localStorage.setItem(
        "baanคิด:imported-properties",
        JSON.stringify(importedProperties),
      );
    } catch {
      setTimeout(() => {
        setNotice(
          "พื้นที่จัดเก็บในเบราว์เซอร์เต็ม ข้อมูลนำเข้าจะไม่ถูกบันทึกหลังปิดหน้านี้",
        );
      }, 0);
    }
  }, [importedProperties, importsReady]);

  useEffect(() => {
    if (favoritesReady)
      window.localStorage.setItem(
        "baanคิด:favorites",
        JSON.stringify(favorites),
      );
  }, [favorites, favoritesReady]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem("baanคิด:compare-names");
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (Array.isArray(parsed))
            setCompareNames(
              parsed
                .filter((name): name is string => typeof name === "string")
                .slice(0, 5),
            );
        }
      } catch {
        setCompareNames([]);
      } finally {
        setCompareReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!compareReady) return;
    try {
      window.localStorage.setItem(
        "baanคิด:compare-names",
        JSON.stringify(compareNames),
      );
    } catch {
      // Keep the comparison controls usable if browser storage is unavailable.
    }
  }, [compareNames, compareReady]);

  useEffect(() => {
    if (!activeDialog) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    const focusableElements = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
    const initialFocus = focusableElements()[0] ?? dialogRef.current;
    initialFocus?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (activeDialog === "compare") setShowCompare(false);
        else if (activeDialog === "investment") setShowInvestment(false);
        else setSelectedProperty(null);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableElements();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current?.focus();
      } else if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [activeDialog, selectedProperty?.name]);

  const filtered = useMemo(() => {
    const matches = districtProperties.filter((property) => {
      const matchesQuery = `${property.name} ${property.location}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
      const matchesFavorite =
        active !== "รายการที่บันทึก" || favorites.includes(property.name);
      const matchesRisk = riskFilter === "all" || property.risk === riskFilter;
      const matchesRent =
        rentBudget === "all" ||
        (property.rent > 0 && property.rent <= Number(rentBudget));
      return (
        matchesQuery &&
        matchesFavorite &&
        matchesRisk &&
        matchesRent &&
        (type === "all" || property.type === type) &&
        (budget === "all" || property.price <= Number(budget))
      );
    });
    if (sortBy === "price-asc")
      return matches.sort((a, b) => a.price - b.price);
    if (sortBy === "price-desc")
      return matches.sort((a, b) => b.price - a.price);
    if (sortBy === "sqm-asc")
      return matches.sort(
        (a, b) =>
          (a.price * 1_000_000) / a.size - (b.price * 1_000_000) / b.size,
      );
    if (sortBy === "yield-desc")
      return matches.sort((a, b) => b.rent / b.price - a.rent / a.price);
    return matches;
  }, [
    query,
    type,
    budget,
    rentBudget,
    riskFilter,
    sortBy,
    active,
    favorites,
    districtProperties,
  ]);

  const listingPageKey = filtered
    .map((property) => property.name)
    .join("\u001f");
  const listingPage =
    listingPagination.key === listingPageKey ? listingPagination.page : 1;
  const listingsPerPage = 5;
  const pageCount = Math.max(1, Math.ceil(filtered.length / listingsPerPage));
  const pageItems = filtered.slice(
    (listingPage - 1) * listingsPerPage,
    listingPage * listingsPerPage,
  );
  const goToListingPage = (page: number) =>
    setListingPagination({ key: listingPageKey, page });

  const resetExplorerFilters = () => {
    setDistrictFilter("all");
    setQuery("");
    setType("all");
    setBudget("all");
    setRentBudget("all");
    setRiskFilter("all");
    setSortBy("recommended");
  };
  const openSavedListings = () => {
    resetExplorerFilters();
    setActive("รายการที่บันทึก");
    window.requestAnimationFrame(() =>
      listingSectionRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      }),
    );
  };

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  };
  const handleCsvImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const { items, errors, headers } = parsePropertyCsv(await file.text());
      setImportErrors(errors.length ? { headers, rows: errors } : null);
      if (items.length === 0)
        throw new Error(
          "ไม่มีรายการที่นำเข้าได้ ตรวจสอบข้อมูลและรูปแบบคอลัมน์ในไฟล์",
        );
      setImportedProperties((current) => {
        const merged = new Map(current.map((item) => [item.name, item]));
        items.forEach((item) => merged.set(item.name, item));
        return [...merged.values()];
      });
      setActive("ค้นหาทรัพย์");
      resetExplorerFilters();
      showNotice(
        `นำเข้า ${items.length} รายการ${errors.length ? ` · พบ ${errors.length} แถวที่ต้องแก้ไข` : ""}`,
      );
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "อ่านไฟล์ CSV ไม่สำเร็จ",
      );
    } finally {
      input.value = "";
    }
  };
  const exportImportErrors = () => {
    if (!importErrors) return;
    const headers = ["row_number", "error", ...importErrors.headers];
    const csvCell = (value: string | number | undefined) => {
      const text = String(value ?? "");
      const safeText = /^[\s]*[=+@\-]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const rows = importErrors.rows.map((row) =>
      [
        row.rowNumber,
        row.reason,
        ...importErrors.headers.map((_, index) => row.values[index] ?? ""),
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = `\uFEFF${headers.map(csvCell).join(",")}\r\n${rows.join("\r\n")}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `baan-khid-import-errors-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const removeImportedProperty = (property: Property) => {
    setImportedProperties((current) =>
      current.filter((item) => item.name !== property.name),
    );
    setFavorites((current) => current.filter((name) => name !== property.name));
    setCompareNames((current) =>
      current.filter((name) => name !== property.name),
    );
    setSelectedProperty(null);
    showNotice(`ลบ ${property.name} ออกจากข้อมูลนำเข้าแล้ว`);
  };
  const clearImportedProperties = () => {
    const importedNames = new Set(
      importedProperties.map((property) => property.name),
    );
    setImportedProperties([]);
    setFavorites((current) =>
      current.filter((name) => !importedNames.has(name)),
    );
    setCompareNames((current) =>
      current.filter((name) => !importedNames.has(name)),
    );
    if (selectedProperty?.isImported) setSelectedProperty(null);
    showNotice(`ล้างข้อมูลนำเข้า ${importedNames.size} รายการแล้ว`);
  };
  const openPropertyDetail = (property: Property) => {
    setShowInvestment(false);
    setShowCompare(false);
    setSelectedProperty(property);
  };
  const openInvestmentLab = () => {
    setSelectedProperty(null);
    setShowCompare(false);
    setShowInvestment(true);
  };
  const openCompareDialog = () => {
    setSelectedProperty(null);
    setShowInvestment(false);
    setShowCompare(true);
  };
  const exportImportedCsv = () => {
    const headers = [
      "name",
      "district",
      "type",
      "price_thb",
      "monthly_rent_thb",
      "area_sqm",
      "transit",
      "flood_risk",
      "latitude",
      "longitude",
      "source",
      "source_url",
      "observed_at",
    ];
    const csvCell = (value: string | number | undefined) => {
      const text = String(value ?? "");
      const safeText = /^[\s]*[=+@\-]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const rows = importedProperties.map((property) => {
      const [district = "", ...transitParts] = property.location
        .split("·")
        .map((part) => part.trim());
      return [
        property.name,
        district,
        property.type,
        Math.round(property.price * 1_000_000),
        property.rent || "",
        property.size,
        transitParts.join(" · "),
        property.risk,
        property.latitude,
        property.longitude,
        property.source,
        property.sourceUrl,
        property.observedAt,
      ]
        .map(csvCell)
        .join(",");
    });
    const csv = `\uFEFF${headers.join(",")}\r\n${rows.join("\r\n")}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `baan-khid-imported-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const toggleFavorite = (property: Property) =>
    setFavorites((current) =>
      current.includes(property.name)
        ? current.filter((name) => name !== property.name)
        : [...current, property.name],
    );
  const comparedProperties = availableProperties.filter((property) =>
    compareNames.includes(property.name),
  );
  const exportComparisonCsv = () => {
    if (comparedProperties.length < 2) return;
    const csvCell = (value: string) => {
      const safeText = /^[\s]*[=+@\-]/.test(value) ? `'${value}` : value;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const rows = [
      ["ข้อมูล", ...comparedProperties.map((property) => property.name)],
      ...comparisonRows.map((row) => [
        row.label,
        ...comparedProperties.map((property) => row.value(property)),
      ]),
    ];
    const csv = `\uFEFF${rows
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `baan-khid-comparison-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const similarProperties = selectedProperty
    ? (() => {
        const selectedDistrict = selectedProperty.location
          .split("·")[0]
          .trim()
          .toLowerCase();
        const selectedUnitPrice =
          (selectedProperty.price * 1_000_000) / selectedProperty.size;
        return availableProperties
          .filter((property) => property.name !== selectedProperty.name)
          .map((property) => {
            const unitPrice = (property.price * 1_000_000) / property.size;
            const sameDistrict =
              property.location.split("·")[0].trim().toLowerCase() ===
              selectedDistrict;
            const score =
              (property.type === selectedProperty.type ? 0 : 1000) +
              (sameDistrict ? 0 : 100) +
              Math.abs(unitPrice - selectedUnitPrice) / selectedUnitPrice;
            return {
              property,
              unitPrice,
              score,
              delta:
                ((unitPrice - selectedUnitPrice) / selectedUnitPrice) * 100,
            };
          })
          .sort((a, b) => a.score - b.score)
          .slice(0, 3);
      })()
    : [];
  const toggleCompare = (property: Property) => {
    if (compareNames.includes(property.name)) {
      setCompareNames((current) =>
        current.filter((name) => name !== property.name),
      );
    } else if (compareNames.length >= 5) {
      showNotice("เปรียบเทียบได้สูงสุด 5 รายการ");
    } else {
      setCompareNames((current) => [...current, property.name]);
    }
  };

  const investment = useMemo(() => {
    const months = loanTermYears * 12;
    const monthlyInterest = interestPercent / 100 / 12;
    const principal = homePrice * (1 - downPaymentPercent / 100);
    const mortgagePayment =
      monthlyInterest === 0
        ? principal / months
        : (principal * monthlyInterest) /
          (1 - (1 + monthlyInterest) ** -months);
    const elapsedMonths = months;
    const growthFactor = (1 + monthlyInterest) ** elapsedMonths;
    const remainingLoan =
      monthlyInterest === 0
        ? 0
        : Math.max(
            0,
            principal * growthFactor -
              mortgagePayment * ((growthFactor - 1) / monthlyInterest),
          );
    const monthlyMaintenance = (homePrice * 0.01) / 12;
    const monthlyOwnerCost = mortgagePayment + monthlyMaintenance;
    const monthlyHousingBudget = Math.max(monthlyOwnerCost, monthlyRent);
    const marketMonthlyRate = investmentReturnPercent / 100 / 12;
    const futureMonthlyInvestments = (monthlyAmount: number) =>
      marketMonthlyRate === 0
        ? monthlyAmount * months
        : (monthlyAmount * ((1 + marketMonthlyRate) ** months - 1)) /
          marketMonthlyRate;
    const buyerMonthlyInvestments = futureMonthlyInvestments(
      Math.max(0, monthlyHousingBudget - monthlyOwnerCost),
    );
    const renterMonthlyInvestments = futureMonthlyInvestments(
      Math.max(0, monthlyHousingBudget - monthlyRent),
    );
    const buyerCashAtStart = homePrice * (downPaymentPercent / 100 + 0.02);
    const renterInitialInvestment =
      buyerCashAtStart * (1 + marketMonthlyRate) ** months;
    const futureHomeValue =
      homePrice * (1 + propertyGrowthPercent / 100) ** loanTermYears;
    const buyerNetWorth =
      futureHomeValue - remainingLoan + buyerMonthlyInvestments;
    const renterNetWorth = renterInitialInvestment + renterMonthlyInvestments;
    return {
      mortgagePayment,
      monthlyOwnerCost,
      monthlyRent,
      futureHomeValue,
      remainingLoan,
      buyerNetWorth,
      renterNetWorth,
      buyerCashAtStart,
    };
  }, [
    homePrice,
    monthlyRent,
    downPaymentPercent,
    interestPercent,
    loanTermYears,
    propertyGrowthPercent,
    investmentReturnPercent,
  ]);

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">บ</div>
          <div className="brand-name">
            บ้านคิด<small>BANGKOK PROPERTY INTELLIGENCE</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="เมนูหลัก">
          {[
            ["◫", "ภาพรวม"],
            ["⌕", "ค้นหาทรัพย์"],
            ["⌖", "วิเคราะห์ทำเล"],
            ["▤", "เครื่องมือการลงทุน"],
            ["♡", "รายการที่บันทึก"],
          ].map(([icon, label]) => (
            <button
              key={label}
              className={active === label ? "active" : ""}
              onClick={() => {
                if (label === "รายการที่บันทึก") {
                  openSavedListings();
                  return;
                }
                setActive(label);
                if (label === "เครื่องมือการลงทุน") openInvestmentLab();
                else if (label === "ค้นหาทรัพย์") resetExplorerFilters();
                else if (label === "วิเคราะห์ทำเล")
                  showNotice("คลิกหมุดบนแผนที่เพื่อดูรายละเอียดทรัพย์สิน");
              }}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="nav-label">YOUR PILOT</div>
          <div className="pilot-card">
            <b>พื้นที่นำร่อง · กรุงเทพฯ</b>
            <p>ข้อมูลปัจจุบันครอบคลุม {districtOptions.length} เขต/ย่าน</p>
            <button
              onClick={() =>
                showNotice(
                  `เลือกพื้นที่จากตัวเลือกมุมขวาบน · ${districtOptions.length} เขต/ย่าน`,
                )
              }
            >
              ดูขอบเขตข้อมูล ↗
            </button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Bangkok <span>/</span> <strong>{active}</strong>
          </div>
          <div className="top-actions">
            <label className="city-picker">
              <span aria-hidden="true">⌖</span>
              <select
                aria-label="เลือกเขตหรือย่านในกรุงเทพมหานคร"
                value={districtFilter}
                onChange={(event) => setDistrictFilter(event.target.value)}
              >
                <option value="all">ทุกเขต · กรุงเทพฯ</option>
                {districtOptions.map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
            </label>
            <button className="bell" aria-label="การแจ้งเตือน">
              ♧
            </button>
          </div>
        </header>
        <div className="content-area">
          <section className="page-heading">
            <div>
              <h1>มองตลาดอสังหาฯ ให้ขาด</h1>
              <p>
                ต้นแบบเพื่อการศึกษา · ข้อมูลและตัวเลขทั้งหมดเป็นข้อมูลสมมติ ไม่ใช่ข้อมูลตลาดจริง
              </p>
            </div>
            <div className="heading-actions">
              <div className="updated">
                <i />
                ชุดข้อมูลสมมติเพื่อการศึกษา
              </div>
              <label className="csv-import-button">
                พรีวิว CSV บนเครื่องนี้
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvImport}
                />
              </label>
              <a
                className="csv-template-link"
                href="/property-import-template.csv"
                download
              >
                แม่แบบ CSV
              </a>
              <a
                className="csv-template-link"
                href="/property-import-sample.csv"
                download
              >
                ไฟล์ตัวอย่างหลายเขต
              </a>
              {importedProperties.length > 0 && (
                <button
                  className="csv-export-button"
                  onClick={exportImportedCsv}
                >
                  ส่งออก CSV
                </button>
              )}
              {importErrors && (
                <button
                  className="csv-export-button"
                  onClick={exportImportErrors}
                >
                  ดาวน์โหลดรายงานข้อผิดพลาด ({importErrors.rows.length})
                </button>
              )}
              {importedProperties.length > 0 && (
                <button
                  className="csv-clear-button"
                  onClick={clearImportedProperties}
                >
                  ล้างข้อมูลบนเครื่อง
                </button>
              )}
            </div>
          </section>
          {importErrors && (
            <section className="csv-error-report" aria-live="polite">
              <div>
                <strong>นำเข้าบางแถวไม่สำเร็จ</strong>
                <span>
                  {importErrors.rows.length} แถวถูกข้าม ·
                  ดาวน์โหลดรายงานเพื่อดูเลขแถวและสาเหตุ
                  แล้วแก้ไฟล์ก่อนนำเข้าอีกครั้ง
                </span>
              </div>
              <ul>
                {importErrors.rows.slice(0, 3).map((error) => (
                  <li key={error.rowNumber}>
                    แถว {error.rowNumber}: {error.reason}
                  </li>
                ))}
              </ul>
              {importErrors.rows.length > 3 && (
                <small>แสดง 3 จาก {importErrors.rows.length} แถว</small>
              )}
            </section>
          )}
          {importedCoverage.total > 0 && (
            <section
              className="import-coverage"
              aria-labelledby="import-coverage-title"
            >
              <div className="import-coverage-heading">
                <div>
                  <h2 id="import-coverage-title">ความครอบคลุมของข้อมูล CSV</h2>
                  <p>
                    {importedCoverage.total} รายการ · สรุปจากข้อมูลที่นำเข้าในเบราว์เซอร์นี้
                  </p>
                </div>
                <strong>
                  {importedCoverage.percentage}%
                  <small>ความครอบคลุมเฉลี่ย</small>
                </strong>
              </div>
              <div className="import-coverage-grid">
                {importedCoverage.counts.map(({ label, count }) => {
                  const percent = Math.round(
                    (count / importedCoverage.total) * 100,
                  );
                  return (
                    <div className="import-coverage-item" key={label}>
                      <div>
                        <span>{label}</span>
                        <b>
                          {count}/{importedCoverage.total}
                        </b>
                      </div>
                      <div
                        className="import-coverage-track"
                        role="progressbar"
                        aria-label={label}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                      >
                        <span style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="import-coverage-note">
                แสดงว่ามีการกรอกช่องข้อมูลเหล่านี้ ไม่ได้ยืนยันความถูกต้องของข้อมูล
              </p>
            </section>
          )}
          <section
            className="searchbar"
            aria-label="ค้นหาและกรองอสังหาริมทรัพย์"
          >
            <label className="search-input">
              <span>⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหาโครงการ ย่าน หรือเขต เช่น อ่อนนุช"
              />
            </label>
            <label className="select-filter">
              <span className="sr-only">ประเภททรัพย์สิน</span>
              <select
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="all">ทุกประเภท</option>
                <option value="คอนโด">คอนโด</option>
                <option value="หอพัก">หอพัก</option>
              </select>
            </label>
            <label className="select-filter">
              <span className="sr-only">งบซื้อสูงสุด</span>
              <select
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
              >
                <option value="all">ทุกงบซื้อ</option>
                <option value="3">ไม่เกิน 3 ลบ.</option>
                <option value="5">ไม่เกิน 5 ลบ.</option>
                <option value="8">ไม่เกิน 8 ลบ.</option>
              </select>
            </label>
            <label className="select-filter">
              <span className="sr-only">ค่าเช่าต่อเดือนสูงสุด</span>
              <select
                value={rentBudget}
                onChange={(event) => setRentBudget(event.target.value)}
              >
                <option value="all">ทุกค่าเช่า</option>
                <option value="10000">ไม่เกิน 10,000 บ.</option>
                <option value="20000">ไม่เกิน 20,000 บ.</option>
                <option value="30000">ไม่เกิน 30,000 บ.</option>
              </select>
            </label>
            <label className="select-filter">
              <span className="sr-only">ความเสี่ยงน้ำท่วม</span>
              <select
                value={riskFilter}
                onChange={(event) => setRiskFilter(event.target.value)}
              >
                <option value="all">ทุกความเสี่ยง</option>
                <option value="ต่ำ">ความเสี่ยงต่ำ</option>
                <option value="เฝ้าระวัง">เฝ้าระวัง</option>
                <option value="สูง">ความเสี่ยงสูง</option>
                <option value="ไม่ระบุ">ไม่ระบุความเสี่ยง</option>
              </select>
            </label>
            <label className="select-filter sort-filter">
              <span className="sr-only">เรียงผลลัพธ์</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
              >
                <option value="recommended">เรียงตามแนะนำ</option>
                <option value="price-asc">ราคาต่ำไปสูง</option>
                <option value="price-desc">ราคาสูงไปต่ำ</option>
                <option value="sqm-asc">ราคาต่อ ตร.ม. ต่ำไปสูง</option>
                <option value="yield-desc">Yield สูงไปต่ำ</option>
              </select>
            </label>
            <button
              className="search-button"
              onClick={() =>
                showNotice(`พบ ${filtered.length} รายการที่ตรงกับตัวกรอง`)
              }
            >
              ค้นหาทรัพย์สิน　→
            </button>
          </section>
          <section className="stats-grid">
            <article className="stat-card">
              <div className="stat-label">
                ราคาประกาศเฉลี่ย<span>⌂</span>
              </div>
              <div className="stat-value">
                ฿{" "}
                {dashboardStats.total
                  ? dashboardStats.averageAskingPrice.toFixed(2)
                  : "—"}{" "}
                ล.
              </div>
              <div className="stat-foot">
                เฉลี่ยจาก {dashboardStats.total} รายการในหน้า
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-label">
                ค่าเช่าเฉลี่ย / เดือน<span>▣</span>
              </div>
              <div className="stat-value">
                ฿{" "}
                {dashboardStats.rentCount
                  ? money(Math.round(dashboardStats.averageRent))
                  : "—"}
              </div>
              <div className="stat-foot">
                มีข้อมูลค่าเช่า {dashboardStats.rentCount} รายการ
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-label">
                Gross rental yield<span>↗</span>
              </div>
              <div className="stat-value">
                {dashboardStats.rentCount
                  ? `${dashboardStats.grossYield.toFixed(2)}%`
                  : "—"}
              </div>
              <div className="stat-foot">รวมจากรายการที่มีค่าเช่าและราคา</div>
            </article>
            <article className="stat-card">
              <div className="stat-label">
                รายการในชุดข้อมูล<span>⌖</span>
              </div>
              <div className="stat-value">{money(dashboardStats.total)}</div>
              <div className="stat-foot">
                ตัวอย่าง {dashboardStats.total - importedProperties.length} · CSV ในเครื่องนี้ {importedProperties.length}
              </div>
            </article>
          </section>
          <div className="primary-grid">
            <section className="panel map-panel">
              <div className="panel-heading">
                <div>
                  <h2>แผนที่กรุงเทพฯ</h2>
                  <p>ตำแหน่งทรัพย์สินจากละติจูดและลองจิจูด</p>
                </div>
                <button
                  className="text-link"
                  onClick={() =>
                    showNotice(
                      "ซูมด้วยล้อเมาส์หรือปุ่ม +/- และคลิกหมุดเพื่อดูรายละเอียดทรัพย์",
                    )
                  }
                >
                  วิธีใช้แผนที่
                </button>
              </div>
              <BangkokMap
                onSelectProperty={openPropertyDetail}
                mapProperties={districtProperties}
              />
            </section>
            <section className="panel market-panel">
              <div className="panel-heading">
                <div>
                  <h2>ราคาเสนอขายตามย่าน</h2>
                  <p>ค่าเฉลี่ยต่อตารางเมตรในชุดข้อมูลปัจจุบัน</p>
                </div>
                <button
                  className="text-link"
                  aria-label="วิธีคำนวณราคาต่อตารางเมตร"
                  onClick={() =>
                    showNotice(
                      "ราคาเสนอขายต่อตารางเมตร = ราคาเสนอขาย ÷ พื้นที่ใช้สอย แล้วเฉลี่ยตามย่าน",
                    )
                  }
                >
                  วิธีคำนวณ
                </button>
              </div>
              <div className="area-price-list">
                {priceByDistrict.map(
                  ({
                    district,
                    listingCount,
                    averagePricePerSqm,
                    barWidth,
                  }) => (
                    <div className="area-price-row" key={district}>
                      <div className="area-price-heading">
                        <span>{district}</span>
                        <strong>
                          ฿ {money(Math.round(averagePricePerSqm))}
                          <small> / ตร.ม.</small>
                        </strong>
                      </div>
                      <div
                        className="area-price-track"
                        role="progressbar"
                        aria-label={`ราคาเสนอขายเฉลี่ยต่อตารางเมตร ย่าน${district}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(barWidth)}
                      >
                        <div style={{ width: `${barWidth}%` }} />
                      </div>
                      <small>{listingCount} รายการ</small>
                    </div>
                  ),
                )}
              </div>
              <div className="market-note">
                ราคาเสนอขายเฉลี่ยจากข้อมูลที่มีในแต่ละย่าน ·
                ไม่ใช่ราคาซื้อขายจริงหรือแนวโน้มย้อนหลัง
              </div>
            </section>
          </div>
          <div className="secondary-grid">
            <section
              className="panel listing-panel"
              ref={listingSectionRef}
            >
              <div className="panel-heading">
                <div>
                  <h2>
                    {active === "รายการที่บันทึก"
                      ? "รายการที่บันทึก"
                      : "ทรัพย์สินน่าสนใจ"}
                  </h2>
                  <p>
                    พบ {filtered.length} รายการ · {importedProperties.length}{" "}
                    รายการนำเข้า · ข้อมูลจาก Supabase หรือข้อมูลตัวอย่าง
                  </p>
                </div>
                <button
                  className="text-link"
                  onClick={() => {
                    resetExplorerFilters();
                    if (active === "รายการที่บันทึก") setActive("ค้นหาทรัพย์");
                  }}
                >
                  ล้างตัวกรอง　→
                </button>
              </div>
              <div className="listing-head">
                <span>โครงการ / ทำเล</span>
                <span>ราคาขาย</span>
                <span>Gross yield</span>
                <span>ความเสี่ยง</span>
              </div>
              {filtered.length ? (
                pageItems.map((property) => (
                  <article className="listing-row" key={property.name}>
                    <div className="property-ident">
                      <button
                        className="property-favorite"
                        aria-label={
                          favorites.includes(property.name)
                            ? "นำออกจากรายการที่บันทึก"
                            : "เพิ่มในรายการที่บันทึก"
                        }
                        aria-pressed={favorites.includes(property.name)}
                        title={
                          favorites.includes(property.name)
                            ? "นำออกจากรายการที่บันทึก"
                            : "เพิ่มในรายการที่บันทึก"
                        }
                        onClick={() => toggleFavorite(property)}
                      >
                        {favorites.includes(property.name) ? "♥" : "♡"}
                      </button>
                      <div className="property-thumb">{property.icon}</div>
                      <div className="property-copy">
                        <button
                          className="property-open"
                          onClick={() => openPropertyDetail(property)}
                        >
                          {property.name}
                        </button>
                        <small>
                          {property.location} · {property.size} ตร.ม.
                        </small>
                      </div>
                    </div>
                    <div className="property-price">
                      ฿ {property.price.toFixed(2)} ล.
                      <small>
                        ฿{" "}
                        {money(
                          Math.round(
                            (property.price * 1000000) / property.size,
                          ),
                        )}{" "}
                        / ตร.ม.
                      </small>
                    </div>
                    <div className="yield-value">
                      {property.rent
                        ? `${(((property.rent * 12) / (property.price * 1000000)) * 100).toFixed(1)}%`
                        : "—"}
                      <small>
                        {property.rent
                          ? "ค่าเช่าต่อเดือน"
                          : "ไม่มีข้อมูลค่าเช่า"}
                      </small>
                    </div>
                    <span
                      className={`risk-badge ${property.risk === "ต่ำ" ? "" : property.risk === "สูง" ? "high" : property.risk === "ไม่ระบุ" ? "unknown" : "medium"}`}
                    >
                      {property.risk}
                    </span>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  {active === "รายการที่บันทึก"
                    ? "ยังไม่มีรายการบันทึก ใช้ปุ่ม ♡ บันทึก ที่รายการทรัพย์สินเพื่อเก็บไว้ดูภายหลัง"
                    : "ไม่พบรายการที่ตรงกับคำค้น ลองปรับตัวกรองอีกครั้ง"}
                </div>
              )}
              {filtered.length > listingsPerPage && (
                <nav
                  className="listing-pagination"
                  aria-label="หน้ารายการทรัพย์สิน"
                >
                  <span>
                    แสดง {(listingPage - 1) * listingsPerPage + 1}–
                    {Math.min(listingPage * listingsPerPage, filtered.length)}{" "}
                    จาก {filtered.length}
                  </span>
                  <div>
                    <button
                      aria-label="หน้าก่อนหน้า"
                      disabled={listingPage <= 1}
                      onClick={() => goToListingPage(listingPage - 1)}
                    >
                      ← ก่อนหน้า
                    </button>
                    <span>
                      {listingPage} / {pageCount}
                    </span>
                    <button
                      aria-label="หน้าถัดไป"
                      disabled={listingPage >= pageCount}
                      onClick={() => goToListingPage(listingPage + 1)}
                    >
                      ถัดไป →
                    </button>
                  </div>
                </nav>
              )}
            </section>
            <section className="panel yield-panel">
              <div className="panel-heading">
                <div>
                  <h2>ย่านผลตอบแทนเด่น</h2>
                  <p>Gross rental yield จากข้อมูลในชุดปัจจุบัน</p>
                </div>
                <button
                  className="text-link"
                  aria-label="ข้อมูล Gross yield"
                  onClick={() =>
                    showNotice(
                      "Gross yield = ค่าเช่าต่อปี ÷ ราคาเสนอขาย คำนวณรวมจากรายการในแต่ละย่าน",
                    )
                  }
                >
                  ⓘ
                </button>
              </div>
              <div className="yield-intro">
                จัดอันดับจากย่านที่มีรายการในชุดข้อมูล
              </div>
              {yieldByDistrict.length ? (
                yieldByDistrict.map(
                  ({ district, listingCount, rentCount, grossYield }) => (
                    <div className="yield-card" key={district}>
                      <div>
                        {district}
                        <small>
                          {listingCount} รายการ · มีค่าเช่า {rentCount} รายการ
                        </small>
                      </div>
                      <strong>
                        {grossYield === null
                          ? "—"
                          : `${grossYield.toFixed(2)}%`}
                        <small>
                          {grossYield === null
                            ? "ข้อมูลค่าเช่าไม่พอ"
                            : "Gross yield รวม"}
                        </small>
                      </strong>
                    </div>
                  ),
                )
              ) : (
                <div className="yield-intro">ยังไม่มีรายการสำหรับคำนวณ</div>
              )}
              <div className="disclaimer">
                คำนวณจากค่าเช่าและราคาเสนอขายที่ระบุในรายการ
                ไม่ใช่ผลตอบแทนที่รับประกัน
              </div>
            </section>
          </div>
          <footer className="footer">
            <span>บ้านคิด · Bangkok Property Intelligence</span>
            <span>
              ต้นแบบเพื่อการศึกษา · ข้อมูลสมมติ ไม่ใช่ราคาประกาศหรือคำแนะนำการลงทุน
            </span>
          </footer>
        </div>
      </main>
      {selectedProperty && createPortal(
        <div
          className={detailStyles.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedProperty(null);
          }}
        >
          <section
            className={detailStyles.dialog}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            tabIndex={-1}
          >
            <header className={detailStyles.header}>
              <div>
                <span className={detailStyles.eyebrow}>
                  PROPERTY INTELLIGENCE
                </span>
                <h2 id="detail-title">{selectedProperty.name}</h2>
                <p>
                  {selectedProperty.location} · {selectedProperty.type} ·{" "}
                  {selectedProperty.size} ตร.ม.
                </p>
              </div>
              <div className={detailStyles.headerActions}>
                {selectedProperty.isImported && (
                  <button
                    className={detailStyles.deleteImportButton}
                    onClick={() => removeImportedProperty(selectedProperty)}
                  >
                    ลบรายการนำเข้า
                  </button>
                )}
                <button
                  className={detailStyles.close}
                  aria-label="ปิดรายละเอียด"
                  onClick={() => setSelectedProperty(null)}
                >
                  ×
                </button>
              </div>
            </header>
            <div className={detailStyles.scroll}>
              <div className={detailStyles.metrics}>
                <div>
                  <small>ราคาเสนอขาย</small>
                  <strong>฿ {selectedProperty.price.toFixed(2)} ล.</strong>
                </div>
                <div>
                  <small>ค่าเช่าต่อเดือน</small>
                  <strong>฿ {money(selectedProperty.rent)}</strong>
                </div>
                <div>
                  <small>Gross yield</small>
                  <strong>
                    {(
                      ((selectedProperty.rent * 12) /
                        (selectedProperty.price * 1000000)) *
                      100
                    ).toFixed(2)}
                    %
                  </strong>
                </div>
              </div>
              <button
                className={detailStyles.saveButton}
                aria-label={
                  favorites.includes(selectedProperty.name)
                    ? "นำออกจากรายการที่บันทึก"
                    : "เพิ่มในรายการที่บันทึก"
                }
                title={
                  favorites.includes(selectedProperty.name)
                    ? "นำออกจากรายการที่บันทึก"
                    : "เพิ่มในรายการที่บันทึก"
                }
                aria-pressed={favorites.includes(selectedProperty.name)}
                onClick={() => toggleFavorite(selectedProperty)}
              >
                {favorites.includes(selectedProperty.name) ? "♥" : "♡"}
              </button>
              <button
                className={compareStyles.addButton}
                onClick={() => toggleCompare(selectedProperty)}
              >
                {compareNames.includes(selectedProperty.name)
                  ? "✓ นำออกจากรายการเปรียบเทียบ"
                  : "+ เพิ่มรายการนี้เพื่อเปรียบเทียบ"}
              </button>
              <section className={detailStyles.section}>
                <div className={detailStyles.sectionTitle}>
                  <div>
                    <h3>เครื่องคำนวณผลตอบแทน</h3>
                    <p>ปรับสมมติฐานเพื่อดูรายได้สุทธิโดยประมาณ</p>
                  </div>
                </div>
                <label className={detailStyles.control}>
                  <span>เดือนที่มีผู้เช่าต่อปี</span>
                  <div>
                    <input
                      type="range"
                      min="6"
                      max="12"
                      value={occupiedMonths}
                      onChange={(event) =>
                        setOccupiedMonths(Number(event.target.value))
                      }
                    />
                    <b>{occupiedMonths} เดือน</b>
                  </div>
                </label>
                <label className={detailStyles.control}>
                  <span>ค่าใช้จ่ายต่อเดือน</span>
                  <div className={detailStyles.costInput}>
                    <span>฿</span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={monthlyCosts}
                      onChange={(event) =>
                        setMonthlyCosts(Math.max(0, Number(event.target.value)))
                      }
                    />
                  </div>
                </label>
                <div className={detailStyles.result}>
                  <span>
                    ผลตอบแทนสุทธิโดยประมาณ
                    <small>หลังหักช่วงว่างเช่าและค่าใช้จ่ายที่กรอก</small>
                  </span>
                  <strong>
                    {(
                      ((selectedProperty.rent * occupiedMonths -
                        monthlyCosts * 12) /
                        (selectedProperty.price * 1000000)) *
                      100
                    ).toFixed(2)}
                    %
                  </strong>
                </div>
                <p className={detailStyles.footnote}>
                  ยังไม่รวมดอกเบี้ย เงินต้น ภาษี ค่าส่วนกลาง
                  และค่าใช้จ่ายการซื้อขาย
                  ผลลัพธ์เป็นการคำนวณเบื้องต้นจากราคาและค่าเช่าที่แสดง
                </p>
              </section>
              <section className={detailStyles.section}>
                <div className={detailStyles.sectionTitle}>
                  <div>
                    <h3>ข้อมูลประกอบการตัดสินใจ</h3>
                    <p>แสดงข้อเท็จจริงและข้อจำกัดของชุดข้อมูล</p>
                  </div>
                </div>
                <div className={detailStyles.facts}>
                  <div>
                    <span>พื้นที่ใช้สอย</span>
                    <b>{selectedProperty.size} ตร.ม.</b>
                  </div>
                  <div>
                    <span>ราคาเสนอขาย / ตร.ม.</span>
                    <b>
                      ฿{" "}
                      {money(
                        Math.round(
                          (selectedProperty.price * 1000000) /
                            selectedProperty.size,
                        ),
                      )}
                    </b>
                  </div>
                  <div>
                    <span>ความเสี่ยงน้ำท่วม</span>
                    <b
                      className={
                        selectedProperty.risk === "ต่ำ"
                          ? detailStyles.factLow
                          : selectedProperty.risk === "สูง"
                            ? detailStyles.factHigh
                            : detailStyles.factMedium
                      }
                    >
                      {selectedProperty.risk} ·{" "}
                      {selectedProperty.isImported
                        ? "นำเข้า"
                        : "ตัวอย่างสมมติ"}
                    </b>
                  </div>
                  <div>
                    <span>การเดินทาง</span>
                    <b>
                      {selectedProperty.location.split("·")[1]?.trim() ??
                        "ข้อมูลไม่ระบุ"}
                    </b>
                  </div>
                  {selectedProperty.latitude !== undefined &&
                    selectedProperty.longitude !== undefined && (
                      <div>
                        <span>พิกัด</span>
                        <b>
                          {selectedProperty.latitude.toFixed(5)},{" "}
                          {selectedProperty.longitude.toFixed(5)}
                        </b>
                      </div>
                    )}
                </div>
                <div className={detailStyles.sourceNote}>
                  {selectedProperty.isImported ? (
                    <>
                      แหล่งข้อมูล:{" "}
                      {selectedProperty.source ||
                        (selectedProperty.isImported
                          ? "นำเข้าจาก CSV"
                          : "ไม่ระบุ")}
                      {selectedProperty.sourceUrl && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            className={detailStyles.sourceLink}
                            href={selectedProperty.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            เปิดต้นทาง ↗
                          </a>
                        </>
                      )}
                      {selectedProperty.observedAt
                        ? ` · วันที่สังเกต ${selectedProperty.observedAt}`
                        : " · ไม่ระบุวันที่สังเกต"}{" "}
                      {selectedProperty.isImported
                        ? "ไฟล์ถูกเก็บไว้ในเบราว์เซอร์นี้"
                        : "ข้อมูลสมมติเพื่อการศึกษา"}
                    </>
                  ) : (
                    "ข้อมูลทรัพย์สินและความเสี่ยงในต้นแบบเป็นข้อมูลจำลอง ยังไม่ได้เชื่อมแหล่งประกาศหรือข้อมูลหน่วยงาน"
                  )}
                </div>
              </section>
              <section
                className={detailStyles.section}
                aria-labelledby="similar-properties-title"
              >
                <div className={detailStyles.sectionTitle}>
                  <div>
                    <h3 id="similar-properties-title">ทรัพย์สินเปรียบเทียบ</h3>
                    <p>
                      เรียงตามประเภท ทำเล และราคาต่อตารางเมตร ·
                      ใช้ประกอบการดูข้อมูลเท่านั้น
                    </p>
                  </div>
                </div>
                {similarProperties.length ? (
                  <div className={detailStyles.similarList}>
                    {similarProperties.map(({ property, unitPrice, delta }) => (
                      <article
                        className={detailStyles.similarCard}
                        key={property.name}
                      >
                        <div className={detailStyles.similarMain}>
                          <div className={detailStyles.similarName}>
                            <strong>{property.name}</strong>
                            <small>
                              {property.location} · {property.type} ·{" "}
                              {property.size} ตร.ม.
                            </small>
                          </div>
                          <div className={detailStyles.similarPrice}>
                            ฿ {money(Math.round(unitPrice))}
                            <small>ต่อ ตร.ม.</small>
                          </div>
                        </div>
                        <div className={detailStyles.similarFoot}>
                          <span className={detailStyles.similarDelta}>
                            {delta >= 0 ? "สูงกว่า" : "ต่ำกว่า"}{" "}
                            {Math.abs(delta).toFixed(1)}% ต่อ ตร.ม.
                          </span>
                        <button onClick={() => openPropertyDetail(property)}>
                            ดูรายละเอียด →
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className={detailStyles.similarEmpty}>
                    ยังไม่มีรายการอื่นในชุดข้อมูลให้เปรียบเทียบ
                  </p>
                )}
                <p className={detailStyles.footnote}>
                  รายการเหล่านี้ใช้เปรียบเทียบในชุดข้อมูลปัจจุบัน
                  ไม่ใช่ราคาประเมินหรือธุรกรรมที่ยืนยันแล้ว
                </p>
              </section>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {showInvestment && createPortal(
        <div
          className={investmentStyles.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowInvestment(false);
          }}
        >
          <section
            className={investmentStyles.dialog}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="investment-title"
            tabIndex={-1}
          >
            <header className={investmentStyles.header}>
              <div>
                <span>INVESTMENT LAB</span>
                <h2 id="investment-title">ซื้อหรือเช่าดีกว่า?</h2>
                <p>
                  ปรับสมมติฐานเพื่อเปรียบเทียบมูลค่าสุทธิเมื่อครบระยะเวลากู้
                </p>
              </div>
              <button
                className={investmentStyles.close}
                aria-label="ปิดเครื่องมือซื้อเทียบเช่า"
                onClick={() => setShowInvestment(false)}
              >
                ×
              </button>
            </header>
            <div className={investmentStyles.body}>
              <section className={investmentStyles.inputs}>
                <h3>สมมติฐาน</h3>
                <p>ตัวเลขเริ่มต้นเป็นตัวอย่าง ปรับให้ตรงกับแผนของคุณ</p>
                <div className={investmentStyles.fieldGrid}>
                  <label>
                    ราคาบ้าน (บาท)
                    <input
                      type="number"
                      min="100000"
                      step="100000"
                      value={homePrice}
                      onChange={(event) =>
                        setHomePrice(
                          Math.max(100000, Number(event.target.value)),
                        )
                      }
                    />
                  </label>
                  <label>
                    ค่าเช่าต่อเดือน (บาท)
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={monthlyRent}
                      onChange={(event) =>
                        setMonthlyRent(Math.max(0, Number(event.target.value)))
                      }
                    />
                  </label>
                  <label>
                    เงินดาวน์ ({downPaymentPercent}%)
                    <input
                      type="range"
                      min="5"
                      max="80"
                      value={downPaymentPercent}
                      onChange={(event) =>
                        setDownPaymentPercent(Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    ดอกเบี้ยต่อปี ({interestPercent}%)
                    <input
                      type="range"
                      min="0"
                      max="12"
                      step="0.1"
                      value={interestPercent}
                      onChange={(event) =>
                        setInterestPercent(Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    ระยะเวลากู้
                    <select
                      value={loanTermYears}
                      onChange={(event) =>
                        setLoanTermYears(Number(event.target.value))
                      }
                    >
                      <option value="15">15 ปี</option>
                      <option value="20">20 ปี</option>
                      <option value="25">25 ปี</option>
                      <option value="30">30 ปี</option>
                    </select>
                  </label>
                  <label>
                    ราคาบ้านเติบโตต่อปี ({propertyGrowthPercent}%)
                    <input
                      type="range"
                      min="-2"
                      max="8"
                      step="0.1"
                      value={propertyGrowthPercent}
                      onChange={(event) =>
                        setPropertyGrowthPercent(Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    ผลตอบแทนเงินลงทุนต่อปี ({investmentReturnPercent}%)
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.1"
                      value={investmentReturnPercent}
                      onChange={(event) =>
                        setInvestmentReturnPercent(Number(event.target.value))
                      }
                    />
                  </label>
                </div>
                <div className={investmentStyles.assumptionNote}>
                  สมมติค่าใช้จ่ายดูแลบ้าน 1% ของราคาต่อปี และค่าซื้อเริ่มต้น 2%
                  ผู้เช่านำเงินก้อนเทียบเท่าเงินดาวน์และค่าใช้จ่ายไปลงทุน
                  รวมทั้งลงทุนเงินส่วนต่างรายเดือน
                </div>
              </section>
              <section className={investmentStyles.results}>
                <div className={investmentStyles.resultHeading}>
                  <div>
                    <h3>มูลค่าสุทธิหลัง {loanTermYears} ปี</h3>
                    <p>
                      ค่างวดประมาณ ฿{" "}
                      {money(Math.round(investment.mortgagePayment))} / เดือน
                    </p>
                  </div>
                  <span
                    className={
                      investment.buyerNetWorth >= investment.renterNetWorth
                        ? investmentStyles.buyTag
                        : investmentStyles.rentTag
                    }
                  >
                    {investment.buyerNetWorth >= investment.renterNetWorth
                      ? "ซื้อได้เปรียบ"
                      : "เช่าได้เปรียบ"}
                  </span>
                </div>
                <div className={investmentStyles.resultCards}>
                  <article>
                    <span>ซื้อ · มูลค่าทรัพย์สินสุทธิ</span>
                    <strong>
                      ฿ {money(Math.round(investment.buyerNetWorth))}
                    </strong>
                    <small>
                      บ้านมูลค่า ฿{" "}
                      {money(Math.round(investment.futureHomeValue))}{" "}
                      หลังหักหนี้คงเหลือ
                    </small>
                  </article>
                  <article>
                    <span>เช่า · เงินลงทุนสะสม</span>
                    <strong>
                      ฿ {money(Math.round(investment.renterNetWorth))}
                    </strong>
                    <small>
                      รวมเงินก้อนเริ่มต้น ฿{" "}
                      {money(Math.round(investment.buyerCashAtStart))}
                    </small>
                  </article>
                </div>
                <div className={investmentStyles.monthlyRow}>
                  <span>ค่าใช้จ่ายรายเดือนโดยประมาณ</span>
                  <b>ซื้อ ฿ {money(Math.round(investment.monthlyOwnerCost))}</b>
                  <b>เช่า ฿ {money(investment.monthlyRent)}</b>
                </div>
                <p className={investmentStyles.disclaimer}>
                  เป็นการจำลองเพื่อช่วยวางแผน ไม่ใช่คำแนะนำการลงทุน
                  ผลยังไม่รวมภาษี ค่าธรรมเนียมขาย ค่าซ่อมใหญ่ ประกัน
                  การปรับขึ้นค่าเช่า และความผันผวนของผลตอบแทน
                  ผลลัพธ์ขึ้นกับสมมติฐานที่กรอก
                </p>
              </section>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {compareNames.length > 0 && (
        <div className={compareStyles.toolbar}>
          <div>
            <strong>เปรียบเทียบ {compareNames.length}/5</strong>
            <span>
              {compareNames.length < 2
                ? " เลือกเพิ่มอีกอย่างน้อย 1 รายการ"
                : " รายการพร้อมเทียบ"}
            </span>
          </div>
          <button
            className={compareStyles.clearButton}
            onClick={() => setCompareNames([])}
          >
            ล้าง
          </button>
          <button
            className={compareStyles.openButton}
            disabled={compareNames.length < 2}
            onClick={openCompareDialog}
          >
            เทียบรายการ　→
          </button>
        </div>
      )}
      {showCompare && createPortal(
        <div
          className={compareStyles.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowCompare(false);
          }}
        >
          <section
            className={compareStyles.dialog}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="compare-title"
            tabIndex={-1}
          >
            <header className={compareStyles.header}>
              <div>
                <span>PROPERTY COMPARISON</span>
                <h2 id="compare-title">เปรียบเทียบทรัพย์สิน</h2>
                <p>
                  ดูข้อมูลสำคัญของ {comparedProperties.length}{" "}
                  รายการในตารางเดียว
                </p>
              </div>
              <button
                className={compareStyles.close}
                aria-label="ปิดตารางเปรียบเทียบ"
                onClick={() => setShowCompare(false)}
              >
                ×
              </button>
            </header>
            <div className={compareStyles.tableWrap}>
              <table className={compareStyles.table}>
                <thead>
                  <tr>
                    <th>ข้อมูล</th>
                    {comparedProperties.map((property) => (
                      <th key={property.name}>
                        <div className={compareStyles.propertyHead}>
                          <span>
                            {property.icon} {property.name}
                          </span>
                          <button
                            aria-label={`นำ ${property.name} ออกจากรายการ`}
                            onClick={() => toggleCompare(property)}
                          >
                            ×
                          </button>
                        </div>
                        <small>{property.location}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      {comparedProperties.map((property) => (
                        <td key={property.name}>{row.value(property)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className={compareStyles.footer}>
              <span>
                ใช้ประกอบการเปรียบเทียบเท่านั้น ·
                ข้อมูลตัวอย่างระบุไว้ในแต่ละรายการ
              </span>
              <button onClick={exportComparisonCsv}>ส่งออก CSV</button>
              <button onClick={() => setShowCompare(false)}>ปิด</button>
            </footer>
          </section>
        </div>,
        document.body,
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
