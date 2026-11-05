/**
 * VTrans RWIS (Road Weather Information System) Service
 * Live feed: New England Compass C2C ESS XML (public, no API key)
 * https://nec-por.ne-compass.com/NEC.XmlDataPortal/api/c2c?networks=Vermont&dataTypes=essData
 *
 * Coordinates are microdegrees. Temps are tenths of °C. surfaceFriction is 0–1 (μ).
 */

export const VTRANS_ESS_FEED_URL =
  'https://nec-por.ne-compass.com/NEC.XmlDataPortal/api/c2c?networks=Vermont&dataTypes=essData';

export interface VTransRWISStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  type: string;
  roadSurfaceCond?: 'Dry' | 'Wet' | 'Ice' | 'Snow' | 'Frost' | 'Unknown';
  precipType?: string;
  precipRate?: number;
  airTemp?: number; // Fahrenheit
  pavementTemp?: number; // Fahrenheit
  dewPoint?: number; // Fahrenheit
  windSpeed?: number; // mph
  windDir?: string;
  visibility?: number; // meters
  waterDepth?: number; // mm (sensor units as reported)
  surfaceFriction?: number; // 0–1 coefficient of friction
  barometricPressure?: number;
  roadway?: string;
  direction?: string;
  locationDescription?: string;
  timestamp: string;
}

export interface VTransRWISRoadCondition {
  route: string;
  condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
  temperature?: number;
  pavementTemperature?: number;
  surfaceFriction?: number;
  windSpeed?: number;
  locationDescription?: string;
  stationName?: string;
  warning?: string;
  source: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  severity?: 'MINOR' | 'MODERATE' | 'MAJOR';
}

function microdegreesToDecimal(microdeg: number): number {
  return microdeg / 1000000;
}

/** VTrans ESS temps are tenths of Celsius → Fahrenheit */
function tenthsCToF(tenthsOfCelsius: number): number {
  return (tenthsOfCelsius / 10) * (9 / 5) + 32;
}

/**
 * Normalize friction to 0–1. Feed reports values like 0.58–0.82.
 * If a legacy 0–100 value appears, scale it down.
 */
function normalizeFriction(raw: number | undefined): number | undefined {
  if (raw === undefined || Number.isNaN(raw)) return undefined;
  if (raw > 1.5) return Math.min(1, raw / 100);
  return Math.max(0, Math.min(1, raw));
}

function frictionLabel(mu: number): string {
  if (mu < 0.4) return 'extremely slippery';
  if (mu < 0.55) return 'very slippery';
  if (mu < 0.65) return 'slippery';
  if (mu < 0.75) return 'reduced grip';
  return 'good grip';
}

/**
 * Parse VTrans RWIS / ESS XML (C2C ICD)
 */
