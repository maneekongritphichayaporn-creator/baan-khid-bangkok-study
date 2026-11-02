#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

async function loadLocalEnv() {
  try {
    const contents = await readFile(resolve(".env.local"), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = /^\s*([\w.-]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match || match[1].startsWith("#") || process.env[match[1]]) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export function parseCsv(text) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  let line = 1;
  let recordLine = 1;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
        afterQuote = true;
      } else {
        field += char;
        if (char === "\n") line += 1;
      }
      continue;
    }

    if (afterQuote && char !== "," && char !== "\r" && char !== "\n" && char !== " " && char !== "\t") {
      throw new Error(`Line ${line}: unexpected character after a quoted field.`);
    }
    if (char === ",") {
      record.push(field.trim());
      field = "";
      afterQuote = false;
    } else if (char === "\n" || char === "\r") {
      record.push(field.trim());
      field = "";
      if (record.some((cell) => cell.length > 0))
        records.push({ line: recordLine, cells: record });
      record = [];
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      line += 1;
      recordLine = line;
      afterQuote = false;
    } else if (char === '"' && field.length === 0 && !afterQuote) {
      quoted = true;
    } else if (char === '"' || afterQuote) {
      if (char !== " " && char !== "\t") {
        throw new Error(`Line ${line}: malformed quoted field.`);
      }
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  record.push(field.trim());
  if (record.some((cell) => cell.length > 0))
    records.push({ line: recordLine, cells: record });
  return records;
}

function parseDate(value, rowLine) {
  if (!value) return null;
  let year;
  let month;
  let day;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const dayFirst = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (dayFirst) {
    day = Number(dayFirst[1]);
    month = Number(dayFirst[2]);
    year = Number(dayFirst[3]);
  } else {
    throw new Error(`Line ${rowLine}: observed_at must use YYYY-MM-DD or DD/MM/YYYY.`);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Line ${rowLine}: observed_at is not a valid date.`);
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseNumber(value, column, rowLine, { optional = false } = {}) {
  if (optional && !value) return null;
  const parsed = Number(value.replace(/[฿,\s]/g, ""));
  if (!Number.isFinite(parsed))
    throw new Error(`Line ${rowLine}: ${column} must be a number.`);
  return parsed;
}

export function parseRows(text) {
  const records = parseCsv(text.replace(/^\uFEFF/, ""));
  const [headerRecord, ...dataRecords] = records;
  if (!headerRecord) throw new Error("CSV has no header row.");
  const headers = headerRecord.cells.map((header) => header.trim().toLowerCase());
  if (new Set(headers).size !== headers.length)
    throw new Error("CSV contains duplicate column names.");
  const index = (name) => headers.indexOf(name);
  const required = ["name", "district", "type", "price_thb", "area_sqm"];
  const missing = required.filter((name) => index(name) < 0);
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}.`);
  if (dataRecords.length > 500) throw new Error("Import is limited to 500 rows per batch.");

  const rows = dataRecords.map(({ line, cells }) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `Line ${line}: expected ${headers.length} columns but found ${cells.length}.`,
      );
    }
    const cell = (name) => {
      const column = index(name);
      return column < 0 ? "" : (cells[column] ?? "").trim();
    };
    const title = cell("name");
    const district = cell("district");
    const rawType = cell("type").toLowerCase();
    const propertyType =
      rawType.includes("หอพัก") || rawType.includes("dorm") || rawType.includes("hostel")
        ? "dormitory"
        : rawType.includes("คอนโด") || rawType.includes("condo")
          ? "condo"
          : null;
    const latitudeText = cell("latitude");
    const longitudeText = cell("longitude");
    const hasCoordinates = latitudeText !== "" || longitudeText !== "";
    const latitude = hasCoordinates ? parseNumber(latitudeText, "latitude", line) : null;
    const longitude = hasCoordinates ? parseNumber(longitudeText, "longitude", line) : null;
    const salePrice = parseNumber(cell("price_thb"), "price_thb", line);
    const area = parseNumber(cell("area_sqm"), "area_sqm", line);
    const rentPrice = parseNumber(
      cell("monthly_rent_thb") || cell("rent_thb"),
      "monthly_rent_thb",
      line,
      { optional: true },
    );
    const rawRisk = cell("flood_risk").toLowerCase();
    const risk =
      rawRisk === "low" || rawRisk === "ต่ำ"
        ? "low"
        : rawRisk === "moderate" ||
            rawRisk === "medium" ||
            rawRisk === "watch" ||
            rawRisk === "เฝ้าระวัง"
          ? "moderate"
          : rawRisk === "high" || rawRisk === "สูง"
            ? "high"
            : "unknown";
    const sourceUrlText = cell("source_url");
    let sourceUrl = null;
    if (sourceUrlText) {
      try {
        const url = new URL(sourceUrlText);
        if (url.protocol !== "http:" && url.protocol !== "https:")
          throw new Error("unsupported protocol");
        sourceUrl = url.toString();
      } catch {
        throw new Error(`Line ${line}: source_url must be a valid HTTP or HTTPS URL.`);
      }
    }
    const sourceName = cell("source") || "นำเข้าจาก CSV";
    const transit = cell("transit");
    const date = parseDate(cell("observed_at"), line);
    const invalid =
      !title ||
      title.length > 255 ||
      !district ||
      district.length > 120 ||
      !propertyType ||
      salePrice <= 0 ||
      salePrice > 9_999_999_999_999.99 ||
      area <= 0 ||
      area > 9_999_999_999.99 ||
      (rentPrice !== null &&
        (rentPrice <= 0 || rentPrice > 9_999_999_999_999.99)) ||
      (hasCoordinates &&
        (latitudeText === "" ||
          longitudeText === "" ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180)) ||
      transit.length > 500 ||
      sourceName.length > 255 ||
      sourceUrlText.length > 2048;
    if (invalid) throw new Error(`Line ${line}: one or more property fields are invalid.`);

    return {
      title,
      district,
      property_type: propertyType,
      usable_area_sqm: area,
      sale_price_thb: salePrice,
      rent_price_thb: rentPrice,
      transit_description: transit || null,
      flood_risk_level: risk,
      latitude,
      longitude,
      source_name: sourceName,
      source_url: sourceUrl,
      observed_at: date,
    };
  });

  if (rows.length === 0) throw new Error("CSV contains no property rows.");
  return rows;
}

