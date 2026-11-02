import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseCsv, parseRows } from "./import-properties.mjs";

const header =
  "name,district,type,price_thb,monthly_rent_thb,area_sqm,transit,flood_risk,latitude,longitude,source,source_url,observed_at";
const validRow =
  'ทรัพย์ทดสอบ,บางรัก,คอนโด,"3,200,000",15000,35,"ใกล้ BTS, ทางออก 2",low,13.7,100.5,ตัวอย่าง,https://example.com/listing,2026-11-02';

test("sample dataset is fictional and covers 50 districts without real coordinates", async () => {
  const contents = await readFile(
    new URL("../public/property-import-sample.csv", import.meta.url),
    "utf8",
  );
  const rows = parseRows(contents);

  assert.equal(rows.length, 50);
  assert.equal(new Set(rows.map((row) => row.district)).size, 50);
  assert.ok(rows.every((row) => row.title.includes("(สมมติ)")));
  assert.ok(rows.every((row) => row.source_name.includes("ข้อมูลสมมติ")));
  assert.ok(rows.every((row) => row.latitude === null && row.longitude === null));
  assert.ok(rows.every((row) => row.source_url === null && row.observed_at === null));
});

test("parses quoted commas, escaped quotes, and embedded newlines", () => {
  const records = parseCsv('name,notes\r\n"Condo, A","near ""station""\nsecond line"\r\n');
  assert.deepEqual(records, [
    { line: 1, cells: ["name", "notes"] },
    { line: 2, cells: ["Condo, A", 'near "station"\nsecond line'] },
  ]);
});

test("normalizes valid rows to the import RPC shape", () => {
  const [row] = parseRows(`\uFEFF${header}\n${validRow}\n`);
  assert.deepEqual(row, {
    title: "ทรัพย์ทดสอบ",
    district: "บางรัก",
    property_type: "condo",
    usable_area_sqm: 35,
    sale_price_thb: 3_200_000,
    rent_price_thb: 15_000,
    transit_description: "ใกล้ BTS, ทางออก 2",
    flood_risk_level: "low",
    latitude: 13.7,
    longitude: 100.5,
    source_name: "ตัวอย่าง",
    source_url: "https://example.com/listing",
    observed_at: "2026-11-02",
  });
});

test("allows blank optional values and maps dormitory and unknown risk", () => {
  const [row] = parseRows(
    `${header}\nหอพัก,ดุสิต,หอพัก,2200000,,28,,,,,,,`,
  );
  assert.equal(row.property_type, "dormitory");
  assert.equal(row.rent_price_thb, null);
  assert.equal(row.flood_risk_level, "unknown");
  assert.equal(row.latitude, null);
  assert.equal(row.longitude, null);
  assert.equal(row.observed_at, null);
});

test("rejects missing and duplicate headers", () => {
  assert.throws(() => parseRows("name,district\nA,B"), /Missing required columns/);
  assert.throws(() => parseRows(`${header},name\n${validRow},duplicate`), /duplicate column/);
});

test("rejects malformed quoting and mismatched row widths", () => {
  assert.throws(() => parseCsv('name,notes\n"unfinished'), /unclosed quoted field/);
  assert.throws(() => parseCsv('name,notes\n"quoted"x,value'), /unexpected character/);
  assert.throws(() => parseCsv('name,notes\nun"quoted,value'), /malformed quoted field/);
  assert.throws(() => parseRows(`${header}\n${validRow},extra`), /expected 13 columns but found 14/);
});

test("rejects invalid values that could break an import batch", () => {
  const cases = [
    [validRow.replace(",13.7,100.5,", ",,100.5,"), /invalid/],
    [validRow.replace(",13.7,100.5,", ",91,100.5,"), /invalid/],
    [validRow.replace(',"3,200,000",', ",-1,"), /invalid/],
    [validRow.replace(",คอนโด,", ",บ้าน,"), /invalid/],
    [validRow.replace(",low,", ",low,").replace(",2026-11-02", ",2026-02-30"), /valid date/],
    [validRow.replace("https://example.com/listing", "javascript:alert(1)"), /HTTP or HTTPS/],
  ];
  for (const [row, message] of cases)
    assert.throws(() => parseRows(`${header}\n${row}`), message);
});

test("rejects batches over the database limit", () => {
  const rows = Array.from({ length: 501 }, () => validRow).join("\n");
  assert.throws(() => parseRows(`${header}\n${rows}`), /limited to 500 rows/);
});