export function parseVTransRWISXML(xmlText: string): VTransRWISStation[] {
  const stations: VTransRWISStation[] = [];

  try {
    const essMatches = xmlText.matchAll(/<ess\b[^>]*>([\s\S]*?)<\/ess>/gi);

    for (const match of essMatches) {
      const essContent = match[0];

      const getTag = (tag: string): string | undefined => {
        const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'i');
        const result = essContent.match(regex);
        return result ? result[1].trim() : undefined;
      };

      const getNumeric = (tag: string): number | undefined => {
        const value = getTag(tag);
        return value !== undefined && value !== '' && !isNaN(Number(value))
          ? Number(value)
          : undefined;
      };

      const attrId = essContent.match(/<ess\b[^>]*\bid="([^"]+)"/i)?.[1];
      const id = attrId || getTag('id') || 'unknown';
      const name = getTag('name') || 'Unknown Station';
      const type = getTag('type') || 'Unknown';
      const status = getTag('status') || 'Unknown';

      // Skip county polygons / virtual aggregates — not physical sensors
      if (type === 'VirtualRwis') continue;

      const latMicro = getNumeric('lat');
      const lonMicro = getNumeric('lon');
      if (latMicro === undefined || lonMicro === undefined) continue;

      const roadway = getTag('roadway');
      if (!roadway || roadway === 'nowhere') continue;

      const airTempC = getNumeric('airTemp');
      const pavementTempC = getNumeric('pavementTemp');
      const dewPointC = getNumeric('dewPoint');

      const surfaceRaw = getTag('roadSurfaceCond');
      const roadSurfaceCond = surfaceRaw as VTransRWISStation['roadSurfaceCond'] | undefined;

      const station: VTransRWISStation = {
        id,
        name: name.trim(),
        latitude: microdegreesToDecimal(latMicro),
        longitude: microdegreesToDecimal(lonMicro),
        status,
        type,
        roadSurfaceCond,
        precipType: getTag('precipType'),
        precipRate: getNumeric('precipRate'),
        airTemp: airTempC !== undefined ? tenthsCToF(airTempC) : undefined,
        pavementTemp: pavementTempC !== undefined ? tenthsCToF(pavementTempC) : undefined,
        dewPoint: dewPointC !== undefined ? tenthsCToF(dewPointC) : undefined,
        windSpeed: getNumeric('windSpeed'),
        windDir: getTag('windDir'),
        visibility: getNumeric('visibility'),
        waterDepth: getNumeric('waterDepth'),
        surfaceFriction: normalizeFriction(getNumeric('surfaceFriction')),
        barometricPressure: getNumeric('barometricPressure'),
        roadway,
        direction: getTag('direction'),
        locationDescription: getTag('locationDescription'),
        timestamp: getTag('timestamp') || new Date().toISOString(),
      };

      const isOnline = /online/i.test(status);
      const hasSurfaceSignal =
        !!station.roadSurfaceCond ||
        station.surfaceFriction !== undefined ||
        station.pavementTemp !== undefined ||
        (station.precipType && station.precipType !== 'N/A');

      // Keep online stations with sensor signal; drop stale offline with no useful surface data
      if (!isOnline && !hasSurfaceSignal) continue;
      if (!isOnline) continue;

      stations.push(station);
    }

    return stations;
  } catch (error) {
    console.error('Error parsing VTrans RWIS XML:', error);
    return [];
  }
}

/**
 * Fetch live Vermont ESS / RWIS from New England Compass XmlDataPortal
 */
export async function fetchVTransRWISData(xmlData?: string): Promise<VTransRWISStation[]> {
  try {
    if (xmlData) {
      return parseVTransRWISXML(xmlData);
    }

    const endpoints = [
      VTRANS_ESS_FEED_URL,
      'https://nec-por.ne-compass.com/NEC.XmlDataPortal/api/c2c?networks=Vermont&dataTypes=essData',
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: {
            Accept: 'application/xml, text/xml, */*',
            'User-Agent': 'WEATHERbird/1.0 (Vermont road weather; weatherbirdvt.com)',
          },
          signal: AbortSignal.timeout(15000),
          cache: 'no-store',
        });

        if (!response.ok) {
          console.warn(`[VTrans RWIS] ${endpoint} → HTTP ${response.status}`);
          continue;
        }

        const xmlText = await response.text();
        if (!xmlText.includes('<ess')) continue;

        const stations = parseVTransRWISXML(xmlText);
        if (stations.length > 0) {
          console.log(`[VTrans RWIS] ${stations.length} online stations from ${endpoint}`);
          return stations;
        }
      } catch (e) {
        console.warn(
          `[VTrans RWIS] Failed ${endpoint}:`,
          e instanceof Error ? e.message : 'Unknown error'
        );
      }
    }

    console.warn('[VTrans RWIS] No live ESS data returned');
    return [];
  } catch (error) {
    console.error('Error fetching VTrans RWIS data:', error);
    return [];
  }
}

/**
 * Convert VTrans RWIS stations to road-condition records for scoring / Maple
 */
