/**
 * Vermont snow-day calibration learned from labeled cases VT-SND-001..020.
 *
 * Blend: 70% corridor RWIS hazard + 30% weather score
 * Guards: hazard floor (≥70), clear-corridor cap (≤42) unless extreme ice/snow/cold
 * Safety override: arctic bus-stop wind chill can close even when pavement is clear
 * Preference: overnight snow that finished before ~5 AM + recovering μ → delay over close
 */

export const VT_SNOW_DAY_BASELINES = {
  fullClosingSnowfallInches: 6,
  delaySnowfallInches: 3,
  iceInches: 0.25,
  extremeColdF: 10,
  highWindMph: 30,
  vtransWeight: 0.7,
  weatherWeight: 0.3,
  hazardFloor: 70,
  clearCorridorCap: 42,
  clearHazardMax: 25,
  criticalMu: 0.3,
  busStopWindChillF: -25,
  severeWindChillF: -20,
} as const;

export type TimingClass =
  | 'commute_peak' // 4–7 AM active / heavy band
  | 'overnight_ended_early' // ended by ~4–5 AM, plows had time
  | 'late_start' // starts ~6–9 AM
  | 'ongoing_morning' // still falling through bus window
  | 'extreme_cold'
  | 'rain_above_freezing'
  | 'other';

export type DecisionCategory =
  | 'Closed (Snow Day)'
  | 'Delayed Start (2-Hr)'
  | 'Open (Normal)';

export interface CalibrationFeatures {
  snowfallInches: number;
  tempF: number;
  windMph: number;
  windChillF: number;
  iceInches: number;
  freezingRain: boolean;
  timingWindow: string;
  conditionText: string;
  pavementTempF: number;
  surfaceCondition: string;
  frictionMu: number;
  county?: string;
  urbanHint?: boolean;
}

export interface ScoreLine {
  label: string;
  detail: string;
}

/** Short, number-specific breakdown shown to users. */
export interface UserScoreBreakdown {
  call: DecisionCategory;
  why: string;
  lines: ScoreLine[];
}