async function main() {
  const [mode, fileName] = process.argv.slice(2);
  if (!fileName || !["--dry-run", "--confirm-import"].includes(mode)) {
    throw new Error(
      "Usage: npm run import:properties -- --dry-run <path-to-csv>\n   or: npm run import:properties -- --confirm-import <path-to-csv>",
    );
  }
  if (!fileName) throw new Error("Provide a CSV file path.");
  const csv = await readFile(resolve(fileName), "utf8");
  const rows = parseRows(csv);
  if (mode === "--dry-run") {
    const districts = new Set(rows.map((row) => row.district));
    const rentRows = rows.filter((row) => row.rent_price_thb !== null).length;
    const coordinateRows = rows.filter((row) => row.latitude !== null).length;
    console.log(
      [
        `CSV is valid: ${rows.length} rows parsed.`,
        `${districts.size} districts, ${rentRows} with rent, ${coordinateRows} with coordinates.`,
        "Nothing was sent to Supabase.",
      ].join("\n"),
    );
    return;
  }

  await loadLocalEnv();
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    throw new Error("Set the Supabase URL and server-only secret key in .env.local.");
  let projectUrl;
  try {
    projectUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("The Supabase URL in .env.local is invalid.");
  }
  if (
    projectUrl.protocol !== "https:" &&
    !(projectUrl.protocol === "http:" && projectUrl.hostname === "localhost")
  )
    throw new Error("The Supabase URL must use HTTPS.");
  console.log(
    `Importing ${rows.length} rows to ${projectUrl.host}. New listings will remain unpublished.`,
  );

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.rpc("import_property_batch", {
    p_file_name: fileName.split(/[\\/]/).pop().slice(0, 255),
    p_rows: rows,
  });
  if (error) throw new Error(`Supabase import failed: ${error.message}`);
  const result = data;
  console.log(
    `Imported batch ${result.batch_id}: ${result.rows_imported} rows saved, ${result.rows_skipped} duplicates skipped. Published: ${result.published}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
