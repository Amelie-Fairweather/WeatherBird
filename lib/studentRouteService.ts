/**
 * Student route / high-school corridor assessment for snow-day decisions.
 * Superintendents close schools when buses/students can't safely reach the high school —
 * so we resolve each district's high school(s), identify approach corridors, and score
 * live VTrans RWIS pavement + surface conditions along those routes.
 */

import {
  geocodeVermontPlace,
  haversineMiles,
  type NearbyRoadCondition,
} from './vermontLocationService';
import type { SchoolDistrict } from './schoolDistrictService';
import {
  VERMONT_HIGH_SCHOOLS,
  type HighSchoolCampus,
} from './vermontHighSchools';
import {
  estimateCorridorHazard,
  type CalibrationFeatures,
} from './training/snowDayCalibration';

export type { HighSchoolCampus };
export { VERMONT_HIGH_SCHOOLS };

export interface StudentRouteSensor {
  stationName: string;
  route: string;
  distanceMiles: number;
  condition: string;
  pavementTemperature?: number;
  surfaceFriction?: number;
  temperature?: number;
  onNamedCorridor: boolean;
  /** Bus corridor this reading belongs to, when the station names one */
  matchedCorridor?: string;
}

export interface BadRoad {
  name: string;
  reason: string;
  hazard: number;
  condition: string;
  distanceMiles: number;
  surfaceFriction?: number;
  pavementTemperature?: number;
}

/** The bus road that sets the call. Same hazard scale as the labeled Vermont snow days. */
export interface DecisionRoad {
  name: string;
  hazard: number;
  condition: string;
  surfaceCondition: string;
  frictionMu: number;
  pavementTempF: number;
  frictionWasMeasured: boolean;
}

export interface StudentRouteAssessment {
  highSchools: Array<{
    name: string;
    city: string;
    latitude: number;
    longitude: number;
    approachCorridors: string[];
  }>;
  corridorSensors: StudentRouteSensor[];
  /** Roads whose own reading is closed, icy, snow-covered, or low-grip */
  badRoads: BadRoad[];
  /** Worst bus road, on the same 0–100 scale as past snow-day calls */
  decisionRoad?: DecisionRoad;
  /** Average training hazard of the bus roads that had a reading */
  averageHazard: number;
  /** 0–100: higher = more unsafe for student/bus travel. This is the worst bus road. */
  routeHazardScore: number;
  passable: boolean;
  summary: string;
  factors: string[];
  closingAdjustment: number;
  delayAdjustment: number;
}

const CORRIDOR_RADIUS_MILES = 15;
const NAMED_CORRIDOR_BONUS_MILES = 18;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\brd\b/g, 'road')
    .replace(/\bst\b/g, 'street')
    .replace(/\bave\b/g, 'avenue')
    .replace(/\bdr\b/g, 'drive')
    .replace(/\bln\b/g, 'lane')
    .replace(/\bhwy\b/g, 'highway')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whole-phrase match so VT-7 does not hit VT-73, and "Main St" still hits "Main Street". */
function phraseHit(hay: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(hay);
}

function corridorHit(routeOrStation: string, corridor: string): boolean {
  const hay = normalize(routeOrStation);
  const needle = normalize(corridor);
  if (!needle) return false;
  if (phraseHit(hay, needle)) return true;
  const route = needle.match(/^(us|vt|i)\s+(\d+[a-z]?)$/);
  if (!route) return false;
  const [, kind, num] = route;
  if (phraseHit(hay, `${kind} ${num}`)) return true;
  if (kind === 'vt' && phraseHit(hay, `route ${num}`)) return true;
  return false;
}

function corridorMatches(routeOrStation: string, corridors: string[]): boolean {
  return corridors.some((c) => corridorHit(routeOrStation, c));
}

/** Longest matching bus-road name, so "Shelburne Road" wins over "US-7" on the same station. */
function bestCorridorName(routeOrStation: string, corridors: string[]): string | undefined {
  const hits = corridors.filter((c) => corridorHit(routeOrStation, c));
  if (hits.length === 0) return undefined;
  return hits.sort((a, b) => normalize(b).length - normalize(a).length)[0];
}

function describeRoad(s: StudentRouteSensor): string {
  const bits = [s.condition || 'unknown'];
  if (s.surfaceFriction !== undefined) bits.push(`μ=${s.surfaceFriction.toFixed(2)}`);
  if (s.pavementTemperature !== undefined) bits.push(`pavement ${Math.round(s.pavementTemperature)}°F`);
  bits.push(`${s.distanceMiles} mi from campus`);
  return bits.join(', ');
}

