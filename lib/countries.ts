/**
 * Canonical country list + helpers for ICP country matching.
 *
 * LinkedIn location strings are free text ("Bengaluru, Karnataka, India"), and
 * the ICP editor historically stored a mix of names ("United States") and codes
 * ("US"). We normalize everything to a 2-letter ISO code so matching is precise.
 */
export interface Country {
  name: string;
  code: string; // ISO 3166-1 alpha-2
  alt?: string[]; // extra spellings/aliases (lowercased match)
}

export const COUNTRIES: Country[] = [
  { name: "United States", code: "US", alt: ["usa", "u.s.", "u.s.a.", "united states of america", "america"] },
  { name: "United Kingdom", code: "GB", alt: ["uk", "u.k.", "great britain", "britain", "england", "scotland", "wales", "northern ireland"] },
  { name: "India", code: "IN" },
  { name: "Canada", code: "CA" },
  { name: "Australia", code: "AU" },
  { name: "Singapore", code: "SG" },
  { name: "Israel", code: "IL" },
  { name: "United Arab Emirates", code: "AE", alt: ["uae"] },
  { name: "Germany", code: "DE", alt: ["deutschland"] },
  { name: "France", code: "FR" },
  { name: "Spain", code: "ES", alt: ["españa"] },
  { name: "Italy", code: "IT" },
  { name: "Netherlands", code: "NL", alt: ["the netherlands", "holland"] },
  { name: "Ireland", code: "IE" },
  { name: "Belgium", code: "BE" },
  { name: "Switzerland", code: "CH" },
  { name: "Austria", code: "AT" },
  { name: "Sweden", code: "SE" },
  { name: "Norway", code: "NO" },
  { name: "Denmark", code: "DK" },
  { name: "Finland", code: "FI" },
  { name: "Poland", code: "PL" },
  { name: "Portugal", code: "PT" },
  { name: "Czechia", code: "CZ", alt: ["czech republic"] },
  { name: "Romania", code: "RO" },
  { name: "Greece", code: "GR" },
  { name: "Hungary", code: "HU" },
  { name: "Russia", code: "RU", alt: ["russian federation"] },
  { name: "Ukraine", code: "UA" },
  { name: "Turkey", code: "TR", alt: ["türkiye", "turkiye"] },
  { name: "Brazil", code: "BR", alt: ["brasil"] },
  { name: "Mexico", code: "MX" },
  { name: "Argentina", code: "AR" },
  { name: "Chile", code: "CL" },
  { name: "Colombia", code: "CO" },
  { name: "Peru", code: "PE" },
  { name: "China", code: "CN" },
  { name: "Hong Kong", code: "HK" },
  { name: "Taiwan", code: "TW" },
  { name: "Japan", code: "JP" },
  { name: "South Korea", code: "KR", alt: ["korea", "republic of korea"] },
  { name: "Malaysia", code: "MY" },
  { name: "Indonesia", code: "ID" },
  { name: "Thailand", code: "TH" },
  { name: "Vietnam", code: "VN", alt: ["viet nam"] },
  { name: "Philippines", code: "PH", alt: ["the philippines"] },
  { name: "Pakistan", code: "PK" },
  { name: "Bangladesh", code: "BD" },
  { name: "Sri Lanka", code: "LK" },
  { name: "Nepal", code: "NP" },
  { name: "Saudi Arabia", code: "SA" },
  { name: "Qatar", code: "QA" },
  { name: "Kuwait", code: "KW" },
  { name: "Bahrain", code: "BH" },
  { name: "Oman", code: "OM" },
  { name: "Egypt", code: "EG" },
  { name: "South Africa", code: "ZA" },
  { name: "Nigeria", code: "NG" },
  { name: "Kenya", code: "KE" },
  { name: "New Zealand", code: "NZ" },
];

// Lookup: any lowercased alias/name/code → ISO2 code.
const CODE_BY_KEY = new Map<string, string>();
for (const c of COUNTRIES) {
  CODE_BY_KEY.set(c.name.toLowerCase(), c.code);
  CODE_BY_KEY.set(c.code.toLowerCase(), c.code);
  for (const a of c.alt ?? []) CODE_BY_KEY.set(a.toLowerCase(), c.code);
}
const NAME_BY_CODE = new Map<string, string>(COUNTRIES.map((c) => [c.code, c.name]));

