import fs from "node:fs/promises";
import path from "node:path";

const BRANCH_SITEMAP_URL = "https://myaeoncredit.com.my/branch-sitemap.xml";
const BRANCH_API_URL = "https://myaeoncredit.com.my/wp-json/wp/v2/branch?per_page=100&page=1&_embed=1";
const OUTPUT_CSV_PATH = path.resolve(process.cwd(), "data", "aeon_branches_template.csv");
const REQUEST_HEADERS = {
  "user-agent": "sqr-local-branch-import/1.0 (manual data preparation)",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};
const NOMINATIM_HEADERS = {
  "user-agent": "sqr-local-branch-import/1.0 (manual data preparation)",
  accept: "application/json",
  "accept-language": "en",
};
const NOMINATIM_MIN_DELAY_MS = 1200;
const COORDINATE_OVERRIDES = {
  Bintulu: { lat: "3.1980492", lng: "113.0567444" },
  "IOI City Mall": { lat: "2.9758172", lng: "101.7035471" },
};

const FEATURE_LABELS = [
  "ATM & CDM",
  "Inquiry Availability",
  "Application Availability",
  "AEON Lounge",
];

const STATE_ALIASES = {
  Johor: ["Johor"],
  Kedah: ["Kedah"],
  Kelantan: ["Kelantan"],
  Melaka: ["Melaka", "Malacca"],
  "Negeri Sembilan": ["Negeri Sembilan"],
  Pahang: ["Pahang"],
  "Pulau Pinang": ["Pulau Pinang", "Penang"],
  Perak: ["Perak"],
  Perlis: ["Perlis"],
  Sabah: ["Sabah"],
  Sarawak: ["Sarawak"],
  Selangor: ["Selangor"],
  Terengganu: ["Terengganu"],
  "Kuala Lumpur": ["Kuala Lumpur", "Wilayah Persekutuan Kuala Lumpur"],
  Labuan: ["Labuan", "Wilayah Persekutuan Labuan"],
  Putrajaya: ["Putrajaya", "Wilayah Persekutuan Putrajaya"],
};
const STATE_LABELS = Object.entries(STATE_ALIASES).flatMap(([canonical, aliases]) => [
  canonical,
  ...aliases,
]);
const LOCATION_STOPWORDS = new Set([
  "aeon",
  "credit",
  "branch",
  "flagship",
  "service",
  "centre",
  "center",
  "shopping",
  "mall",
  "floor",
  "ground",
  "first",
  "second",
  "third",
  "lot",
  "jalan",
  "no",
  "block",
  "unit",
  "level",
  "building",
  "bangunan",
  "floor",
]);
const geocodeResponseCache = new Map();
let lastNominatimRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, headers = REQUEST_HEADERS) {
  const response = await fetch(url, { headers, redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function fetchJson(url, headers = REQUEST_HEADERS) {
  const response = await fetch(url, { headers, redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#039;/gi, "'")
    .replace(/&#8211;/gi, "-")
    .replace(/&#8217;/gi, "'")
    .replace(/&#038;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractBranchUrls(xml) {
  return Array.from(
    new Set(
      [...String(xml || "").matchAll(/<loc>(https:\/\/myaeoncredit\.com\.my\/branch\/[^<]+)<\/loc>/g)].map(
        (match) => match[1],
      ),
    ),
  );
}

function normalizeStateName(value) {
  const lowered = String(value || "").trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(STATE_ALIASES)) {
    if ([canonical, ...aliases].some((item) => item.toLowerCase() === lowered)) {
      return canonical;
    }
  }
  return String(value || "").trim();
}

function getStateVariants(state) {
  const canonical = normalizeStateName(state);
  const aliases = STATE_ALIASES[canonical] || [canonical];
  return Array.from(new Set([canonical, ...aliases].filter(Boolean)));
}

function matchOne(text, pattern) {
  const match = String(text || "").match(pattern);
  return match?.[1] ? stripTags(match[1]) : "";
}

function extractFeatureLabels(html) {
  const normalizedHtml = decodeHtml(String(html || ""));
  const features = new Set();
  for (const label of FEATURE_LABELS) {
    if (normalizedHtml.includes(label)) {
      features.add(label);
    }
  }
  return Array.from(features);
}

function extractDirectionAddress(html) {
  const match = String(html || "").match(/href="https:\/\/www\.google\.com\/maps\?q=([^"]+)"/i);
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]).replace(/\+/g, " ").trim();
  } catch {
    return match[1].trim();
  }
}

function extractPostcode(address) {
  const match = String(address || "").match(/\b\d{5}\b/);
  return match?.[0] || "";
}

function extractState(address) {
  const lowered = String(address || "").toLowerCase();
  const matched = STATE_LABELS.find((state) => lowered.includes(state.toLowerCase()));
  return matched ? normalizeStateName(matched) : "";
}

function cleanLocationPart(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/AEON Credit\s*/gi, "")
    .replace(/\bFlagship Branch\b/gi, "")
    .replace(/\b(?:Lot|No\.?|Unit|Block)\b[\w\s\-\/&#.]*$/gi, "")
    .replace(/\b(?:Ground|First|Second|Third|Fourth|Fifth|Mezzanine|LG|UG|G|F)\s+Floor\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();
}

function extractAddressSegments(address) {
  const rawParts = String(address || "")
    .split(",")
    .map((part) => cleanLocationPart(part))
    .filter(Boolean);

  return Array.from(
    new Set(
      rawParts.filter(
        (part) =>
          !/^(?:lot|no\.?|ground floor|first floor|second floor|third floor|level|block)\b/i.test(part)
          && /[a-z]/i.test(part),
      ),
    ),
  );
}

function extractVenueCandidates(row) {
  const candidates = [];
  const segments = extractAddressSegments(row.branch_address);
  const name = cleanLocationPart(row.name);

  if (name) {
    candidates.push(name);
    if (!/^AEON\b/i.test(name)) {
      candidates.push(`AEON ${name}`);
    }
  }

  for (const segment of segments) {
    if (/(aeon|mall|shopping centre|service centre|square|business centre|plaza|exchange|greentown|station|kubota|assyakirin)/i.test(segment)) {
      candidates.push(segment);
    }
  }

  return Array.from(new Set(candidates.map((value) => value.trim()).filter(Boolean)));
}

function extractTokenCandidates(row) {
  const source = [row.name, row.branch_address, row.state]
    .map((value) => cleanLocationPart(value))
    .join(" ");

  return Array.from(
    new Set(
      source
        .split(/[^A-Za-z0-9]+/)
        .map((value) => value.trim())
        .filter(
          (value) =>
            value.length >= 3
            && !LOCATION_STOPWORDS.has(value.toLowerCase())
            && !/^\d+$/.test(value),
        ),
    ),
  );
}

function buildGeocodeQueries(row) {
  const stateVariants = getStateVariants(row.state);
  const postcode = String(row.postcode || "").trim();
  const address = cleanLocationPart(String(row.branch_address || "").trim());
  const venueCandidates = extractVenueCandidates(row);
  const addressSegments = extractAddressSegments(address);
  const queries = [];

  for (const venue of venueCandidates) {
    for (const state of stateVariants) {
      queries.push([venue, postcode, state, "Malaysia"].filter(Boolean).join(" "));
    }
  }

  for (const segment of addressSegments) {
    for (const state of stateVariants) {
      queries.push([segment, postcode, state, "Malaysia"].filter(Boolean).join(" "));
    }
  }

  queries.push([address, "Malaysia"].filter(Boolean).join(" "));

  return Array.from(new Set(queries.map((value) => value.trim()).filter(Boolean))).slice(0, 6);
}

async function waitForNominatimSlot() {
  const elapsed = Date.now() - lastNominatimRequestAt;
  if (elapsed < NOMINATIM_MIN_DELAY_MS) {
    await sleep(NOMINATIM_MIN_DELAY_MS - elapsed);
  }
  lastNominatimRequestAt = Date.now();
}

async function geocodeQuery(query) {
  if (geocodeResponseCache.has(query)) {
    return geocodeResponseCache.get(query);
  }

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&countrycodes=my&q=${encodeURIComponent(query)}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForNominatimSlot();
    const response = await fetch(url, { headers: NOMINATIM_HEADERS, redirect: "follow" });
    if (response.ok) {
      const payload = await response.json();
      geocodeResponseCache.set(query, payload);
      return payload;
    }

    if (response.status === 429 && attempt < 2) {
      await sleep(NOMINATIM_MIN_DELAY_MS * (attempt + 2));
      continue;
    }

    throw new Error(`Nominatim failed: ${response.status}`);
  }

  return [];
}

function resultContainsToken(result, token) {
  const haystack = [
    result?.name,
    result?.display_name,
    ...Object.values(result?.address || {}),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(String(token || "").toLowerCase());
}

function isStateMatch(result, stateVariants) {
  const resultStateValues = Object.values(result?.address || {}).map((value) => String(value || "").toLowerCase());
  return stateVariants.some((state) => resultStateValues.includes(String(state || "").toLowerCase()));
}

function scoreGeocodeResult(result, row, query) {
  const postcode = String(row.postcode || "").trim();
  const stateVariants = getStateVariants(row.state);
  const tokens = extractTokenCandidates(row);
  const queryTokens = extractTokenCandidates({ ...row, name: query, branch_address: query });
  const resultPostcode = String(result?.address?.postcode || "").trim();
  const type = String(result?.type || "").toLowerCase();
  const category = String(result?.category || "").toLowerCase();
  let score = 0;

  if (postcode && resultPostcode === postcode) {
    score += 10;
  } else if (postcode && resultPostcode && resultPostcode !== postcode) {
    score -= 5;
  }

  if (isStateMatch(result, stateVariants)) {
    score += 6;
  }

  if (["mall", "retail", "commercial", "office", "building"].includes(type)) {
    score += 4;
  }
  if (["shop", "landuse", "building", "office", "amenity"].includes(category)) {
    score += 2;
  }
  if (["city", "town", "state", "country"].includes(type)) {
    score -= 3;
  }

  for (const token of tokens) {
    if (resultContainsToken(result, token)) {
      score += token.length >= 5 ? 2 : 1;
    }
  }

  for (const token of queryTokens) {
    if (resultContainsToken(result, token)) {
      score += 1;
    }
  }

  return score;
}

async function geocodeAddress(row) {
  let bestResult = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const query of buildGeocodeQueries(row)) {
    let results = [];
    try {
      results = await geocodeQuery(query);
    } catch {
      continue;
    }

    for (const result of Array.isArray(results) ? results : []) {
      if (!result?.lat || !result?.lon) {
        continue;
      }

      const score = scoreGeocodeResult(result, row, query);
      if (score > bestScore) {
        bestScore = score;
        bestResult = result;
      }
    }

    if (bestScore >= 14 && bestResult?.lat && bestResult?.lon) {
      break;
    }
  }

  if (!bestResult?.lat || !bestResult?.lon || bestScore < 6) {
    return { lat: "", lng: "" };
  }

  return { lat: String(bestResult.lat), lng: String(bestResult.lon) };
}

function escapeCsv(value) {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, "\"\"")}"`;
  }
  return raw;
}

function normalizeContactValue(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseBranchPage(html, entry) {
  const name =
    matchOne(html, /<h1[^>]*class="[^"]*heading-02-color[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
    || matchOne(html, /<title>([\s\S]*?) - AEON Credit Service<\/title>/i)
    || entry.title;

  const address =
    matchOne(html, /<p[^>]*class="[^"]*grey-dark text-s[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
    || extractDirectionAddress(html);

  const contactBlockHtml = String(html || "").match(/<p[^>]*>\s*Tel No:[\s\S]*?<\/p>/i)?.[0] || "";
  const contactBlock = stripTags(contactBlockHtml);
  const telMatch = contactBlock.match(/Tel No:\s*(.*?)(?:Fax No:|$)/i);
  const faxMatch = contactBlock.match(/Fax No:\s*(.+)$/i);
  const businessHour = matchOne(
    html,
    /Business Hours<\/p><p[^>]*>([\s\S]*?)<\/p>/i,
  );
  const dayOpen = matchOne(
    html,
    /Day Open<\/p><p[^>]*>([\s\S]*?)<\/p>/i,
  );
  const features = extractFeatureLabels(html);
  const directionAddress = extractDirectionAddress(html);
  const resolvedAddress = address || directionAddress;

  return {
    sourceUrl: entry.url,
    name,
    branch_address: resolvedAddress,
    phone_number: normalizeContactValue(telMatch?.[1] || ""),
    fax_number: normalizeContactValue((faxMatch?.[1] || "").replace(/^N\/A$/i, "")),
    business_hour: businessHour,
    day_open: dayOpen,
    cdm_available: features.includes("ATM & CDM") ? "Ya" : "Tidak",
    atm_cdm: features.includes("ATM & CDM") ? "ATM & CDM" : "Tiada CDM",
    inquiry_availability: features.includes("Inquiry Availability") ? "Ya" : "Tidak",
    application_availability: features.includes("Application Availability") ? "Ya" : "Tidak",
    aeon_lounge: features.includes("AEON Lounge") ? "Ya" : "Tidak",
    postcode: extractPostcode(resolvedAddress),
    state: extractState(resolvedAddress) || normalizeStateName(entry.state || ""),
  };
}

async function fetchBranchEntries() {
  try {
    const payload = await fetchJson(BRANCH_API_URL);
    if (Array.isArray(payload) && payload.length > 0) {
      return payload.map((item) => ({
        url: item?.link,
        title: stripTags(item?.title?.rendered || ""),
        state: item?._embedded?.["wp:term"]?.[0]?.[0]?.name || "",
      }));
    }
  } catch {
    // Fall back to sitemap scraping below if the REST endpoint changes.
  }

  const xml = await fetchText(BRANCH_SITEMAP_URL);
  return extractBranchUrls(xml).map((url) => ({ url, title: "", state: "" }));
}

async function main() {
  const entries = await fetchBranchEntries();
  if (entries.length === 0) {
    throw new Error("No branch URLs found from official sitemap.");
  }

  const rows = [];
  for (const [index, entry] of entries.entries()) {
    const html = await fetchText(entry.url);
    const row = parseBranchPage(html, entry);
    rows.push(row);
    process.stdout.write(`Fetched branch page ${index + 1}/${entries.length}: ${row.name || entry.url}\n`);
  }

  const geocodeCache = new Map();
  for (const [index, row] of rows.entries()) {
    const override = COORDINATE_OVERRIDES[row.name];
    if (override?.lat && override?.lng) {
      row.branch_lat = override.lat;
      row.branch_lng = override.lng;
      process.stdout.write(`Geocoded ${index + 1}/${rows.length}: ${row.name || row.branch_address} (override)\n`);
      continue;
    }

    const geocodeKey = JSON.stringify(buildGeocodeQueries(row));
    if (!geocodeKey) {
      row.branch_lat = "";
      row.branch_lng = "";
      continue;
    }

    if (!geocodeCache.has(geocodeKey)) {
      try {
        const coords = await geocodeAddress(row);
        geocodeCache.set(geocodeKey, coords);
      } catch {
        geocodeCache.set(geocodeKey, { lat: "", lng: "" });
      }
    }

    const coords = geocodeCache.get(geocodeKey) || { lat: "", lng: "" };
    row.branch_lat = coords.lat;
    row.branch_lng = coords.lng;
    process.stdout.write(`Geocoded ${index + 1}/${rows.length}: ${row.name || row.branch_address}\n`);
  }

  const header = [
    "name",
    "branch_address",
    "phone_number",
    "fax_number",
    "business_hour",
    "day_open",
    "cdm_available",
    "atm_cdm",
    "inquiry_availability",
    "application_availability",
    "aeon_lounge",
    "branch_lat",
    "branch_lng",
    "postcode",
    "state",
  ];

  const csvLines = [
    header.join(","),
    ...rows.map((row) =>
      header
        .map((key) => escapeCsv(row[key] ?? ""))
        .join(","),
    ),
  ];

  await fs.writeFile(OUTPUT_CSV_PATH, `${csvLines.join("\n")}\n`, "utf8");
  process.stdout.write(
    `Saved ${rows.length} official AEON branch rows to ${OUTPUT_CSV_PATH}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
