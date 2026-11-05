/**
 * Detailed 8-Factor Road Safety Scoring
 *
 * True weighted average (weights sum to 100). Vermont-specific signals:
 * VTrans RWIS friction (μ), pavement vs air temp, ZIP-local context,
 * wind, bridge/mountain routes, commute windows, API fallback awareness.
 */

import { RoadCondition } from './roadDataService';

export interface FactorDetail {
  score: number; // 0–100, higher = safer for this factor
  weight: number; // contribution weight (sum = 100)
  description: string;
  label: string;
}

export interface DetailedRoadSafetyScore {
  safetyScore: number; // 0-100, higher is safer
  safetyLevel: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
  severity: 'low' | 'moderate' | 'high' | 'extreme';
  factors: {
    baseCondition: FactorDetail;
    temperature: FactorDetail;
    dataFreshness: FactorDetail;
    severity: FactorDetail;
    sourceReliability: FactorDetail;
    roadType: FactorDetail;
    timeOfDay: FactorDetail;
    combinationEffects: FactorDetail;
  };
  /** Ranked factors that most hurt the score (for interactive UI) */
  topRisks: Array<{ label: string; score: number; description: string }>;
  /** Concrete, citeable bullets for Maple / popups */
  actionableInsights: string[];
  headline: string;
  explanation: string;
  confidence: number;
  metrics: {
    airTempF?: number;
    pavementTempF?: number;
    frictionMu?: number;
    windMph?: number;
    dataAgeMinutes: number;
    stationName?: string;
    route: string;
    source: string;
  };
}

const SOURCE_RELIABILITY: Record<string, number> = {
  'VTrans RWIS': 100,
  'VTrans Lane Closures': 95,
  'VTrans Lane Closure': 95,
  'VTrans Incidents': 95,
  'VTrans Incident': 95,
  NWS: 90,
  Xweather: 80,
  TomTom: 75,
  'New England 511': 70,
  Weatherbit: 70,
  Weatherstack: 65,
  'Visual Crossing': 65,
  OpenWeatherMap: 60,
  'Weather-Based Prediction': 55,
  Unknown: 50,
};

const WEIGHTS = {
  baseCondition: 32,
  temperature: 18,
  dataFreshness: 10,
  severity: 12,
  sourceReliability: 8,
  roadType: 6,
  timeOfDay: 6,
  combinationEffects: 8,
} as const;

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function frictionLabel(mu: number): string {
  if (mu < 0.4) return 'extremely slippery';
  if (mu < 0.55) return 'very slippery';
  if (mu < 0.65) return 'slippery';
  if (mu < 0.75) return 'reduced grip';
  return 'good grip';
}

/**
 * Calculate detailed road safety score (true 8-factor weighted average)
 */