function roadIsBad(s: StudentRouteSensor, hazard: number): boolean {
  const cond = (s.condition || '').toLowerCase();
  if (cond === 'closed' || cond === 'ice' || cond === 'snow-covered') return true;
  if (s.surfaceFriction !== undefined && s.surfaceFriction < 0.4) return true;
  return hazard >= 45;
}

/** Map a live VTrans condition onto the surface words the labeled snow days used. */
function trainingSurface(condition: string): string {
  const c = (condition || '').toLowerCase();
  if (c.includes('ice')) return 'Icy / Black Ice';
  if (c === 'closed') return 'Snow Covered';
  if (c.includes('snow')) return 'Snow Covered';
  if (c === 'wet') return 'Wet / Treated';
  if (c === 'clear') return 'Dry / Clear';
  return 'unknown';
}

/**
 * Friction for the historical model. A measured μ is used as-is.
 * Ice or a closure with no μ uses 0.22, the band that produced past ice closes.
 * Snow cover with no μ uses 0.40, the delay band, so missing data does not invent a close.
 */
function frictionForTraining(s: StudentRouteSensor): { mu: number; measured: boolean } {
  if (s.surfaceFriction != null && Number.isFinite(s.surfaceFriction)) {
    return { mu: s.surfaceFriction, measured: true };
  }
  const cond = (s.condition || '').toLowerCase();
  if (cond === 'ice' || cond === 'closed') return { mu: 0.22, measured: false };
  if (cond === 'snow-covered') return { mu: 0.4, measured: false };
  return { mu: 0.65, measured: false };
}

function trainingHazardFor(s: StudentRouteSensor): {
  hazard: number;
  surfaceCondition: string;
  frictionMu: number;
  pavementTempF: number;
  frictionWasMeasured: boolean;
} {
  const friction = frictionForTraining(s);
  const surfaceCondition = trainingSurface(s.condition);
  const pavementTempF = s.pavementTemperature ?? s.temperature ?? 32;
  const features: CalibrationFeatures = {
    snowfallInches: 0,
    tempF: s.temperature ?? pavementTempF,
    windMph: 0,
    windChillF: s.temperature ?? pavementTempF,
    iceInches: 0,
    freezingRain: false,
    timingWindow: '',
    conditionText: '',
    pavementTempF,
    surfaceCondition,
    frictionMu: friction.mu,
  };
  return {
    hazard: estimateCorridorHazard(features),
    surfaceCondition,
    frictionMu: friction.mu,
    pavementTempF,
    frictionWasMeasured: friction.measured,
  };
}

export interface StudentRouteOverrides {
  highSchoolName?: string;
  priorityCorridors?: string[];
  feederTowns?: string[];
  feederZips?: string[];
}

function withCorridorOverrides(
  hs: HighSchoolCampus,
  overrides?: StudentRouteOverrides
): HighSchoolCampus {
  return {
    ...hs,
    approachCorridors: [
      ...(overrides?.priorityCorridors || []),
      ...hs.approachCorridors,
    ].filter((v, i, a) => a.findIndex((x) => normalize(x) === normalize(v)) === i),
    feederTowns: [
      ...(overrides?.feederTowns || []),
      ...(hs.feederTowns || []),
    ].filter((v, i, a) => a.findIndex((x) => normalize(x) === normalize(v)) === i),
  };
}

/**
 * Resolve high school campuses for a district / city / ZIP that a student or teacher enters.
 * Returns the school(s) whose main morning corridors should be checked with VTrans RWIS.
 */
