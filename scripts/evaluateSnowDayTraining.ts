/**
 * Evaluate VT-SND-001..020 training cases against the calibrated scorer.
 *
 * Usage: npx tsx scripts/evaluateSnowDayTraining.ts
 */
import fs from 'fs';
import path from 'path';
import {
  calibrateSnowDayDecision,
  toFeatureRow,
  type CalibrationFeatures,
  type DecisionCategory,
} from '../lib/training/snowDayCalibration';

interface TrainingCase {
  id: string;
  district_info: { county: string; high_school: string; zip_code: string };
  weather_inputs: {
    snowfall_inches: number;
    temp_f: number;
    wind_mph: number;
    wind_chill_f: number;
    ice_inches: number;
    freezing_rain: boolean;
    timing_window: string;
    condition_text: string;
  };
  rwis_inputs: {
    pavement_temp_f: number;
    surface_condition: string;
    friction_coefficient_mu: number;
  };
  scoring_breakdown: {
    weather_score: number;
    corridor_rwis_hazard: number;
    blended_final_score: number;
    guards_applied: string[];
  };
  outputs: {
    p_closed: number;
    p_delay: number;
    p_open: number;
    category_label: DecisionCategory;
    rationale: string;
  };
}

function featuresFromCase(c: TrainingCase): CalibrationFeatures {
  const urban = ['Chittenden'].includes(c.district_info.county) &&
    /south burlington|burlington/i.test(c.district_info.high_school);
  return {
    snowfallInches: c.weather_inputs.snowfall_inches,
    tempF: c.weather_inputs.temp_f,
    windMph: c.weather_inputs.wind_mph,
    windChillF: c.weather_inputs.wind_chill_f,
    iceInches: c.weather_inputs.ice_inches,
    freezingRain: c.weather_inputs.freezing_rain,
    timingWindow: c.weather_inputs.timing_window,
    conditionText: c.weather_inputs.condition_text,
    pavementTempF: c.rwis_inputs.pavement_temp_f,
    surfaceCondition: c.rwis_inputs.surface_condition,
    frictionMu: c.rwis_inputs.friction_coefficient_mu,
    county: c.district_info.county,
    urbanHint: urban,
  };
}

function mae(a: number, b: number): number {
  return Math.abs(a - b);
}

function main() {
  const root = path.join(__dirname, '..');
  const casesPath = path.join(root, 'data/training/vt-snow-day-cases.json');
  const raw = JSON.parse(fs.readFileSync(casesPath, 'utf8')) as {
    cases: TrainingCase[];
  };

  const rows: string[] = [
    'case_id,snowfall_in,temp_f,wind_mph,wind_chill_f,ice_in,freezing_rain,mu_friction,pavement_temp_f,is_commute_window,overnight_ended_early,late_start,target_closed,pred_category,actual_category,category_match,p_closed_pred,p_closed_actual,p_closed_err',
  ];

  let categoryHits = 0;
  let closeMae = 0;
  let weatherMae = 0;
  let hazardMae = 0;
  let blendMae = 0;
  const misses: string[] = [];

  for (const c of raw.cases) {
    const features = featuresFromCase(c);
    const pred = calibrateSnowDayDecision(features);
    const catMatch = pred.categoryLabel === c.outputs.category_label;
    if (catMatch) categoryHits++;
    else {
      misses.push(
        `${c.id}: pred=${pred.categoryLabel} actual=${c.outputs.category_label} ` +
          `(pC=${pred.pClosed}/${c.outputs.p_closed}, hazard=${pred.corridorRwisHazard}/${c.scoring_breakdown.corridor_rwis_hazard}, weather=${pred.weatherScore}/${c.scoring_breakdown.weather_score})`
      );
    }

    closeMae += mae(pred.pClosed, c.outputs.p_closed);
    weatherMae += mae(pred.weatherScore, c.scoring_breakdown.weather_score);
    hazardMae += mae(pred.corridorRwisHazard, c.scoring_breakdown.corridor_rwis_hazard);
    blendMae += mae(pred.blendedFinalScore, c.scoring_breakdown.blended_final_score);

    const targetClosed: 0 | 1 = c.outputs.category_label.startsWith('Closed') ? 1 : 0;
    const flat = toFeatureRow(c.id, features, targetClosed);
    rows.push(
      [
        flat.case_id,
        flat.snowfall_in,
        flat.temp_f,
        flat.wind_mph,
        flat.wind_chill_f,
        flat.ice_in,
        flat.freezing_rain,
        flat.mu_friction,
        flat.pavement_temp_f,
        flat.is_commute_window,
        flat.overnight_ended_early,
        flat.late_start,
        flat.target_closed,
        JSON.stringify(pred.categoryLabel),
        JSON.stringify(c.outputs.category_label),
        catMatch ? 1 : 0,
        pred.pClosed,
        c.outputs.p_closed,
        round3(mae(pred.pClosed, c.outputs.p_closed)),
      ].join(',')
    );
  }

  const n = raw.cases.length;
  const csvPath = path.join(root, 'data/training/vt-snow-day-features.csv');
  fs.writeFileSync(csvPath, rows.join('\n') + '\n');

  console.log('=== VT Snow Day Training Evaluation ===');
  console.log(`Cases: ${n}`);
  console.log(`Category accuracy: ${categoryHits}/${n} (${((categoryHits / n) * 100).toFixed(1)}%)`);
  console.log(`MAE p_closed: ${(closeMae / n).toFixed(3)}`);
  console.log(`MAE weather_score: ${(weatherMae / n).toFixed(1)}`);
  console.log(`MAE corridor_hazard: ${(hazardMae / n).toFixed(1)}`);
  console.log(`MAE blended: ${(blendMae / n).toFixed(1)}`);
  console.log(`Wrote flat features → ${csvPath}`);
  if (misses.length) {
    console.log('\nMisses:');
    for (const m of misses) console.log(' -', m);
  } else {
    console.log('\nAll category labels matched.');
  }

  if (categoryHits < n) {
    process.exitCode = 1;
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

main();
