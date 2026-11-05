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
  /** 0–100: higher = more unsafe for student/bus travel */
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
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function corridorMatches(routeOrStation: string, corridors: string[]): boolean {
  const hay = normalize(routeOrStation);
  return corridors.some((c) => {
    const needle = normalize(c);
    if (!needle) return false;
    // Match "US-7", "US 7", "Route 7", "VT-116", etc.
    if (hay.includes(needle)) return true;
    const digits = needle.replace(/[^0-9]/g, '');
    if (digits && (hay.includes(`us ${digits}`) || hay.includes(`vt ${digits}`) || hay.includes(`route ${digits}`))) {
      return true;
    }
    return false;
  });
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

function scoreSensorHazard(s: StudentRouteSensor): number {
  let score = 0;
  const cond = (s.condition || '').toLowerCase();

  if (cond === 'closed') score += 40;
  else if (cond === 'ice') score += 35;
  else if (cond === 'snow-covered') score += 28;
  else if (cond === 'wet') score += 8;
  else if (cond === 'clear') score -= 4;

  if (s.surfaceFriction !== undefined) {
    if (s.surfaceFriction < 0.3) score += 32;
    else if (s.surfaceFriction < 0.4) score += 22;
    else if (s.surfaceFriction < 0.5) score += 12;
    else if (s.surfaceFriction >= 0.65) score -= 4;
  }

  if (s.pavementTemperature !== undefined) {
    if (s.pavementTemperature <= 28) score += 14;
    else if (s.pavementTemperature <= 32) score += 10;
    else if (s.pavementTemperature <= 35 && (cond === 'wet' || cond === 'snow-covered')) score += 12;
  }

  // Named student corridors matter more than distant generic sensors
  if (s.onNamedCorridor) score = Math.round(score * 1.35);
  // Closer to campus = more weight
  if (s.distanceMiles <= 5) score = Math.round(score * 1.2);
  else if (s.distanceMiles <= 10) score = Math.round(score * 1.1);

  return score;
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
    'Method: resolve district high school(s) → main morning corridors into campus → score pavement with VTrans RWIS (μ, pavement temp, surface) + sky/weather APIs'
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
    factors.push(
      `School in scope: ${hs.name}${hs.zip ? ` (${hs.zip})` : ''} — main morning corridors: ${hs.approachCorridors.join(', ')}`
    );
  }

  const vtrans = roadConditions.filter((c) => c.source === 'VTrans RWIS');
  const sensorMap = new Map<string, StudentRouteSensor>();

  for (const hs of highSchools) {
    for (const c of vtrans) {
      if (c.latitude == null || c.longitude == null) continue;
      const distanceMiles = haversineMiles(hs.latitude, hs.longitude, c.latitude, c.longitude);
      const onNamedCorridor = corridorMatches(
        `${c.route || ''} ${c.stationName || ''}`,
        hs.approachCorridors
      );

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
      routeHazardScore: 0,
      passable: true,
      summary: `Resolved ${highSchools.map((h) => h.name).join(', ')} but no live VTrans pavement sensors on approach corridors.`,
      factors,
      closingAdjustment: 0,
      delayAdjustment: 5, // slight delay uncertainty without corridor sensors
    };
  }

  // Aggregate hazard from corridor sensors (worst-of + average of top hazards)
  const hazards = corridorSensors.map(scoreSensorHazard).sort((a, b) => b - a);
  const top = hazards.slice(0, 5);
  const avgTop = top.reduce((s, n) => s + n, 0) / top.length;
  const worst = top[0] || 0;
  const routeHazardScore = Math.min(100, Math.round(worst * 0.55 + avgTop * 0.45));

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
  const corridorList = [
    ...new Set(highSchools.flatMap((h) => h.approachCorridors)),
  ]
    .slice(0, 8)
    .join(', ');
  let summary: string;
  if (!passable || routeHazardScore >= 55) {
    summary = `Checked ${schoolNames} main morning corridors (${corridorList}) with VTrans RWIS pavement/μ — hazardous (hazard ${routeHazardScore}/100). Combine with sky/weather APIs for close/delay.`;
  } else if (routeHazardScore >= 30) {
    summary = `Checked ${schoolNames} corridors (${corridorList}) on VTrans RWIS — elevated risk (hazard ${routeHazardScore}/100). Weigh with forecast APIs; delay more likely than full close if plows catch up.`;
  } else {
    summary = `Checked ${schoolNames} corridors (${corridorList}) on VTrans RWIS — mostly passable (hazard ${routeHazardScore}/100). Still combine with sky/weather API forecast.`;
  }

  return {
    highSchools: highSchools.map((h) => ({
      name: h.name,
      city: h.city,
      latitude: h.latitude,
      longitude: h.longitude,
      approachCorridors: h.approachCorridors,
    })),
    corridorSensors: corridorSensors.slice(0, 10),
    routeHazardScore,
    passable,
    summary,
    factors,
    closingAdjustment: Math.round(closingAdjustment),
    delayAdjustment: Math.round(delayAdjustment),
  };
}
