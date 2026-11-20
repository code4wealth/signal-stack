export type NameValidation = {
  valid: boolean;
  error: string | null;
  value: string;
};

export type WebsiteValidation = {
  valid: boolean;
  error: string | null;
  normalized: string;
};

export function validateCompanyName(raw: string): NameValidation {
  const value = raw.trim();
  if (!value) {
    return { valid: false, error: "Enter a company name to get started.", value };
  }
  if (value.length < 2) {
    return { valid: false, error: "Company name must be at least 2 characters.", value };
  }
  return { valid: true, error: null, value };
}

export function normalizeAndValidateWebsite(raw: string): WebsiteValidation {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, error: "Enter your company website, e.g. meetuniversity.com.", normalized: "" };
  }
  if (/\s/.test(trimmed)) {
    return { valid: false, error: "Website URL cannot contain spaces.", normalized: "" };
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, error: "Use an http or https website address.", normalized: "" };
    }
    const host = parsed.hostname.toLowerCase();
    if (!host || !host.includes(".") || host.startsWith(".") || host.endsWith(".")) {
      return { valid: false, error: "Enter a valid domain such as meetuniversity.com.", normalized: "" };
    }
    const tld = host.split(".").pop() ?? "";
    if (tld.length < 2 || !/^[a-z0-9-]+$/i.test(tld)) {
      return { valid: false, error: "Enter a valid domain extension (e.g. .com, .io).", normalized: "" };
    }
    const normalized = `${parsed.protocol}//${host}${parsed.pathname === "/" ? "" : parsed.pathname}${parsed.search}`;
    return { valid: true, error: null, normalized };
  } catch {
    return { valid: false, error: "Enter a valid website address, e.g. meetuniversity.com.", normalized: "" };
  }
}