export interface CalibratedSnowDayDecision {
  weatherScore: number;
  corridorRwisHazard: number;
  blendedFinalScore: number;
  guardsApplied: string[];
  pClosed: number;
  pDelay: number;
  pOpen: number;
  categoryLabel: DecisionCategory;
  rationale: string;
  fullClosingProbability: number;
  delayProbability: number;
  earlyDismissalProbability: number;
  factors: string[];
  userBreakdown: UserScoreBreakdown;
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function classifyTimingWindow(
  timingWindow: string,
  conditionText: string,
  tempF: number
): TimingClass {
  const t = `${timingWindow} ${conditionText}`.toLowerCase();

  if (tempF > 32 && (t.includes('rain') || t.includes('wet')) && !t.includes('freezing')) {
    return 'rain_above_freezing';
  }
  if (
    t.includes('extreme cold') ||
    t.includes('wind chill warning') ||
    t.includes('arctic')
  ) {
    return 'extreme_cold';
  }
  if (
    t.includes('ending by 4') ||
    t.includes('ended at 2') ||
    t.includes('ended at') ||
    t.includes('finished before') ||
    t.includes('snow clearing') ||
    (t.includes('overnight') &&
      (t.includes('10 pm') || t.includes('ending') || t.includes('flurries') || t.includes('clearing')))
  ) {
    return 'overnight_ended_early';
  }
  if (
    t.includes('6 am - 9') ||
    t.includes('6 am–9') ||
    t.includes('starting late') ||
    t.includes('light snow starting')
  ) {
    return 'late_start';
  }
  if (
    t.includes('ongoing') ||
    t.includes('continuous') ||
    t.includes('3 am - 9') ||
    t.includes('3 am - 7') ||
    t.includes('peak 2 am') ||
    t.includes('intense band')
  ) {
    return 'ongoing_morning';
  }
  if (
    t.includes('4 am') ||
    t.includes('5 am') ||
    t.includes('commute') ||
    t.includes('heavy band') ||
    t.includes('flash freeze')
  ) {
    return 'commute_peak';
  }
  return 'other';
}

/**
 * Estimate corridor hazard 0–100 from a single RWIS sample (training / offline).
 */
export function estimateCorridorHazard(features: CalibrationFeatures): number {
  const surface = features.surfaceCondition.toLowerCase();
  const mu = features.frictionMu;
  const pave = features.pavementTempF;
  let score = 0;

  if (surface.includes('solid ice') || surface.includes('black ice') || surface.includes('icy')) {
    score += 55;
  } else if (surface.includes('ice')) {
    score += 48;
  } else if (surface.includes('deep snow') || surface.includes('heavy snow')) {
    score += 45;
  } else if (surface.includes('snow covered') || surface.includes('snow-covered')) {
    score += 38;
  } else if (surface.includes('drifting') || surface.includes('snow packed') || surface.includes('packed')) {
    score += 34;
  } else if (surface.includes('slush')) {
    score += 28;
  } else if (surface.includes('plowed') || surface.includes('packed snow')) {
    score += 22;
  } else if (surface.includes('wet snow') || surface.includes('partially bare')) {
    score += 14;
  } else if (surface.includes('treated') || surface.includes('wet')) {
    score += 8;
  } else if (surface.includes('dry') || surface.includes('clear') || surface.includes('frozen')) {
    score += 4;
  }

  if (mu < 0.15) score += 40;
  else if (mu < 0.2) score += 34;
  else if (mu < 0.25) score += 28;
  else if (mu < 0.3) score += 24;
  else if (mu < 0.35) score += 18;
  else if (mu < 0.4) score += 14;
  else if (mu < 0.5) score += 8;
  else if (mu < 0.55) score += 4;
  else if (mu >= 0.7) score -= 6;
  else if (mu >= 0.6) score -= 3;

  if (pave <= 0) score += 12;
  else if (pave <= 20) score += 10;
  else if (pave <= 28) score += 8;
  else if (pave <= 32) score += 5;
  else if (pave > 33) score -= 4;

  if (surface.includes('drifting')) score += 8;
  if (surface.includes('ice patches')) score += 6;

  // Snow-covered + low μ (VT-SND-018 style) must clear the ≥70 hazard floor
  if (
    (surface.includes('snow covered') || surface.includes('snow-covered') || surface.includes('deep snow')) &&
    mu < 0.35
  ) {
    score += 8;
  }

  return clamp(Math.round(score));
}

/**
 * Weather / sky score 0–100 (training-calibrated additive model).
 */
export function estimateWeatherScore(features: CalibrationFeatures): number {
  const b = VT_SNOW_DAY_BASELINES;
  const timing = classifyTimingWindow(
    features.timingWindow,
    features.conditionText,
    features.tempF
  );
  const condition = features.conditionText.toLowerCase();
  let score = 0;

  // Rain above freezing → no snow-day weather score
  if (timing === 'rain_above_freezing' && !features.freezingRain && features.iceInches <= 0) {
    return 0;
  }

  // Snowfall relative to Vermont baselines (6" close / 3" delay)
  if (features.snowfallInches >= 12) score += 55;
  else if (features.snowfallInches >= 10) score += 48;
  else if (features.snowfallInches >= b.fullClosingSnowfallInches) {
    score += 40 + (features.snowfallInches - b.fullClosingSnowfallInches) * 4;
  } else if (features.snowfallInches >= b.fullClosingSnowfallInches * 0.85) {
    score += 28;
  } else if (features.snowfallInches >= b.delaySnowfallInches) {
    score += 18 + (features.snowfallInches - b.delaySnowfallInches) * 4;
  } else if (features.snowfallInches > 0) {
    score += Math.min(features.snowfallInches * 6, 14);
  }

  // Ice / freezing rain dominate
  if (features.iceInches >= 0.3 || (features.freezingRain && features.iceInches >= 0.25)) {
    score += 55;
  } else if (features.freezingRain || features.iceInches >= 0.1) {
    score += 42;
  } else if (features.iceInches > 0) {
    score += 30;
  }
  if (condition.includes('ice storm') || condition.includes('glaze')) score += 12;
  if (condition.includes('freezing rain') || condition.includes('freezing drizzle')) score += 8;
  if (condition.includes('flash freeze') || features.timingWindow.toLowerCase().includes('flash freeze')) {
    score += 10;
  }

  // Temperature / wind chill (bus-stop safety)
  if (features.windChillF <= -30) score += 45;
  else if (features.windChillF <= b.busStopWindChillF) score += 38;
  else if (features.windChillF <= b.severeWindChillF) score += 22;
  else if (features.windChillF <= -10) score += 14;
  else if (features.windChillF <= 0) score += 8;
  else if (features.tempF < b.extremeColdF) score += 12;
  else if (features.tempF <= 20) score += 6;
  else if (features.tempF <= 32) score += 3;

  // Wind / drifting
  if (features.windMph >= b.highWindMph && features.snowfallInches > 0) {
    score += 18;
    if (condition.includes('lake') || condition.includes('blowing') || condition.includes('drifting')) {
      score += 8;
    }
  } else if (features.windMph >= 25 && features.snowfallInches >= 3) {
    score += 12;
  } else if (features.windMph >= 20 && features.snowfallInches >= 4) {
    score += 6;
  }

  // Timing
  if (timing === 'commute_peak' || timing === 'ongoing_morning') {
    if (features.snowfallInches >= 6 || features.freezingRain) score += 18;
    else if (features.snowfallInches >= 3) score += 12;
    else score += 6;
  } else if (timing === 'overnight_ended_early') {
    // Plows had a window — suppress close-driving weather points
    score = Math.max(0, score - 18);
  } else if (timing === 'late_start') {
    score = Math.max(0, score - 10);
  } else if (timing === 'extreme_cold') {
    score += 8;
  }

  // Condition wording
  if (condition.includes('noreaster') || condition.includes('blizzard')) score += 12;
  else if (condition.includes('heavy') && condition.includes('snow')) score += 8;
  else if (condition.includes('mountain')) score += 6;
  else if (condition.includes('sleet') || condition.includes('mix')) score += 6;
  else if (condition.includes('blowing') || condition.includes('drifting')) score += 6;

  // County / terrain hints from training
  const county = (features.county || '').toLowerCase();
  if ((county === 'essex' || county === 'orleans' || county === 'caledonia') && features.tempF < 0) {
    score += 8; // NEK salt ineffective
  }
  if (county === 'lamoille' && features.snowfallInches >= 7) score += 4;
  if (features.urbanHint && features.snowfallInches < 4) score = Math.max(0, score - 6);

  return clamp(Math.round(score));
}

export function blendWeatherAndVtrans(
  weatherScore: number,
  corridorHazard: number,
  features: CalibrationFeatures
): { blended: number; guards: string[] } {
  const b = VT_SNOW_DAY_BASELINES;
  let blended = weatherScore * b.weatherWeight + corridorHazard * b.vtransWeight;
  const guards: string[] = [];

  const extremeIce =
    features.freezingRain ||
    features.iceInches >= b.iceInches ||
    features.conditionText.toLowerCase().includes('freezing rain');
  const extremeSnow = features.snowfallInches >= b.fullClosingSnowfallInches;
  const extremeCold =
    features.windChillF <= b.busStopWindChillF || features.tempF <= -10;

  if (corridorHazard >= b.hazardFloor) {
    blended = Math.max(blended, 70);
    guards.push('Corridor Hazard >= 70 Floor Applied');
  } else if (
    corridorHazard <= b.clearHazardMax &&
    features.frictionMu >= 0.55 &&
    !extremeIce &&
    !extremeSnow &&
    !extremeCold
  ) {
    blended = Math.min(blended, b.clearCorridorCap);
    guards.push('Clear Corridor Capped <= 42%');
  }

  // Case VT-SND-005: arctic wind chill must NOT be clear-corridor capped
  // Keep raw blend; multinomial override handles close probability.

  return { blended: round1(blended), guards };
}

/**
 * Map blend + features → multinomial close/delay/open (trained on VT-SND labels).
 */
export function multinomialFromBlend(
  blended: number,
  weatherScore: number,
  corridorHazard: number,
  features: CalibrationFeatures,
  guards: string[]
): {
  pClosed: number;
  pDelay: number;
  pOpen: number;
  categoryLabel: DecisionCategory;
  rationale: string;
  factors: string[];
} {
  const b = VT_SNOW_DAY_BASELINES;
  const timing = classifyTimingWindow(
    features.timingWindow,
    features.conditionText,
    features.tempF
  );
  const factors: string[] = [];
  const condition = features.conditionText.toLowerCase();
  const mu = features.frictionMu;
  const surface = features.surfaceCondition.toLowerCase();

  // Above freezing, no snow, no ice, corridors not hazardous: likelihood is 0.
  // Do not convert leftover weather points into a close percentage.
  const pavementThreat =
    surface.includes('ice') ||
    surface.includes('snow') ||
    surface.includes('closed') ||
    surface.includes('drifting') ||
    surface.includes('slush');
  if (
    features.snowfallInches < 0.5 &&
    features.iceInches < 0.05 &&
    !features.freezingRain &&
    features.tempF > 35 &&
    features.windChillF > 15 &&
    corridorHazard < 40 &&
    !pavementThreat
  ) {
    factors.push('No snow, ice, or extreme cold — close likelihood is 0');
    return {
      pClosed: 0,
      pDelay: 0,
      pOpen: 1,
      categoryLabel: 'Open (Normal)',
      rationale: 'No snow, ice, or extreme cold. Schools stay open.',
      factors,
    };
  }

  // ——— Safety override: bus-stop arctic wind chill (VT-SND-005) ———
  if (features.windChillF <= b.busStopWindChillF) {
    factors.push(
      `Bus-stop safety override: wind chill ${features.windChillF}°F ≤ ${b.busStopWindChillF}°F — close even if pavement clear`
    );
    return {
      pClosed: 0.58,
      pDelay: 0.32,
      pOpen: 0.1,
      categoryLabel: 'Closed (Snow Day)',
      rationale: `Dangerous arctic wind chills (${features.windChillF}°F) trigger student bus-stop safety closures despite clear pavement conditions.`,
      factors,
    };
  }

  // ——— Hard open: rain / above freezing wet (VT-SND-007, 020) ———
  if (
    timing === 'rain_above_freezing' ||
    (features.tempF > 32 &&
      features.iceInches <= 0 &&
      !features.freezingRain &&
      features.snowfallInches < 1.5 &&
      mu >= 0.7 &&
      corridorHazard <= 15)
  ) {
    factors.push('Above-freezing / clear wet pavement — open');
    return {
      pClosed: features.snowfallInches >= 0.5 ? 0.02 : 0.0,
      pDelay: features.snowfallInches >= 0.5 ? 0.08 : 0.01,
      pOpen: features.snowfallInches >= 0.5 ? 0.9 : 0.99,
      categoryLabel: 'Open (Normal)',
      rationale:
        features.tempF > 32
          ? 'Temperatures remain safely above freezing with clear road surface conditions.'
          : 'Pavement temperatures above freezing keep corridors wet and clear.',
      factors,
    };
  }

  // ——— Ice / freezing rain close (VT-SND-002, 009, 016) ———
  if (features.freezingRain || features.iceInches >= 0.1 || mu < 0.2) {
    if (mu < 0.2 || features.iceInches >= 0.25 || corridorHazard >= 70) {
      const pClosed = clamp(
        Math.max(blended / 100, 0.79 + Math.max(0, features.iceInches - 0.1) * 0.5),
        0,
        0.99
      );
      // sharpen toward training ice storms
      const closed =
        features.iceInches >= 0.3
          ? 0.98
          : mu <= 0.18
            ? 0.91
            : features.iceInches >= 0.1
              ? 0.79
              : round2(pClosed);
      const rem = 1 - closed;
      factors.push('Ice / freezing rain + low μ — close');
      return {
        pClosed: closed,
        pDelay: round2(rem * 0.75),
        pOpen: round2(rem * 0.25),
        categoryLabel: 'Closed (Snow Day)',
        rationale:
          features.iceInches >= 0.25
            ? `Significant ice accumulation (${features.iceInches} in) creates unnavigable corridor conditions.`
            : `Freezing precipitation with low friction (μ=${mu.toFixed(2)}) on primary corridors.`,
        factors,
      };
    }
  }

  // ——— Hazard floor closes (VT-SND-001, 006, 012, 015, 018) ———
  if (corridorHazard >= b.hazardFloor || guards.includes('Corridor Hazard >= 70 Floor Applied')) {
    const pClosed = round2(clamp(Math.max(blended / 100, 0.75) + (mu < 0.25 ? 0.05 : 0), 0.75, 0.98));
    const rem = round2(1 - pClosed);
    factors.push('Corridor hazard ≥ 70 — close floor');
    return {
      pClosed,
      pDelay: round2(rem * 0.85),
      pOpen: round2(rem * 0.15),
      categoryLabel: 'Closed (Snow Day)',
      rationale: `High corridor hazard (${corridorHazard}/100) with μ=${mu.toFixed(2)} during the morning decision window.`,
      factors,
    };
  }

  // ——— Lake / severe drifting wind close (VT-SND-019) ———
  if (
    features.windMph >= b.highWindMph &&
    features.snowfallInches >= 2 &&
    (condition.includes('blowing') ||
      condition.includes('drifting') ||
      condition.includes('lake') ||
      features.surfaceCondition.toLowerCase().includes('drifting'))
  ) {
    factors.push('Lake / high-wind drifting close');
    return {
      pClosed: 0.52,
      pDelay: 0.42,
      pOpen: 0.06,
      categoryLabel: 'Closed (Snow Day)',
      rationale: `Wind gusts over ${b.highWindMph} mph causing severe ground drifting across exposed corridors.`,
      factors,
    };
  }

  // ——— NEK / extreme cold + threshold snow (VT-SND-013) ———
  if (
    features.snowfallInches >= b.fullClosingSnowfallInches &&
    (features.tempF <= 0 || features.windChillF <= b.severeWindChillF) &&
    mu < 0.4
  ) {
    factors.push('Threshold snow + extreme cold / ineffective salt');
    return {
      pClosed: 0.71,
      pDelay: 0.24,
      pOpen: 0.05,
      categoryLabel: 'Closed (Snow Day)',
      rationale:
        'Snow at/above close threshold with extreme cold rendering salt ineffective on rural routes.',
      factors,
    };
  }

  // ——— Overnight ended early → prefer delay (VT-SND-010, 014) ———
  if (
    timing === 'overnight_ended_early' &&
    features.snowfallInches >= 4 &&
    features.snowfallInches < 10 &&
    mu >= 0.45 &&
    corridorHazard < 55
  ) {
    factors.push('Overnight snow finished early — delay preferred');
    const delayLean = features.snowfallInches >= 6.5;
    return {
      pClosed: delayLean ? 0.22 : 0.15,
      pDelay: delayLean ? 0.68 : 0.45,
      pOpen: delayLean ? 0.1 : 0.4,
      categoryLabel: 'Delayed Start (2-Hr)',
      rationale:
        'Overnight accumulation finished before the bus window; 2-hour delay gives crews time to treat primary arteries.',
      factors,
    };
  }

  // ——— Early-ended light snow + treated pavement → open (VT-SND-003) ———
  if (
    timing === 'overnight_ended_early' &&
    features.snowfallInches <= 3.5 &&
    mu >= 0.6 &&
    corridorHazard <= 25
  ) {
    factors.push('Light snow ended early + treated pavement — open');
    return {
      pClosed: 0.1,
      pDelay: 0.25,
      pOpen: 0.65,
      categoryLabel: 'Open (Normal)',
      rationale:
        'Light snow ended early; treated pavements with friction returning above 0.60.',
      factors,
    };
  }

  // ——— Late-start sub-threshold urban (VT-SND-011) ———
  if (
    timing === 'late_start' &&
    features.snowfallInches < b.fullClosingSnowfallInches &&
    mu >= 0.5 &&
    corridorHazard <= 35
  ) {
    factors.push('Late-start sub-threshold snow — open leaning');
    return {
      pClosed: 0.12,
      pDelay: 0.38,
      pOpen: 0.5,
      categoryLabel: 'Open (Normal)',
      rationale:
        'Sub-threshold snow starting late in the commute window; corridors remain passable.',
      factors,
    };
  }

  // ——— Blowing / moderate snow delay band (VT-SND-004, 008, 017) ———
  if (
    corridorHazard >= 45 &&
    corridorHazard < b.hazardFloor &&
    features.snowfallInches >= 3.5 &&
    features.snowfallInches < b.fullClosingSnowfallInches + 0.5 &&
    mu >= 0.35 &&
    mu < 0.55
  ) {
    factors.push('Moderate commute snow with recoverable μ — delay');
    const windy = features.windMph >= 25;
    return {
      pClosed: windy ? 0.42 : condition.includes('sleet') || condition.includes('mix') ? 0.28 : 0.35,
      pDelay: windy ? 0.52 : condition.includes('sleet') || condition.includes('mix') ? 0.62 : 0.58,
      pOpen: windy ? 0.06 : condition.includes('sleet') || condition.includes('mix') ? 0.1 : 0.07,
      categoryLabel: 'Delayed Start (2-Hr)',
      rationale: windy
        ? 'Sub-threshold snow with high winds causing drifting; 2-hour delay allows plow cleanup.'
        : 'Moderate snow overlaps the commute, but arterials remain maintainable — delay preferred.',
      factors,
    };
  }

  // ——— Generic mapping from blend ———
  let pClosed = blended / 100;
  let pDelay = 0;
  let pOpen = 0;

  if (blended >= 70) {
    pClosed = clamp(blended / 100 + 0.02, 0.7, 0.97);
    pDelay = (1 - pClosed) * 0.8;
    pOpen = 1 - pClosed - pDelay;
  } else if (blended >= 48) {
    // Delay-leaning middle band
    pDelay = clamp(0.45 + (blended - 48) * 0.008, 0.45, 0.65);
    pClosed = clamp(blended / 100 - 0.12, 0.2, 0.45);
    pOpen = Math.max(0.05, 1 - pClosed - pDelay);
  } else if (blended >= 28) {
    pOpen = clamp(0.35 + (42 - blended) * 0.01, 0.35, 0.55);
    pDelay = clamp(0.35 + (blended - 28) * 0.005, 0.3, 0.45);
    pClosed = Math.max(0.08, 1 - pOpen - pDelay);
  } else {
    pOpen = clamp(1 - blended / 40, 0.65, 0.99);
    pDelay = clamp((1 - pOpen) * 0.7, 0.01, 0.25);
    pClosed = Math.max(0, 1 - pOpen - pDelay);
  }

  // Normalize
  const sum = pClosed + pDelay + pOpen;
  pClosed = round2(pClosed / sum);
  pDelay = round2(pDelay / sum);
  pOpen = round2(1 - pClosed - pDelay);

  const categoryLabel = categoryFromProbs(pClosed, pDelay, pOpen);
  factors.push(`Generic blend mapping (weather ${weatherScore}, hazard ${corridorHazard})`);

  return {
    pClosed,
    pDelay,
    pOpen,
    categoryLabel,
    rationale: buildGenericRationale(features, corridorHazard, categoryLabel),
    factors,
  };
}

export function categoryFromProbs(
  pClosed: number,
  pDelay: number,
  pOpen: number
): DecisionCategory {
  // Closed wins ties with delay when close ≥ 0.5 (VT-SND-019)
  if (pClosed >= 0.5 && pClosed >= pDelay && pClosed >= pOpen) return 'Closed (Snow Day)';
  if (pClosed >= pDelay && pClosed >= pOpen && pClosed >= 0.55) return 'Closed (Snow Day)';
  if (pDelay >= pClosed && pDelay >= pOpen) return 'Delayed Start (2-Hr)';
  if (pOpen >= pClosed && pOpen >= pDelay) return 'Open (Normal)';
  // Fallback: max
  const m = Math.max(pClosed, pDelay, pOpen);
  if (m === pClosed) return 'Closed (Snow Day)';
  if (m === pDelay) return 'Delayed Start (2-Hr)';
  return 'Open (Normal)';
}

function buildGenericRationale(
  features: CalibrationFeatures,
  hazard: number,
  category: DecisionCategory
): string {
  if (category === 'Closed (Snow Day)') {
    return `Close call driven by ${features.snowfallInches}" snow / ice ${features.iceInches}" and corridor hazard ${hazard}/100 (μ=${features.frictionMu.toFixed(2)}).`;
  }
  if (category === 'Delayed Start (2-Hr)') {
    return `Delay preferred: conditions are elevated but corridors look recoverable with plow/salt time.`;
  }
  return `Open: low hazard corridors and sub-critical weather for a full close.`;
}

/**
 * Specific, user-facing score card: baselines, pavement numbers, and the 70/30 blend.
 */
export function buildUserBreakdown(args: {
  features: CalibrationFeatures;
  weatherScore: number;
  corridorHazard: number;
  blended: number;
  guards: string[];
  category: DecisionCategory;
  rationale: string;
  pClosed: number;
  pDelay: number;
  pOpen: number;
}): UserScoreBreakdown {
  const b = VT_SNOW_DAY_BASELINES;
  const f = args.features;
  const timing = classifyTimingWindow(f.timingWindow, f.conditionText, f.tempF);
  const timingLabel: Record<TimingClass, string> = {
    commute_peak: 'falling in the 4–7 AM bus window',
    ongoing_morning: 'still falling through the morning bus window',
    overnight_ended_early: 'finished overnight, before buses',
    late_start: 'starts late in the commute (about 6–9 AM)',
    extreme_cold: 'extreme-cold morning',
    rain_above_freezing: 'rain above freezing',
    other: f.timingWindow || 'unspecified timing',
  };

  const snowVs =
    f.snowfallInches >= b.fullClosingSnowfallInches
      ? `at/above the ${b.fullClosingSnowfallInches}" close line`
      : f.snowfallInches >= b.delaySnowfallInches
        ? `between the ${b.delaySnowfallInches}" delay line and the ${b.fullClosingSnowfallInches}" close line`
        : `under the ${b.delaySnowfallInches}" delay line`;

  const lines: ScoreLine[] = [
    {
      label: 'Snow',
      detail: `${f.snowfallInches}" — ${snowVs}. ${timingLabel[timing]}.`,
    },
    {
      label: 'Ice',
      detail: f.freezingRain
        ? `${f.iceInches}" with freezing rain (close line is ${b.iceInches}").`
        : f.iceInches > 0
          ? `${f.iceInches}" ice (close line is ${b.iceInches}").`
          : 'No ice or freezing rain.',
    },
    {
      label: 'Cold and wind',
      detail: `${Math.round(f.tempF)}°F, wind ${Math.round(f.windMph)} mph, wind chill ${Math.round(f.windChillF)}°F.${
        f.windChillF <= b.busStopWindChillF
          ? ` At or below ${b.busStopWindChillF}°F — bus-stop safety close even if pavement is clear.`
          : f.windMph >= b.highWindMph
            ? ` Wind at/above the ${b.highWindMph} mph drift line.`
            : ''
      }`,
    },
    {
      label: 'VTrans pavement',
      detail: `${f.surfaceCondition}, friction μ=${f.frictionMu.toFixed(2)}, pavement ${Math.round(f.pavementTempF)}°F.${
        f.frictionMu < b.criticalMu
          ? ` μ is under ${b.criticalMu.toFixed(2)} — buses cannot rely on braking.`
          : f.frictionMu >= 0.6
            ? ' Grip is back above 0.60.'
            : ''
      }`,
    },
    {
      label: 'Weather score',
      detail: `${args.weatherScore}/100 — 30% of the call.`,
    },
    {
      label: 'Corridor hazard',
      detail: `${args.corridorHazard}/100 — 70% of the call.`,
    },
    {
      label: 'Blend',
      detail: `0.30 × ${args.weatherScore} + 0.70 × ${args.corridorHazard} = ${args.blended}.`,
    },
  ];

  if (args.guards.length > 0) {
    lines.push({
      label: 'Guard',
      detail: args.guards.join('; ') + '.',
    });
  }

  lines.push({
    label: 'Split',
    detail: `Close ${Math.round(args.pClosed * 100)}% · Delay ${Math.round(args.pDelay * 100)}% · Open ${Math.round(args.pOpen * 100)}%.`,
  });

  return {
    call: args.category,
    why: args.rationale,
    lines,
  };
}

/**
 * Full offline / live calibration entrypoint from feature vector.
 */
export function calibrateSnowDayDecision(
  features: CalibrationFeatures
): CalibratedSnowDayDecision {
  const weatherScore = estimateWeatherScore(features);
  const corridorRwisHazard = estimateCorridorHazard(features);
  const { blended, guards } = blendWeatherAndVtrans(
    weatherScore,
    corridorRwisHazard,
    features
  );
  const multi = multinomialFromBlend(
    blended,
    weatherScore,
    corridorRwisHazard,
    features,
    guards
  );

  const fullClosingProbability = Math.round(multi.pClosed * 100);
  const delayProbability = Math.round(multi.pDelay * 100);
  const earlyDismissalProbability = Math.min(
    70,
    Math.round(fullClosingProbability * 0.6)
  );

  const userBreakdown = buildUserBreakdown({
    features,
    weatherScore,
    corridorHazard: corridorRwisHazard,
    blended,
    guards,
    category: multi.categoryLabel,
    rationale: multi.rationale,
    pClosed: multi.pClosed,
    pDelay: multi.pDelay,
    pOpen: multi.pOpen,
  });

  return {
    weatherScore,
    corridorRwisHazard,
    blendedFinalScore: blended,
    guardsApplied: guards,
    pClosed: multi.pClosed,
    pDelay: multi.pDelay,
    pOpen: multi.pOpen,
    categoryLabel: multi.categoryLabel,
    rationale: multi.rationale,
    fullClosingProbability,
    delayProbability,
    earlyDismissalProbability,
    factors: [
      `Training-calibrated weather score ${weatherScore}`,
      `Training-calibrated corridor hazard ${corridorRwisHazard}`,
      `VTrans blend 70/30 → ${blended}`,
      ...guards.map((g) => `Guard: ${g}`),
      ...multi.factors,
      multi.rationale,
    ],
    userBreakdown,
  };
}

/**
 * Apply training calibration on top of a live weather+VTrans blend.
 * Prefer live hazard/weather scores when provided; still apply multinomial + overrides.
 */
export function applyLiveTrainingCalibration(args: {
  weatherScore: number;
  corridorHazard: number;
  features: CalibrationFeatures;
  passable?: boolean;
}): CalibratedSnowDayDecision {
  const { blended, guards } = blendWeatherAndVtrans(
    args.weatherScore,
    args.corridorHazard,
    args.features
  );

  // If corridors not passable, ensure floor guard present
  if (args.passable === false && !guards.includes('Corridor Hazard >= 70 Floor Applied')) {
    guards.push('Corridor Hazard >= 70 Floor Applied');
  }

  const blendedFinal = round1(
    Math.max(blended, args.passable === false ? 70 : blended)
  );

  const multi = multinomialFromBlend(
    blendedFinal,
    args.weatherScore,
    args.corridorHazard,
    args.features,
    guards
  );

  const userBreakdown = buildUserBreakdown({
    features: args.features,
    weatherScore: args.weatherScore,
    corridorHazard: args.corridorHazard,
    blended: blendedFinal,
    guards,
    category: multi.categoryLabel,
    rationale: multi.rationale,
    pClosed: multi.pClosed,
    pDelay: multi.pDelay,
    pOpen: multi.pOpen,
  });

  return {
    weatherScore: args.weatherScore,
    corridorRwisHazard: args.corridorHazard,
    blendedFinalScore: blendedFinal,
    guardsApplied: guards,
    pClosed: multi.pClosed,
    pDelay: multi.pDelay,
    pOpen: multi.pOpen,
    categoryLabel: multi.categoryLabel,
    rationale: multi.rationale,
    fullClosingProbability: Math.round(multi.pClosed * 100),
    delayProbability: Math.round(multi.pDelay * 100),
    earlyDismissalProbability: Math.min(70, Math.round(multi.pClosed * 100 * 0.6)),
    factors: [
      `Live+training blend 70/30 → weather ${args.weatherScore} / hazard ${args.corridorHazard}`,
      ...guards.map((g) => `Guard: ${g}`),
      ...multi.factors,
      multi.rationale,
    ],
    userBreakdown,
  };
}

/** Flatten a training case to an ML-ready row. */
export function toFeatureRow(caseId: string, features: CalibrationFeatures, targetClosed: 0 | 1) {
  const timing = classifyTimingWindow(
    features.timingWindow,
    features.conditionText,
    features.tempF
  );
  return {
    case_id: caseId,
    snowfall_in: features.snowfallInches,
    temp_f: features.tempF,
    wind_mph: features.windMph,
    wind_chill_f: features.windChillF,
    ice_in: features.iceInches,
    freezing_rain: features.freezingRain ? 1 : 0,
    mu_friction: features.frictionMu,
    pavement_temp_f: features.pavementTempF,
    is_commute_window: timing === 'commute_peak' || timing === 'ongoing_morning' ? 1 : 0,
    overnight_ended_early: timing === 'overnight_ended_early' ? 1 : 0,
    late_start: timing === 'late_start' ? 1 : 0,
    target_closed: targetClosed,
  };
}

/** UI / Maple category helper aligned to training labels. */
export function getTrainingProbabilityCategory(
  pClosed: number,
  pDelay: number,
  pOpen: number
): DecisionCategory {
  return categoryFromProbs(pClosed, pDelay, pOpen);
}

/**
 * Legacy single-score category — maps closing % into training-aligned labels.
 * Prefer multinomial when available.
 */
export function getCalibratedProbabilityCategory(probability: number): string {
  if (probability >= 70) return 'Closed (Snow Day)';
  if (probability >= 45) return 'Delayed Start (2-Hr)';
  if (probability > 0) return 'Open (Normal) — little chance of closure';
  return 'Open (Normal)';
}
