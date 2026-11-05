/**
 * Vermont location resolution: ZIP → coordinates → nearby VTrans RWIS / road conditions
 * Zippopotam.us provides free US ZIP centroids (no API key).
 */

import type { RoadCondition } from './roadDataService';

export interface VermontZipLocation {
  zip: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  /** Query string for weather APIs: "lat,lon" */
  weatherQuery: string;
  displayName: string;
}

export interface NearbyRoadCondition extends RoadCondition {
  distanceMiles: number;
}

const zipCache = new Map<string, VermontZipLocation | null>();

export function extractZipCode(text: string): string | null {
  const match = text.match(/\b(\d{5})\b/);
  return match ? match[1] : null;
}

export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Resolve a US ZIP (Vermont-focused) to lat/lon via Zippopotam
 */
export async function resolveVermontZip(
  zipCode: string
): Promise<VermontZipLocation | null> {
  const zip = String(zipCode).trim().slice(0, 5);
  if (!/^\d{5}$/.test(zip)) return null;

  if (zipCache.has(zip)) {
    return zipCache.get(zip) ?? null;
  }

  try {
    const response = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'force-cache',
    });

    if (!response.ok) {
      zipCache.set(zip, null);
      return null;
    }

    const data = await response.json();
    const place = data?.places?.[0];
    if (!place) {
      zipCache.set(zip, null);
      return null;
    }

    const latitude = parseFloat(place.latitude);
    const longitude = parseFloat(place.longitude);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      zipCache.set(zip, null);
      return null;
    }

    const city = place['place name'] || place['placeName'] || 'Vermont';
    const state = place['state abbreviation'] || data['country abbreviation'] || 'VT';
    const resolved: VermontZipLocation = {
      zip,
      latitude,
      longitude,
      city,
      state,
      weatherQuery: `${latitude},${longitude}`,
      displayName: `${city}, ${state} ${zip}`,
    };

    zipCache.set(zip, resolved);
    console.log(`[VT Location] ZIP ${zip} → ${resolved.displayName} (${latitude}, ${longitude})`);
    return resolved;
  } catch (error) {
    console.warn(
      `[VT Location] ZIP lookup failed for ${zip}:`,
      error instanceof Error ? error.message : error
    );
    zipCache.set(zip, null);
    return null;
  }
}

/**
 * Prefer ZIP coords, then district lat/lon, then city name
 */
export async function resolveWeatherLocation(options: {
  zipCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  districtName?: string | null;
  fallback?: string;
}): Promise<{
  weatherQuery: string;
  displayName: string;
  zip?: VermontZipLocation;
  latitude?: number;
  longitude?: number;
}> {
  const fallback = options.fallback || 'Vermont';

  if (options.zipCode && /^\d{5}$/.test(options.zipCode)) {
    const zip = await resolveVermontZip(options.zipCode);
    if (zip) {
      return {
        weatherQuery: zip.weatherQuery,
        displayName: zip.displayName,
        zip,
        latitude: zip.latitude,
        longitude: zip.longitude,
      };
    }
  }

  if (
    options.latitude !== undefined &&
    options.latitude !== null &&
    options.longitude !== undefined &&
    options.longitude !== null
  ) {
    return {
      weatherQuery: `${options.latitude},${options.longitude}`,
      displayName:
        options.city ||
        options.districtName ||
        `${options.latitude.toFixed(3)}, ${options.longitude.toFixed(3)}`,
      latitude: options.latitude,
      longitude: options.longitude,
    };
  }

  if (options.city) {
    return { weatherQuery: options.city, displayName: options.city };
  }
  if (options.districtName) {
    return { weatherQuery: options.districtName, displayName: options.districtName };
  }

  return { weatherQuery: fallback, displayName: fallback };
}

/**
 * Keep road / RWIS reports within radiusMiles of a point
 */
