export function normalizePublicSiteUrl(value?: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

export function buildPublicUrl(path: string, siteUrl?: string): string {
  const base = normalizePublicSiteUrl(siteUrl || (typeof window !== "undefined" ? window.location.origin : ""));
  if (!base) return path;
  return new URL(path, `${base}/`).toString().replace(/\/$/, "") || base;
}

export function getShareBaseUrl(): string {
  const viteEnv = typeof import.meta !== "undefined" ? (import.meta as { env?: Record<string, string | undefined> }).env : undefined;
  const envValue = viteEnv?.VITE_PUBLIC_SITE_URL ?? process.env.VITE_PUBLIC_SITE_URL ?? "";

  const explicit = normalizePublicSiteUrl(
    typeof window !== "undefined"
      ? (window.localStorage.getItem("cue-public-site-url") ?? envValue)
      : envValue,
  );
  if (explicit) return explicit;
  return normalizePublicSiteUrl(
    typeof window !== "undefined" ? window.location.origin : "",
  );
}