export async function calculateDetailedRoadSafetyScore(
  condition: RoadCondition,
  weatherContext?: {
    temperature?: number; // Fahrenheit
    windSpeed?: number; // mph
    humidity?: number;
    visibilityMiles?: number;
  }
): Promise<DetailedRoadSafetyScore> {
  const insights: string[] = [];
  const stationLabel =
    condition.stationName ||
    condition.locationDescription ||
    condition.route ||
    'this road';

  // Prefer RWIS pavement temp for surface risk; air from sensor or weather API
  const pavementTempF = condition.pavementTemperature;
  let airTempF =
    condition.temperature !== undefined
      ? condition.temperature
      : weatherContext?.temperature;

  // Legacy Celsius guard for non-RWIS sources only
  if (
    airTempF !== undefined &&
    condition.source !== 'VTrans RWIS' &&
    airTempF < -10
  ) {
    airTempF = Math.round(airTempF * (9 / 5) + 32);
  }

  const surfaceTempF =
    pavementTempF !== undefined ? pavementTempF : airTempF;
  const windMph =
    condition.windSpeed ?? weatherContext?.windSpeed ?? undefined;
  const humidity = weatherContext?.humidity;
  const frictionMu = condition.surfaceFriction;

  const dataAgeMs = Date.now() - new Date(condition.timestamp).getTime();
  const dataAgeMinutes = Math.max(
    0,
    Math.floor(dataAgeMs / (60 * 1000))
  );
  const dataAgeHours = dataAgeMinutes / 60;

  // Vermont local hour for commute / freeze windows
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'America/New_York',
    }).format(new Date())
  );
  const isNightOrEarlyMorning = hour >= 22 || hour <= 7;
  const isCommuteWindow = hour >= 4 && hour <= 9;
  const isDecisionWindow = hour >= 4 && hour <= 6;

  // ——— FACTOR 1: Base surface condition (+ RWIS friction) ———
  let baseScore = 70;
  let baseDesc = '';
  switch (condition.condition) {
    case 'closed':
      baseScore = 5;
      baseDesc = `${stationLabel}: CLOSED — do not travel this segment`;
      break;
    case 'ice':
      baseScore = 18;
      baseDesc = `${stationLabel}: ICE on pavement`;
      break;
    case 'snow-covered':
      baseScore = 32;
      baseDesc = `${stationLabel}: snow-covered`;
      break;
    case 'wet':
      baseScore = 58;
      baseDesc = `${stationLabel}: wet pavement`;
      break;
    case 'clear':
      baseScore = 96;
      baseDesc = `${stationLabel}: clear/dry pavement`;
      break;
    default:
      baseScore = 48;
      baseDesc = `${stationLabel}: surface unknown`;
  }

  if (frictionMu !== undefined) {
    if (frictionMu < 0.4) {
      baseScore = Math.min(baseScore, 12);
      baseDesc += ` | μ=${frictionMu.toFixed(2)} (${frictionLabel(frictionMu)})`;
      insights.push(
        `Critical low grip at ${stationLabel}: friction μ=${frictionMu.toFixed(2)}`
      );
    } else if (frictionMu < 0.55) {
      baseScore = Math.min(baseScore, 28);
      baseDesc += ` | μ=${frictionMu.toFixed(2)} (${frictionLabel(frictionMu)})`;
      insights.push(
        `Very slippery at ${stationLabel}: μ=${frictionMu.toFixed(2)}`
      );
    } else if (frictionMu < 0.65) {
      baseScore = Math.min(baseScore, Math.max(36, baseScore - 18));
      baseDesc += ` | μ=${frictionMu.toFixed(2)} (${frictionLabel(frictionMu)})`;
    } else if (frictionMu >= 0.78 && condition.condition === 'clear') {
      baseScore = Math.max(baseScore, 96);
      baseDesc += ` | μ=${frictionMu.toFixed(2)} (good grip)`;
    } else {
      baseDesc += ` | μ=${frictionMu.toFixed(2)}`;
    }
  } else if (condition.source !== 'VTrans RWIS') {
    baseDesc += ' | no RWIS friction — using condition + weather APIs';
  }

  // ——— FACTOR 2: Temperature (pavement-first) ———
  let tempScore = 72;
  let tempDesc = 'No temperature for this point — moderate assumption';
  const tempForRisk = surfaceTempF;

  if (tempForRisk !== undefined) {
    const which =
      pavementTempF !== undefined ? 'pavement' : 'air';
    if (tempForRisk <= 15) {
      tempScore = 12;
      tempDesc = `${which} ${tempForRisk.toFixed(0)}°F — extreme freeze risk`;
    } else if (tempForRisk <= 25) {
      tempScore = 28;
      tempDesc = `${which} ${tempForRisk.toFixed(0)}°F — high ice formation risk`;
    } else if (tempForRisk <= 32) {
      tempScore = 48;
      tempDesc = `${which} ${tempForRisk.toFixed(0)}°F — at/below freezing`;
    } else if (tempForRisk <= 35) {
      tempScore = 68;
      tempDesc = `${which} ${tempForRisk.toFixed(0)}°F — near freezing`;
    } else if (tempForRisk <= 40) {
      tempScore = 84;
      tempDesc = `${which} ${tempForRisk.toFixed(0)}°F — cold, shaded ice possible`;
    } else {
      tempScore = 96;
      tempDesc = `${which} ${tempForRisk.toFixed(0)}°F — above freezing`;
    }

    if (
      pavementTempF !== undefined &&
      airTempF !== undefined &&
      Math.abs(pavementTempF - airTempF) >= 5
    ) {
      tempDesc += ` (air ${airTempF.toFixed(0)}°F, pavement ${pavementTempF.toFixed(0)}°F)`;
      if (pavementTempF <= 32 && airTempF > 32) {
        tempScore = Math.min(tempScore, 40);
        tempDesc += ' — pavement freezing while air is above 32°F';
        insights.push(
          `Pavement colder than air at ${stationLabel}: ${pavementTempF.toFixed(0)}°F vs ${airTempF.toFixed(0)}°F air`
        );
      }
    }

    if (condition.condition === 'wet' && tempForRisk <= 35) {
      tempScore = Math.min(tempScore, tempForRisk <= 32 ? 30 : 50);
      tempDesc += ' — wet + cold = freeze risk';
      insights.push(
        `Wet pavement near freezing at ${stationLabel} (${tempForRisk.toFixed(0)}°F)`
      );
    }
    if (condition.condition === 'ice' && tempForRisk <= 28) {
      tempScore = Math.min(tempScore, 15);
    }
    if (humidity !== undefined && humidity > 85 && tempForRisk <= 35) {
      tempScore = Math.max(0, tempScore - 10);
      tempDesc += ` | humidity ${humidity}%`;
    }
  }

  // ——— FACTOR 3: Data freshness ———
  let freshnessScore = 100;
  let freshnessDesc = '';
  if (dataAgeMinutes <= 15) {
    freshnessScore = 100;
    freshnessDesc = `Live (${dataAgeMinutes} min old)`;
  } else if (dataAgeMinutes <= 45) {
    freshnessScore = 92;
    freshnessDesc = `Fresh (${dataAgeMinutes} min old)`;
  } else if (dataAgeMinutes <= 90) {
    freshnessScore = 80;
    freshnessDesc = `Recent (${dataAgeMinutes} min old)`;
  } else if (dataAgeHours <= 3) {
    freshnessScore = 60;
    freshnessDesc = `${dataAgeHours.toFixed(1)} h old — may have changed`;
    if (condition.condition === 'ice' || condition.condition === 'closed') {
      freshnessScore = 40;
      freshnessDesc += ' (stale for ice/closure)';
    }
  } else if (dataAgeHours <= 8) {
    freshnessScore = 35;
    freshnessDesc = `${dataAgeHours.toFixed(0)} h old — outdated`;
    if (condition.condition === 'ice' || condition.condition === 'closed') {
      freshnessScore = 20;
    }
  } else {
    freshnessScore = 15;
    freshnessDesc = `${dataAgeHours.toFixed(0)} h old — unreliable`;
  }

  // ——— FACTOR 4: Reported severity ———
  let severityFactorScore = 85;
  let severityDesc = 'No explicit severity — inferred from condition';
  if (condition.severity === 'MAJOR') {
    severityFactorScore = 18;
    severityDesc = 'MAJOR severity';
  } else if (condition.severity === 'MODERATE') {
    severityFactorScore = 48;
    severityDesc = 'MODERATE severity';
  } else if (condition.severity === 'MINOR') {
    severityFactorScore = 78;
    severityDesc = 'MINOR severity';
  } else if (
    condition.condition === 'closed' ||
    condition.condition === 'ice'
  ) {
    severityFactorScore = 35;
    severityDesc = 'Inferred high severity (ice/closure)';
  }

  // ——— FACTOR 5: Source reliability ———
  const sourceScore =
    SOURCE_RELIABILITY[condition.source] ?? SOURCE_RELIABILITY.Unknown;
  const sourceDesc = `${condition.source} (trust ${sourceScore}/100)`;
  if (condition.source === 'VTrans RWIS') {
    insights.push(
      `Ground truth from VTrans RWIS at ${stationLabel}`
    );
  } else if (
    condition.source === 'NWS' ||
    condition.source === 'TomTom' ||
    condition.source === 'Xweather'
  ) {
    insights.push(
      `API layer (${condition.source}) used for ${condition.route || stationLabel}`
    );
  }

  // ——— FACTOR 6: Road type / Vermont geography ———
  let roadTypeScore = 90;
  let roadTypeDesc = 'Local / secondary road';
  const route = (condition.route || condition.stationName || '').toLowerCase();
  const loc = (condition.locationDescription || '').toLowerCase();
  const combined = `${route} ${loc}`;

  if (
    combined.includes('i-89') ||
    combined.includes('i-91') ||
    combined.includes('i-93') ||
    combined.includes('interstate')
  ) {
    // Interstates: high consequence when bad; slightly safer baseline when clear
    roadTypeScore = condition.condition === 'clear' ? 92 : 78;
    roadTypeDesc = 'Interstate — high volume / high consequence when hazardous';
  } else if (combined.includes('us-') || combined.includes('us ')) {
    roadTypeScore = condition.condition === 'clear' ? 90 : 80;
    roadTypeDesc = 'US route — significant traffic';
  } else if (combined.includes('vt-') || combined.includes('vt ')) {
    roadTypeScore = condition.condition === 'clear' ? 88 : 82;
    roadTypeDesc = 'Vermont state route';
  }

  if (
    combined.includes('bridge') ||
    combined.includes('gap') ||
    combined.includes('mountain') ||
    combined.includes('notch') ||
    combined.includes('pass')
  ) {
    roadTypeScore = Math.max(55, roadTypeScore - 15);
    roadTypeDesc += ' — bridge/mountain exposure (ice/wind prone)';
    insights.push(
      `Elevated exposure (bridge/mountain/pass) near ${stationLabel}`
    );
  }

  // ——— FACTOR 7: Time of day (VT commute / freeze) ———
  let timeScore = 95;
  let timeDesc = `Vermont ${hour}:00 ET — normal risk window`;
  if (isDecisionWindow && surfaceTempF !== undefined && surfaceTempF <= 35) {
    timeScore = 55;
    timeDesc = `4–6 AM decision window + cold (${surfaceTempF.toFixed(0)}°F) — school/bus critical`;
  } else if (isCommuteWindow && (condition.condition === 'ice' || condition.condition === 'snow-covered' || (condition.condition === 'wet' && surfaceTempF !== undefined && surfaceTempF <= 35))) {
    timeScore = 60;
    timeDesc = `Morning commute (${hour}:00 ET) + hazardous surface`;
  } else if (isNightOrEarlyMorning && surfaceTempF !== undefined && surfaceTempF <= 35) {
    timeScore = 70;
    timeDesc = `Night/early morning (${hour}:00 ET) — refreeze risk`;
    if (condition.condition === 'wet') {
      timeScore = 55;
      timeDesc += ' on wet pavement';
    }
  }

  // ——— FACTOR 8: Combination effects (multiplicative hazards) ———
  let comboScore = 100;
  let comboDesc = 'No stacked hazard multipliers';
  const wind = windMph ?? 0;

  if (condition.condition === 'ice' && tempForRisk !== undefined && tempForRisk <= 20) {
    comboScore = 5;
    comboDesc = 'ICE + EXTREME COLD stacked';
  } else if (condition.condition === 'ice' && wind >= 25) {
    comboScore = 25;
    comboDesc = `ICE + wind ${wind.toFixed(0)} mph`;
  } else if (condition.condition === 'snow-covered' && wind >= 30) {
    comboScore = 35;
    comboDesc = `SNOW + blowing wind ${wind.toFixed(0)} mph`;
  } else if (
    condition.condition === 'wet' &&
    tempForRisk !== undefined &&
    tempForRisk <= 35 &&
    isNightOrEarlyMorning
  ) {
    comboScore = 42;
    comboDesc = 'WET + COLD + NIGHT refreeze stack';
  } else if (
    frictionMu !== undefined &&
    frictionMu < 0.6 &&
    (condition.condition === 'wet' || condition.condition === 'ice')
  ) {
    comboScore = frictionMu < 0.5 ? 22 : 40;
    comboDesc = `LOW FRICTION μ=${frictionMu.toFixed(2)} + ${condition.condition}`;
  } else if (wind >= 40) {
    comboScore = 55;
    comboDesc = `High wind ${wind.toFixed(0)} mph — vehicle control / drifting risk`;
    insights.push(`High wind ${wind.toFixed(0)} mph at ${stationLabel}`);
  } else if (
    condition.condition === 'closed' &&
    (condition.warning || '').toLowerCase().includes('ice')
  ) {
    comboScore = 8;
    comboDesc = 'CLOSED due to ice';
  }

  if (wind >= 20 && wind < 40 && condition.condition !== 'clear') {
    insights.push(`Wind ${wind.toFixed(0)} mph with ${condition.condition} surface`);
  }

  const factors: DetailedRoadSafetyScore['factors'] = {
    baseCondition: {
      score: clamp(baseScore),
      weight: WEIGHTS.baseCondition,
      description: baseDesc,
      label: 'Pavement / surface',
    },
    temperature: {
      score: clamp(tempScore),
      weight: WEIGHTS.temperature,
      description: tempDesc,
      label: 'Temperature',
    },
    dataFreshness: {
      score: clamp(freshnessScore),
      weight: WEIGHTS.dataFreshness,
      description: freshnessDesc,
      label: 'Data freshness',
    },
    severity: {
      score: clamp(severityFactorScore),
      weight: WEIGHTS.severity,
      description: severityDesc,
      label: 'Severity',
    },
    sourceReliability: {
      score: clamp(sourceScore),
      weight: WEIGHTS.sourceReliability,
      description: sourceDesc,
      label: 'Source trust',
    },
    roadType: {
      score: clamp(roadTypeScore),
      weight: WEIGHTS.roadType,
      description: roadTypeDesc,
      label: 'Road / terrain',
    },
    timeOfDay: {
      score: clamp(timeScore),
      weight: WEIGHTS.timeOfDay,
      description: timeDesc,
      label: 'Time of day',
    },
    combinationEffects: {
      score: clamp(comboScore),
      weight: WEIGHTS.combinationEffects,
      description: comboDesc,
      label: 'Stacked hazards',
    },
  };

  // True weighted average
  const weightSum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let totalScore =
    (factors.baseCondition.score * WEIGHTS.baseCondition +
      factors.temperature.score * WEIGHTS.temperature +
      factors.dataFreshness.score * WEIGHTS.dataFreshness +
      factors.severity.score * WEIGHTS.severity +
      factors.sourceReliability.score * WEIGHTS.sourceReliability +
      factors.roadType.score * WEIGHTS.roadType +
      factors.timeOfDay.score * WEIGHTS.timeOfDay +
      factors.combinationEffects.score * WEIGHTS.combinationEffects) /
    weightSum;

  // Extra hard caps for must-avoid situations
  if (condition.condition === 'closed') {
    totalScore = Math.min(totalScore, 15);
  }
  if (condition.condition === 'ice' && (frictionMu === undefined || frictionMu < 0.55)) {
    totalScore = Math.min(totalScore, 35);
  }
  if (
    (condition.condition === 'ice' || condition.condition === 'closed') &&
    dataAgeHours > 3
  ) {
    totalScore = Math.max(0, totalScore - Math.min(15, dataAgeHours * 2));
  }

  totalScore = clamp(totalScore);

  let safetyLevel: DetailedRoadSafetyScore['safetyLevel'];
  let severityOut: DetailedRoadSafetyScore['severity'];
  if (totalScore >= 85) {
    safetyLevel = 'excellent';
    severityOut = 'low';
  } else if (totalScore >= 70) {
    safetyLevel = 'good';
    severityOut = 'low';
  } else if (totalScore >= 50) {
    safetyLevel = 'caution';
    severityOut = 'moderate';
  } else if (totalScore >= 30) {
    safetyLevel = 'poor';
    severityOut = 'high';
  } else {
    safetyLevel = 'hazardous';
    severityOut = 'extreme';
  }

  // Confidence: more sensors/metrics + freshness + official source
  let confidence = 62;
  if (frictionMu !== undefined) confidence += 12;
  if (pavementTempF !== undefined) confidence += 8;
  if (airTempF !== undefined) confidence += 5;
  if (condition.source.includes('VTrans') || condition.source === 'NWS') {
    confidence += 8;
  }
  if (dataAgeMinutes <= 30) confidence += 6;
  else if (dataAgeHours > 3) confidence -= 18;
  if (condition.condition === 'unknown') confidence -= 12;
  if (!frictionMu && condition.source !== 'VTrans RWIS') confidence -= 5;
  confidence = clamp(confidence, 40, 99);

  const factorList = Object.values(factors);
  const topRisks = [...factorList]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((f) => ({
      label: f.label,
      score: Math.round(f.score),
      description: f.description,
    }));

  if (insights.length === 0) {
    insights.push(
      `${stationLabel}: ${condition.condition} — score ${Math.round(totalScore)}/100 (${safetyLevel})`
    );
  }

  const headline = `${condition.route || stationLabel}: ${Math.round(totalScore)}/100 ${safetyLevel.toUpperCase()} — ${condition.condition}${
    frictionMu !== undefined ? ` · μ=${frictionMu.toFixed(2)}` : ''
  }${
    surfaceTempF !== undefined ? ` · ${surfaceTempF.toFixed(0)}°F surface` : ''
  }`;

  const explanation = [
    headline,
    baseDesc,
    tempDesc,
    freshnessDesc,
    severityDesc,
    sourceDesc,
    roadTypeDesc,
    timeDesc,
    comboDesc,
  ].join(' · ');

  return {
    safetyScore: Math.round(totalScore),
    safetyLevel,
    severity: severityOut,
    factors,
    topRisks,
    actionableInsights: insights.slice(0, 6),
    headline,
    explanation,
    confidence: Math.round(confidence),
    metrics: {
      airTempF: airTempF !== undefined ? Math.round(airTempF) : undefined,
      pavementTempF:
        pavementTempF !== undefined ? Math.round(pavementTempF) : undefined,
      frictionMu,
      windMph: windMph !== undefined ? Math.round(windMph) : undefined,
      dataAgeMinutes,
      stationName: condition.stationName,
      route: condition.route || stationLabel,
      source: condition.source,
    },
  };
}

/** Compact multi-line block for Maple / AI prompts */
export function formatDetailedScoreForAI(score: DetailedRoadSafetyScore): string {
  let out = `${score.headline}\n`;
  out += `Confidence ${score.confidence}% · Severity ${score.severity}\n`;
  out += '8-factor breakdown (higher = safer):\n';
  Object.values(score.factors).forEach((f) => {
    out += `  • ${f.label} (w=${f.weight}): ${Math.round(f.score)}/100 — ${f.description}\n`;
  });
  if (score.topRisks.length) {
    out += 'Top risks:\n';
    score.topRisks.forEach((r, i) => {
      out += `  ${i + 1}. ${r.label} (${r.score}/100): ${r.description}\n`;
    });
  }
  score.actionableInsights.forEach((i) => {
    out += `→ ${i}\n`;
  });
  return out;
}