export function filterConditionsNearLocation(
  conditions: RoadCondition[],
  latitude: number,
  longitude: number,
  radiusMiles: number = 35
): NearbyRoadCondition[] {
  return conditions
    .map((c) => {
      if (c.latitude === undefined || c.longitude === undefined) return null;
      const distanceMiles = haversineMiles(
        latitude,
        longitude,
        c.latitude,
        c.longitude
      );
      if (distanceMiles > radiusMiles) return null;
      return { ...c, distanceMiles };
    })
    .filter((c): c is NearbyRoadCondition => c !== null)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

const API_FALLBACK_SOURCES = new Set([
  'NWS',
  'TomTom',
  'Xweather',
  'New England 511',
  'Weatherbit',
  'Weatherstack',
  'Visual Crossing',
  'OpenWeatherMap',
]);

/**
 * ZIP-scope geocoded sensors, but ALWAYS keep weather/traffic API rows
 * (many NWS / Xweather / TomTom items have no lat/lon — they are the fallback layer).
 */
export function scopeConditionsForLocation(
  conditions: RoadCondition[],
  latitude: number,
  longitude: number,
  radiusMiles: number = 40
): RoadCondition[] {
  const nearby = filterConditionsNearLocation(
    conditions,
    latitude,
    longitude,
    radiusMiles
  );
  const nearbyKeys = new Set(
    nearby.map(
      (c) =>
        `${c.source}|${c.route}|${c.latitude}|${c.longitude}|${c.timestamp}`
    )
  );

  const apiFallback = conditions.filter((c) => {
    const key = `${c.source}|${c.route}|${c.latitude}|${c.longitude}|${c.timestamp}`;
    if (nearbyKeys.has(key)) return false;
    // Keep non-geocoded API rows + any non-RWIS statewide alerts useful as context
    if (c.latitude === undefined || c.longitude === undefined) {
      return API_FALLBACK_SOURCES.has(c.source) || c.source.startsWith('VTrans');
    }
    // Keep farther VTrans closures/incidents that aren't RWIS point sensors
    if (c.source === 'VTrans Lane Closures' || c.source === 'VTrans Incidents') {
      return true;
    }
    return false;
  });

  // Nearby first (distance-sorted), then broader API / closure context
  return [...nearby, ...apiFallback];
}

export function hasVTransRWIS(conditions: RoadCondition[]): boolean {
  return conditions.some((c) => c.source === 'VTrans RWIS');
}

/**
 * Dense, citeable briefing for Maple / snow-day factors
 */
export function formatLocalRWISBriefing(
  locationLabel: string,
  nearby: NearbyRoadCondition[],
  options?: { maxStations?: number }
): string {
  const max = options?.maxStations ?? 8;
  if (nearby.length === 0) {
    return `LOCAL SENSORS FOR ${locationLabel}: No VTrans RWIS stations within range. FALL BACK to NWS weather, forecast APIs (Weatherbit/Xweather), TomTom traffic, and any statewide VTrans closures/incidents in the road-conditions sections — integrate those APIs into the answer; do not say you lack road data if those sections have content.`;
  }

  const rwis = nearby.filter((c) => c.source === 'VTrans RWIS');
  const focus = (rwis.length > 0 ? rwis : nearby).slice(0, max);

  const wet = focus.filter((c) => c.condition === 'wet').length;
  const clear = focus.filter((c) => c.condition === 'clear').length;
  const ice = focus.filter((c) => c.condition === 'ice').length;
  const snow = focus.filter((c) => c.condition === 'snow-covered').length;

  let out = `LOCAL VERMONT ROAD SENSORS NEAR ${locationLabel.toUpperCase()} (${focus.length} closest of ${nearby.length} in range):\n`;
  out += `Local mix: ${wet} wet, ${clear} dry/clear, ${ice} ice-risk, ${snow} snow-covered.\n`;

  focus.forEach((c, i) => {
    const name = c.stationName || c.route;
    out += `${i + 1}. ${name} (${c.route}) — ${c.distanceMiles.toFixed(1)} mi — ${c.condition.toUpperCase()}`;
    if (c.surfaceFriction !== undefined) out += ` | μ=${c.surfaceFriction.toFixed(2)}`;
    if (c.temperature !== undefined) out += ` | air ${c.temperature.toFixed(0)}°F`;
    if (c.pavementTemperature !== undefined) {
      out += ` | pavement ${c.pavementTemperature.toFixed(0)}°F`;
    }
    if (c.locationDescription) out += ` | ${c.locationDescription}`;
    out += '\n';
  });

  out +=
    'Cite these station names, mile distances, friction, and pavement temps when answering about this ZIP/town.\n';
  return out;
}