export async function resolveHighSchoolsForDistrict(
  district: Pick<
    SchoolDistrict,
    'district_name' | 'city' | 'county' | 'latitude' | 'longitude' | 'zip_codes'
  >,
  overrides?: StudentRouteOverrides
): Promise<HighSchoolCampus[]> {
  const nameNorm = normalize(district.district_name || '');
  const cityNorm = normalize(district.city || '');
  const countyNorm = normalize(district.county || '');
  const hsOverride = overrides?.highSchoolName?.trim();
  const zipHints = [
    ...(overrides?.feederZips || []),
    ...(district.zip_codes || []),
  ]
    .map((z) => String(z).trim())
    .filter((z) => /^\d{5}$/.test(z));

  // Prefer explicit high school name from superintendent form
  if (hsOverride) {
    const byName = VERMONT_HIGH_SCHOOLS.find(
      (hs) =>
        normalize(hs.name).includes(normalize(hsOverride)) ||
        normalize(hsOverride).includes(normalize(hs.name))
    );
    if (byName) {
      return [withCorridorOverrides(byName, overrides)];
    }
  }

  // ZIP → school campus (students/teachers often enter a ZIP)
  if (zipHints.length > 0) {
    const byZip = VERMONT_HIGH_SCHOOLS.filter(
      (hs) => hs.zip && zipHints.includes(hs.zip)
    );
    if (byZip.length > 0) {
      return byZip.map((hs) => withCorridorOverrides(hs, overrides));
    }
  }

  const matched = VERMONT_HIGH_SCHOOLS.filter((hs) => {
    const hsName = normalize(hs.name);
    const hsCity = normalize(hs.city);
    const hsCounty = normalize(hs.county || '');

    // Explicit school / district keyword match
    if (hs.districtMatch.some((m) => nameNorm.includes(normalize(m)))) return true;
    // District string contains school name or city (e.g. "Middlebury", "CVU")
    if (nameNorm && (hsName.includes(nameNorm) || nameNorm.includes(hsName) || nameNorm.includes(hsCity))) {
      return true;
    }
    if (cityNorm && (hsCity === cityNorm || hsCity.includes(cityNorm) || cityNorm.includes(hsCity))) {
      return true;
    }
    // County-level entry: "Chittenden", "Addison County" → all high schools there
    if (countyNorm && hsCounty && hsCounty === countyNorm) return true;
    if (
      nameNorm &&
      hsCounty &&
      (nameNorm === hsCounty ||
        nameNorm === `${hsCounty} county` ||
        nameNorm.includes(`${hsCounty} county`))
    ) {
      return true;
    }
    return false;
  });

  // Prefer city/district-specific schools over entire-county dumps when both match
  let resolved = matched;
  if (matched.length > 3 && (cityNorm || nameNorm)) {
    const tighter = matched.filter((hs) => {
      const hsCity = normalize(hs.city);
      const hsName = normalize(hs.name);
      return (
        (cityNorm && (hsCity === cityNorm || hsCity.includes(cityNorm))) ||
        hs.districtMatch.some((m) => nameNorm.includes(normalize(m))) ||
        nameNorm.includes(hsCity) ||
        hsName.includes(nameNorm)
      );
    });
    if (tighter.length > 0) resolved = tighter;
  }

  if (resolved.length > 0) {
    return resolved.map((hs) => withCorridorOverrides(hs, overrides));
  }

  // Fallback: geocode "{city} High School, Vermont" or district name
  const query =
    district.city
      ? `${district.city} High School, Vermont`
      : `${district.district_name} High School, Vermont`;

  const defaultCorridors = [
    ...(overrides?.priorityCorridors || []),
    'US-7',
    'US-2',
    'US-4',
    'US-5',
    'I-89',
    'I-91',
    'VT-100',
    'VT-15',
  ].filter((v, i, a) => a.findIndex((x) => normalize(x) === normalize(v)) === i);

  try {
    const place = await geocodeVermontPlace(
      hsOverride ? `${hsOverride}, Vermont` : query
    );
    if (place) {
      return [
        {
          name: hsOverride || `${district.city || district.district_name} High School`,
          districtMatch: [district.district_name],
          city: district.city || place.displayName,
          county: district.county,
          latitude: place.latitude,
          longitude: place.longitude,
          approachCorridors: defaultCorridors,
          feederTowns: [
            ...(overrides?.feederTowns || []),
            ...(district.city ? [district.city] : []),
          ],
        },
      ];
    }
  } catch (err) {
    console.warn('[Student Routes] Geocode fallback failed:', err);
  }

  // Last resort: use district centroid if present
  if (district.latitude != null && district.longitude != null) {
    return [
      {
        name: hsOverride || `${district.district_name} (campus estimate)`,
        districtMatch: [district.district_name],
        city: district.city || district.district_name,
        county: district.county,
        latitude: district.latitude,
        longitude: district.longitude,
        approachCorridors: defaultCorridors.length
          ? defaultCorridors
          : ['US-7', 'US-2', 'I-89', 'VT-100'],
        feederTowns: overrides?.feederTowns,
      },
    ];
  }

  return [];
}

/**
 * Assess VTrans RWIS pavement/surface conditions on routes students take to district high schools.
 */