export function convertVTransRWISToRoadConditions(
  stations: VTransRWISStation[]
): VTransRWISRoadCondition[] {
  return stations
    .filter((station) => station.roadway && station.roadway !== 'nowhere')
    .map((station) => {
      let condition: VTransRWISRoadCondition['condition'] = 'unknown';
      const parts: string[] = [];
      const mu = station.surfaceFriction;
      const air = station.airTemp;
      const pavement = station.pavementTemp;
      const loc =
        station.locationDescription ||
        [station.roadway, station.direction, station.name].filter(Boolean).join(' ');

      parts.push(`${station.name}`);
      if (station.locationDescription) {
        parts.push(`@ ${station.locationDescription}`);
      }

      const nearFreezing =
        (air !== undefined && air <= 35) || (pavement !== undefined && pavement <= 35);
      const freezing =
        (air !== undefined && air <= 32) || (pavement !== undefined && pavement <= 32);

      switch (station.roadSurfaceCond) {
        case 'Dry':
          if (mu !== undefined && mu < 0.5 && freezing) {
            condition = 'ice';
            parts.push(
              `Dry report but friction ${mu.toFixed(2)} (${frictionLabel(mu)}) near freezing — possible black ice`
            );
          } else if (nearFreezing && mu !== undefined && mu < 0.7) {
            condition = 'wet';
            parts.push(
              `Dry surface near freezing (${air?.toFixed(0) ?? '?'}°F air / ${pavement?.toFixed(0) ?? '?'}°F pavement) — watch for ice`
            );
          } else {
            condition = 'clear';
            parts.push('Dry pavement');
          }
          break;
        case 'Wet':
          if (freezing || (nearFreezing && mu !== undefined && mu < 0.6)) {
            condition = 'ice';
            parts.push(
              `Wet at ${air?.toFixed(0) ?? '?'}°F air / ${pavement?.toFixed(0) ?? '?'}°F pavement — freeze risk`
            );
          } else {
            condition = 'wet';
            parts.push('Wet pavement');
          }
          break;
        case 'Ice':
        case 'Frost':
          condition = 'ice';
          parts.push(`${station.roadSurfaceCond} on pavement`);
          break;
        case 'Snow':
          condition = 'snow-covered';
          parts.push('Snow on pavement');
          break;
        case 'Unknown':
        default:
          if (mu !== undefined) {
            if (mu < 0.45) {
              condition = 'ice';
              parts.push(`Unknown surface — friction ${mu.toFixed(2)} (${frictionLabel(mu)})`);
            } else if (mu < 0.6) {
              condition = 'snow-covered';
              parts.push(`Unknown surface — friction ${mu.toFixed(2)} suggests snow/slush`);
            } else {
              condition = 'unknown';
              parts.push(`Unknown surface — friction ${mu.toFixed(2)}`);
            }
          } else {
            condition = 'unknown';
            parts.push('Surface condition unknown');
          }
          break;
      }

      const precip = (station.precipType || '').toLowerCase();
      if (precip.includes('snow') || precip.includes('sleet')) {
        condition = 'snow-covered';
        parts.push(`Precip: ${station.precipType}`);
      } else if (precip.includes('freezing')) {
        condition = 'ice';
        parts.push(`Precip: ${station.precipType} — EXTREMELY DANGEROUS`);
      } else if (precip.includes('rain')) {
        if (freezing) {
          condition = 'ice';
          parts.push(`Rain at freezing temps — icing risk`);
        } else if (condition === 'clear' || condition === 'unknown') {
          condition = 'wet';
        }
        if (station.precipRate !== undefined && station.precipRate > 0) {
          parts.push(`Rain rate ${station.precipRate}`);
        } else {
          parts.push(`Precip: ${station.precipType}`);
        }
      }

      if (mu !== undefined) {
        parts.push(`friction ${mu.toFixed(2)} (${frictionLabel(mu)})`);
      }
      if (air !== undefined) parts.push(`air ${air.toFixed(0)}°F`);
      if (pavement !== undefined) parts.push(`pavement ${pavement.toFixed(0)}°F`);
      if (station.waterDepth !== undefined && station.waterDepth > 0) {
        parts.push(`water depth ${station.waterDepth}`);
      }
      if (station.windSpeed !== undefined && station.windSpeed >= 25) {
        parts.push(`wind ${station.windSpeed} mph ${station.windDir || ''}`.trim());
      }
      if (station.visibility !== undefined && station.visibility < 1609) {
        // < 1 mile in meters
        parts.push(`visibility ${(station.visibility / 1609).toFixed(1)} mi`);
      }

      let severity: VTransRWISRoadCondition['severity'];
      if (condition === 'ice' || (mu !== undefined && mu < 0.45)) {
        severity = 'MAJOR';
      } else if (
        condition === 'snow-covered' ||
        (mu !== undefined && mu < 0.6) ||
        (condition === 'wet' && nearFreezing)
      ) {
        severity = 'MODERATE';
      } else if (condition === 'wet' || condition === 'unknown') {
        severity = 'MINOR';
      }

      return {
        route: station.roadway || station.name,
        condition,
        temperature: air,
        pavementTemperature: pavement,
        surfaceFriction: mu,
        windSpeed: station.windSpeed,
        locationDescription: loc,
        stationName: station.name,
        warning: parts.join(' | '),
        source: 'VTrans RWIS',
        timestamp: station.timestamp,
        latitude: station.latitude,
        longitude: station.longitude,
        severity,
      };
    });
}

