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

/**
 * Extract the country from a LinkedIn location string. Takes the last
 * comma-separated segment (the country) and maps it to a canonical entry.
 * Returns null when there's no recognizable country (e.g. "San Francisco Bay Area").
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

  // Try each segment from the end — the country is usually last, but be lenient.
  for (let i = segments.length - 1; i >= 0; i--) {
    const code = toCode(segments[i]);
    if (code) return { name: nameForCode(code)!, code };
  }
  // No known country: keep the last segment as the name, code unknown.
  const last = segments[segments.length - 1];
  return { name: last, code: null };
}