export async function assessStudentRoutes(
  district: Pick<
    SchoolDistrict,
    'district_name' | 'city' | 'county' | 'latitude' | 'longitude' | 'zip_codes'
  >,
  roadConditions: NearbyRoadCondition[],
  overrides?: StudentRouteOverrides
): Promise<StudentRouteAssessment> {
  const highSchools = await resolveHighSchoolsForDistrict(district, overrides);
  const factors: string[] = [];
  factors.push(
    'Method: resolve the high school → check every priority bus route before the call → score pavement with VTrans RWIS (μ, pavement temp, surface) + sky/weather APIs'
  );

  if (overrides?.priorityCorridors && overrides.priorityCorridors.length > 0) {
    factors.push(
      `Extra corridors added: ${overrides.priorityCorridors.join(', ')}`
    );
  }

  if (highSchools.length === 0) {
    return {
      highSchools: [],
      corridorSensors: [],
      badRoads: [],
      averageHazard: 0,
      routeHazardScore: 0,
      passable: true,
      summary:
        'No high school campus resolved for this district — using district-wide road sensors + sky/weather APIs only.',
      factors: [
        ...factors,
        'Could not resolve high school campus for student-route scoring',
      ],
      closingAdjustment: 0,
      delayAdjustment: 0,
    };
  }

  for (const hs of highSchools) {
    const corridors = [...new Set(hs.approachCorridors.map((c) => c.trim()).filter(Boolean))];
    const snowSensitive = new Set(
      (hs.snowSensitiveCorridors || []).map((c) => normalize(c))
    );
    factors.push(
      `Priority bus routes checked before the ${hs.name} prediction (${corridors.length}): ${corridors
        .map((c) => (snowSensitive.has(normalize(c)) ? `${c} [snow-sensitive]` : c))
        .join(', ')}`
    );
  }

  const vtrans = roadConditions.filter((c) => c.source === 'VTrans RWIS');
  const sensorMap = new Map<string, StudentRouteSensor>();

  for (const hs of highSchools) {
    for (const c of vtrans) {
      if (c.latitude == null || c.longitude == null) continue;
      const distanceMiles = haversineMiles(hs.latitude, hs.longitude, c.latitude, c.longitude);
      const stationText = `${c.route || ''} ${c.stationName || ''}`;
      const matchedCorridor = bestCorridorName(stationText, hs.approachCorridors);
      const onNamedCorridor = matchedCorridor != null;

      const withinRadius =
        distanceMiles <= CORRIDOR_RADIUS_MILES ||
        (onNamedCorridor && distanceMiles <= NAMED_CORRIDOR_BONUS_MILES);

      if (!withinRadius) continue;

      const key = `${c.stationName || c.route}|${c.latitude}|${c.longitude}`;
      const existing = sensorMap.get(key);
      const candidate: StudentRouteSensor = {
        stationName: c.stationName || c.route || 'RWIS',
        route: c.route || 'unknown',
        distanceMiles: Math.round(distanceMiles * 10) / 10,
        condition: c.condition,
        pavementTemperature: c.pavementTemperature,
        surfaceFriction: c.surfaceFriction,
        temperature: c.temperature,
        onNamedCorridor,
        matchedCorridor,
      };

      // Keep closer / corridor-matching sensor
      if (
        !existing ||
        (onNamedCorridor && !existing.onNamedCorridor) ||
        candidate.distanceMiles < existing.distanceMiles
      ) {
        sensorMap.set(key, candidate);
      }
    }
  }

  const corridorSensors = Array.from(sensorMap.values()).sort((a, b) => {
    if (a.onNamedCorridor !== b.onNamedCorridor) return a.onNamedCorridor ? -1 : 1;
    return a.distanceMiles - b.distanceMiles;
  });

  if (corridorSensors.length === 0) {
    factors.push(
      `No VTrans RWIS on student corridors within ${CORRIDOR_RADIUS_MILES} mi of ${highSchools
        .map((h) => h.name)
        .join(', ')} — weather forecast still used`
    );
    return {
      highSchools: highSchools.map((h) => ({
        name: h.name,
        city: h.city,
        latitude: h.latitude,
        longitude: h.longitude,
        approachCorridors: h.approachCorridors,
      })),
      corridorSensors: [],
      badRoads: [],
      averageHazard: 0,
      routeHazardScore: 0,
      passable: true,
      summary: `Resolved ${highSchools.map((h) => h.name).join(', ')} but no live VTrans pavement sensors on approach corridors.`,
      factors,
      closingAdjustment: 0,
      delayAdjustment: 5, // slight delay uncertainty without corridor sensors
    };
  }

  // One reading per road, scored on the same scale as the labeled snow days.
  const readingByRoad = new Map<
    string,
    {
      sensor: StudentRouteSensor;
      hazard: number;
      surfaceCondition: string;
      frictionMu: number;
      pavementTempF: number;
      frictionWasMeasured: boolean;
    }
  >();
  for (const sensor of corridorSensors) {
    const trained = trainingHazardFor(sensor);
    const roadName = sensor.matchedCorridor || sensor.route || sensor.stationName;
    const existing = readingByRoad.get(roadName);
    if (!existing || trained.hazard > existing.hazard) {
      readingByRoad.set(roadName, { sensor, ...trained });
    }
  }
  const readings = Array.from(readingByRoad.entries())
    .map(([name, reading]) => ({ name, ...reading }))
    .sort((a, b) => b.hazard - a.hazard);

  // Past calls followed the worst bus road, not the average of every clear station nearby.
  const named = readings.filter((r) => r.sensor.onNamedCorridor);
  const severeOffList = readings.filter(
    (r) => !r.sensor.onNamedCorridor && roadIsBad(r.sensor, r.hazard)
  );
  const decisionPool = named.length > 0 ? [...named, ...severeOffList] : readings;
  decisionPool.sort((a, b) => b.hazard - a.hazard);
  const decision = decisionPool[0];
  const averagePool = named.length > 0 ? named : readings;
  const averageHazard = Math.round(
    averagePool.reduce((s, r) => s + r.hazard, 0) / Math.max(1, averagePool.length)
  );
  const routeHazardScore = decision?.hazard ?? 0;
  const decisionRoad: DecisionRoad | undefined = decision
    ? {
        name: decision.name,
        hazard: decision.hazard,
        condition: decision.sensor.condition,
        surfaceCondition: decision.surfaceCondition,
        frictionMu: decision.frictionMu,
        pavementTempF: decision.pavementTempF,
        frictionWasMeasured: decision.frictionWasMeasured,
      }
    : undefined;

  const badRoads: BadRoad[] = readings
    .filter((r) => roadIsBad(r.sensor, r.hazard))
    .map((r) => ({
      name: r.name,
      reason: `${describeRoad(r.sensor)}${
        r.frictionWasMeasured ? '' : `, μ=${r.frictionMu.toFixed(2)} assumed from past ${r.sensor.condition} calls`
      }`,
      hazard: r.hazard,
      condition: r.sensor.condition,
      distanceMiles: r.sensor.distanceMiles,
      surfaceFriction: r.sensor.surfaceFriction ?? r.frictionMu,
      pavementTemperature: r.sensor.pavementTemperature ?? r.pavementTempF,
    }));

  const icy = corridorSensors.filter((s) => s.condition === 'ice');
  const snowCovered = corridorSensors.filter((s) => s.condition === 'snow-covered');
  const closed = corridorSensors.filter((s) => s.condition === 'closed');
  const lowMu = corridorSensors.filter(
    (s) => s.surfaceFriction !== undefined && s.surfaceFriction < 0.4
  );
  const freezingPavement = corridorSensors.filter(
    (s) => s.pavementTemperature !== undefined && s.pavementTemperature <= 32
  );
  const clearGood = corridorSensors.filter(
    (s) =>
      s.condition === 'clear' &&
      (s.surfaceFriction === undefined || s.surfaceFriction >= 0.55)
  );

  factors.push(
    decisionRoad
      ? `Snow-day call uses the worst bus road, ${decisionRoad.name}, hazard ${routeHazardScore}/100. That matches past Vermont closures: a corridor at 70 or higher was a close. Average of ${averagePool.length} bus-road reading${averagePool.length === 1 ? '' : 's'}: ${averageHazard}/100.`
      : `No bus-road reading to score.`
  );
  if (badRoads.length > 0) {
    badRoads.forEach((road) => {
      factors.push(`Bad road: ${road.name} — ${road.reason} (road hazard ${road.hazard})`);
    });
  }

  // Cite closest corridor sensors
  corridorSensors.slice(0, 4).forEach((s) => {
    const bits = [
      `${s.stationName} (${s.distanceMiles} mi`,
      s.onNamedCorridor ? 'student corridor' : 'near campus',
      `): ${s.condition}`,
    ];
    let line = bits.join(' ');
    if (s.surfaceFriction !== undefined) line += `, μ=${s.surfaceFriction.toFixed(2)}`;
    if (s.pavementTemperature !== undefined) {
      line += `, pavement ${s.pavementTemperature.toFixed(0)}°F`;
    }
    factors.push(`VTrans on student route — ${line}`);
  });

  let closingAdjustment = 0;
  let delayAdjustment = 0;

  // HEAVY weights: bus/student route pavement decides closures (primary signal)
  if (closed.length > 0) {
    closingAdjustment += 55;
    delayAdjustment += 35;
    factors.push(
      `CRITICAL: ${closed.length} closed VTrans sensor(s) on routes to ${highSchools[0].name} — buses cannot run`
    );
  }
  if (icy.length > 0) {
    closingAdjustment += Math.min(50, 28 + icy.length * 8);
    delayAdjustment += Math.min(36, 18 + icy.length * 5);
    factors.push(
      `Ice on student approach routes (${icy
        .slice(0, 3)
        .map((s) => s.stationName)
        .join(', ')}) — high school commute unsafe`
    );
  }
  if (snowCovered.length > 0) {
    closingAdjustment += Math.min(40, 20 + snowCovered.length * 6);
    delayAdjustment += Math.min(30, 14 + snowCovered.length * 5);
    factors.push(
      `Snow-covered pavement on student corridors (${snowCovered.length} VTrans station${
        snowCovered.length > 1 ? 's' : ''
      })`
    );
  }
  if (lowMu.length > 0) {
    closingAdjustment += Math.min(36, 16 + lowMu.length * 6);
    delayAdjustment += Math.min(28, 12 + lowMu.length * 5);
    const worstMu = Math.min(...lowMu.map((s) => s.surfaceFriction ?? 1));
    factors.push(
      `Low surface friction on student routes (worst μ=${worstMu.toFixed(2)}) — bus braking unreliable`
    );
  }
  if (freezingPavement.length > 0) {
    closingAdjustment += Math.min(24, 10 + freezingPavement.length * 4);
    delayAdjustment += Math.min(18, 8 + freezingPavement.length * 3);
    factors.push(
      `Pavement at/below freezing on ${freezingPavement.length} student-route sensor${
        freezingPavement.length > 1 ? 's' : ''
      } — black-ice risk for morning buses`
    );
  }

  // Good corridor conditions can keep schools open even with moderate forecast snow
  if (
    clearGood.length >= Math.max(2, Math.ceil(corridorSensors.length * 0.6)) &&
    icy.length === 0 &&
    closed.length === 0 &&
    snowCovered.length === 0
  ) {
    closingAdjustment -= 20;
    delayAdjustment -= 12;
    factors.push(
      `VTrans: student routes to ${highSchools[0].name} mostly clear with usable grip — favors staying open / delay over full close`
    );
  }

  // Scale adjustments by overall hazard score
  if (routeHazardScore >= 70) {
    closingAdjustment += 22;
    delayAdjustment += 16;
  } else if (routeHazardScore >= 45) {
    closingAdjustment += 12;
    delayAdjustment += 14;
  }

  const passable =
    closed.length === 0 &&
    icy.length === 0 &&
    routeHazardScore < 55 &&
    lowMu.filter((s) => (s.surfaceFriction ?? 1) < 0.35).length === 0;

  const schoolNames = highSchools.map((h) => h.name).join(', ');
  const allCorridors = [...new Set(highSchools.flatMap((h) => h.approachCorridors))];
  const corridorList = `${allCorridors.length} bus corridors`;
  const badLine =
    badRoads.length > 0
      ? ` Specifically bad: ${badRoads
          .map((r) => `${r.name} (${r.reason})`)
          .join('; ')}.`
      : '';
  const summary = `Checked ${schoolNames} (${corridorList}). Call uses the worst bus road${
    decisionRoad ? `, ${decisionRoad.name}, at ${routeHazardScore}/100` : ''
  } — the same worst-road rule as past Vermont snow days. Average of roads with a reading: ${averageHazard}/100.${badLine}`;

  return {
    highSchools: highSchools.map((h) => ({
      name: h.name,
      city: h.city,
      latitude: h.latitude,
      longitude: h.longitude,
      approachCorridors: h.approachCorridors,
    })),
    corridorSensors: corridorSensors.slice(0, 10),
    badRoads,
    decisionRoad,
    averageHazard,
    routeHazardScore,
    passable,
    summary,
    factors,
    closingAdjustment: Math.round(closingAdjustment),
    delayAdjustment: Math.round(delayAdjustment),
  };
}