/** Normalize any country name / code / common variant to its ISO2 code (or null). */
export function toCode(value?: string | null): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return CODE_BY_KEY.get(key) ?? null;
}

/** Canonical display name for an ISO2 code (falls back to the code itself). */
export function nameForCode(code?: string | null): string | null {
  if (!code) return null;
  return NAME_BY_CODE.get(code.trim().toUpperCase()) ?? code;
}

// US states + DC (LinkedIn often writes a metro with the state but no country,
// e.g. "Austin, Texas Metropolitan Area").
const US_STATES = new Set([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
  "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa",
  "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan",
  "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire",
  "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota",
  "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia",
  "wisconsin", "wyoming", "district of columbia",
]);

// Known LinkedIn "region" strings that carry no country segment → ISO code.
const REGION_TO_CODE: Record<string, string> = {
  "san francisco bay area": "US", "new york city metropolitan area": "US", "greater boston": "US",
  "greater chicago area": "US", "los angeles metropolitan area": "US", "greater seattle area": "US",
  "washington dc-baltimore area": "US", "greater philadelphia": "US", "dallas-fort worth metroplex": "US",
  "atlanta metropolitan area": "US", "greater houston": "US", "miami-fort lauderdale area": "US",
  "denver metropolitan area": "US", "salt lake city metropolitan area": "US", "detroit metropolitan area": "US",
  "greater minneapolis-st. paul area": "US", "greater phoenix area": "US", "san diego metropolitan area": "US",
  "greater tampa bay area": "US", "greater sacramento": "US", "kansas city metropolitan area": "US",
  "nashville metropolitan area": "US", "greater pittsburgh region": "US", "cincinnati metropolitan area": "US",
  "greater orlando": "US", "las vegas metropolitan area": "US", "greater st. louis": "US",
  "greater indianapolis": "US", "greater milwaukee": "US", "buffalo-niagara falls area": "US",
  "greater new orleans region": "US", "raleigh-durham-chapel hill area": "US", "greater richmond region": "US",
  "greater toronto area": "CA", "greater montreal metropolitan area": "CA", "greater vancouver metropolitan area": "CA",
  "greater ottawa metropolitan area": "CA", "greater calgary metropolitan area": "CA", "greater edmonton metropolitan area": "CA",
  "greater sydney area": "AU", "greater melbourne area": "AU", "greater brisbane area": "AU",
  "greater perth area": "AU", "greater adelaide area": "AU",
  "greater london": "GB", "greater manchester": "GB", "greater birmingham": "GB", "greater edinburgh area": "GB",
  "greater bengaluru area": "IN", "greater delhi area": "IN", "greater hyderabad area": "IN",
  "greater mumbai": "IN", "greater chennai area": "IN", "greater kolkata area": "IN",
  "greater ahmedabad area": "IN", "greater pune area": "IN",
};

const METRO_MARKER = /\b(area|metro|metroplex|metropolitan|region)\b/;

/**
 * Extract the country from a LinkedIn location string. Prefers the country
 * segment ("City, Region, Country"); falls back to well-known region strings
 * and US-state metros ("Austin, Texas Metropolitan Area"). Returns null when
 * there's no recognizable country.
 */
export function countryFromLocation(
  location?: string | null,
): { name: string; code: string | null } | null {
  if (!location) return null;
  const segments = location
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;

  // 1) Explicit country segment (usually last).
  for (let i = segments.length - 1; i >= 0; i--) {
    const code = toCode(segments[i]);
    if (code) return { name: nameForCode(code)!, code };
  }

  const lower = location.toLowerCase().trim();

  // 2) Known metro/region string with no country segment.
  if (REGION_TO_CODE[lower]) {
    const code = REGION_TO_CODE[lower];
    return { name: nameForCode(code)!, code };
  }

  // 3) A US state named inside a metro string ("…, Texas Metropolitan Area").
  //    Gated on a metro marker so "Tbilisi, Georgia" (the country) isn't caught.
  if (METRO_MARKER.test(lower)) {
    for (const st of US_STATES) {
      if (lower.includes(st)) return { name: "United States", code: "US" };
    }
  }

  // Unknown country: keep the last segment as the name, code null.
  return { name: segments[segments.length - 1], code: null };
}