/**
 * Statewide narrative for Maple / AI context from live RWIS stations
 */
export function formatVermontRWISSummaryForAI(
  conditions: VTransRWISRoadCondition[]
): string {
  if (conditions.length === 0) {
    return 'VTrans RWIS: no online Vermont sensor stations available right now.';
  }

  const counts = {
    clear: 0,
    wet: 0,
    ice: 0,
    snow: 0,
    unknown: 0,
  };
  for (const c of conditions) {
    if (c.condition === 'clear') counts.clear++;
    else if (c.condition === 'wet') counts.wet++;
    else if (c.condition === 'ice') counts.ice++;
    else if (c.condition === 'snow-covered') counts.snow++;
    else counts.unknown++;
  }

  const withFriction = conditions
    .filter((c) => c.surfaceFriction !== undefined)
    .sort((a, b) => (a.surfaceFriction ?? 1) - (b.surfaceFriction ?? 1));

  const temps = conditions
    .map((c) => c.temperature)
    .filter((t): t is number => t !== undefined);
  const pavements = conditions
    .map((c) => c.pavementTemperature)
    .filter((t): t is number => t !== undefined);

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : undefined;

  const avgAir = avg(temps);
  const avgPavement = avg(pavements);
  const lowestFriction = withFriction.slice(0, 5);

  let out = `VERMONT VTrans RWIS LIVE NETWORK (${conditions.length} online stations):\n`;
  out += `Statewide mix: ${counts.wet} wet, ${counts.clear} dry/clear, ${counts.ice} ice-risk, ${counts.snow} snow-covered, ${counts.unknown} unknown.\n`;
  if (avgAir !== undefined) {
    out += `Avg air ${avgAir.toFixed(0)}°F`;
    if (avgPavement !== undefined) out += `, avg pavement ${avgPavement.toFixed(0)}°F`;
    out += '.\n';
  }
  if (lowestFriction.length) {
    out += 'Lowest grip stations (prioritize in travel advice):\n';
    lowestFriction.forEach((c, i) => {
      out += `  ${i + 1}. ${c.stationName || c.route} (${c.route}): μ=${c.surfaceFriction!.toFixed(2)} — ${c.condition}`;
      if (c.locationDescription) out += ` @ ${c.locationDescription}`;
      out += '\n';
    });
  }
  out +=
    'Use these Vermont sensor readings as ground truth for local roads when answering drivers.\n';
  return out;
}

/**
 * Fetch and convert VTrans RWIS data to road conditions
 */
export async function fetchVTransRWISRoadConditions(): Promise<VTransRWISRoadCondition[]> {
  try {
    const stations = await fetchVTransRWISData();
    return convertVTransRWISToRoadConditions(stations);
  } catch (error) {
    console.error('Error fetching VTrans RWIS road conditions:', error);
    return [];
  }
}
