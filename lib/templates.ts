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

/**
 * Build template vars for a post commenter. Reuses the same placeholder set
 * ({{first_name}}, {{full_name}}, {{headline}}) and adds {{comment_text}} so a
 * message can reference what they actually said.
 */
export function templateVarsFromCommenter(c: {
  name?: string | null;
  headline?: string | null;
  commentText?: string | null;
}): TemplateVars {
  const parts = (c.name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return {
    first_name: first,
    last_name: last,
    full_name: (c.name ?? "").trim(),
    headline: c.headline ?? "",
    company: "",
    position: "",
    country: "",
    comment_text: c.commentText ?? "",
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
