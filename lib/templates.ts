/**
 * Render a template with {{variable}} placeholders against a connection record.
 * Unknown placeholders render as empty strings. Whitespace inside braces is
 * tolerated: {{ first_name }} works.
 */
export interface TemplateVars {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  headline?: string | null;
  company?: string | null;
  position?: string | null;
  country?: string | null;
  [key: string]: string | null | undefined;
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return value == null ? "" : String(value);
  });
}

export function templateVarsFromConnection(c: {
  firstName?: string | null;
  lastName?: string | null;
  headline?: string | null;
  company?: string | null;
  position?: string | null;
  locationCountry?: string | null;
}): TemplateVars {
  const full = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return {
    first_name: c.firstName ?? "",
    last_name: c.lastName ?? "",
    full_name: full,
    headline: c.headline ?? "",
    company: c.company ?? "",
    position: c.position ?? "",
    country: c.locationCountry ?? "",
  };
}

/** List the placeholders used in a template, for UI hints/validation. */
export function extractPlaceholders(template: string): string[] {
  const set = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    set.add(m[1]);
  }
  return [...set];
}
