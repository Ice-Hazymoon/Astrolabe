/**
 * Tiny client for the public Nominatim geocoding API.
 *
 * Usage policy reminder (https://operations.osmfoundation.org/policies/nominatim/):
 * - Rate limit to 1 req/s — we debounce forward search at the call-site.
 * - Identify the app via the standard browser User-Agent / Referer headers;
 *   custom User-Agent is blocked by CORS in the browser, so we pass nothing.
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org';

interface NominatimOptions {
  signal?: AbortSignal;
  language?: string;
}

export interface NominatimHit {
  /** Short label used in suggestion rows — city/neighbourhood when we can derive it. */
  label: string;
  /** Full administrative chain — shown dimmer as a secondary line. */
  detail: string;
  lat: number;
  lon: number;
}

interface RawSearchHit {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
  name?: string;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  suburb?: string;
  neighbourhood?: string;
  district?: string;
  region?: string;
  country?: string;
  hamlet?: string;
  city_district?: string;
  municipality?: string;
}

function shortLabel(address: NominatimAddress | undefined, fallback: string): string {
  if (!address) return fallback;
  const primary =
    address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    address.municipality ||
    address.county ||
    address.district ||
    address.state ||
    address.region;
  const secondary =
    address.suburb ||
    address.neighbourhood ||
    address.city_district ||
    (primary === address.county ? undefined : address.county) ||
    (primary === address.state ? undefined : address.state);
  if (primary && secondary && secondary !== primary) return `${primary} · ${secondary}`;
  return primary ?? secondary ?? fallback;
}

function acceptLanguage(language?: string): string {
  const normalized = language?.trim();
  if (!normalized) return 'en';

  const lower = normalized.toLowerCase();
  const primary = lower === 'zh-hans'
    ? 'zh-CN'
    : lower === 'zh-hant'
      ? 'zh-TW'
      : normalized;

  const base = primary.split('-')[0];
  if (base.toLowerCase() === primary.toLowerCase()) {
    return `${primary},en;q=0.6`;
  }
  return `${primary},${base};q=0.8,en;q=0.6`;
}

export async function searchPlaces(
  query: string,
  { signal, language }: NominatimOptions = {},
): Promise<NominatimHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url =
    `${ENDPOINT}/search?format=json&limit=5&addressdetails=1` +
    `&accept-language=${encodeURIComponent(acceptLanguage(language))}` +
    `&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`nominatim search ${res.status}`);
  const raw = (await res.json()) as RawSearchHit[];
  return raw.map((r): NominatimHit => ({
    label: shortLabel(r.address, r.name ?? r.display_name.split(',')[0].trim()),
    detail: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
  }));
}

export async function reverseLookup(
  lat: number,
  lon: number,
  { signal, language }: NominatimOptions = {},
): Promise<NominatimHit | null> {
  const url =
    `${ENDPOINT}/reverse?format=json&addressdetails=1&zoom=13` +
    `&lat=${lat}&lon=${lon}` +
    `&accept-language=${encodeURIComponent(acceptLanguage(language))}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const r = (await res.json()) as RawSearchHit | { error?: string };
  if ('error' in r || !('display_name' in r)) return null;
  return {
    label: shortLabel(r.address, r.name ?? r.display_name.split(',')[0].trim()),
    detail: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
  };
}
