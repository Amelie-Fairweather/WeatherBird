/**
 * Snow Day Prediction Service
 * Calculates probability of school closings based on weather forecasts and district thresholds
 */

import { 
  getDistrictByZipCode, 
  getDistrictByName,
  getDistrictThresholds,
  getHistoricalClosings,
  DistrictThresholds,
  SchoolClosing,
  SchoolDistrict
} from './schoolDistrictService';
import { fetchWeatherFromProvider } from './unifiedWeatherService';
import { getTomorrowSnowfallForecast, fetchWeatherbitForecast } from './weatherbitService';
import { fetchAllRoadConditions } from './roadDataService'; // Includes Xweather road conditions
import {
  extractZipCode,
  resolveVermontZip,
  resolveWeatherLocation,
  filterConditionsNearLocation,
  scopeConditionsForLocation,
  formatLocalRWISBriefing,
  hasVTransRWIS,
  type NearbyRoadCondition,
  type VermontZipLocation,
} from './vermontLocationService';
import {
  assessStudentRoutes,
  type StudentRouteAssessment,
} from './studentRouteService';
import {
  formatAnnounceByHour,
  type SuperintendentInput,
} from './superintendentInput';
import {
  VT_SNOW_DAY_BASELINES,
  applyLiveTrainingCalibration,
  getCalibratedProbabilityCategory,
  type CalibrationFeatures,
  type UserScoreBreakdown,
} from './training/snowDayCalibration';

export type { SuperintendentInput } from './superintendentInput';

export interface WeatherForecast {
  temperature: number; // Celsius
  precipitation: number; // mm
  snowfall?: number; // inches (estimated)
  ice?: number; // inches
  windSpeed: number; // m/s
  condition: string;
  timestamp: string;
}

export interface SnowDayPrediction {
  district_id: number;
  district_name: string;
  prediction_date: string;
  predicted_for_date: string;
  
  // Probabilities (0-100%)
  full_closing_probability: number;
  delay_probability: number;
  early_dismissal_probability: number;
  
  // Confidence level (0-100%)
  confidence: number;
  
  // Weather forecast used
  forecast: WeatherForecast;
  
  // Factors considered
  factors: string[];
  
  // WHY schools would close (clear explanation)
  primary_reason?: string; // Main reason for closure/delay
  closure_reasons?: string[]; // Array of specific reasons
  
  // Thresholds used
  thresholds: DistrictThresholds | null;

  /** ZIP / coordinate grounding for data-driven answers */
  locationContext?: {
    zip?: string;
    city?: string;
    county?: string;
    latitude?: number;
    longitude?: number;
    displayName: string;
    weatherQuery: string;
  };
  /** Closest VTrans RWIS / road sensors to this ZIP or district */
  nearbySensors?: NearbyRoadCondition[];
  localSensorBriefing?: string;
  /** High-school student/bus corridor assessment from VTrans pavement data */
  studentRoutes?: StudentRouteAssessment;

  /** Training-calibrated multinomial decision (VT-SND labeled cases) */
  decision_category?: string;
  p_closed?: number;
  p_delay?: number;
  p_open?: number;
  training_rationale?: string;
  scoring_breakdown?: {
    weather_score: number;
    corridor_rwis_hazard: number;
    blended_final_score: number;
    guards_applied: string[];
  };
  /** Number-specific call card for the UI */
  user_breakdown?: UserScoreBreakdown;
}

export interface MultiDaySnowDayPredictions {
  district_id: number;
  district_name: string;
  predictions: SnowDayPrediction[]; // Array of predictions for each day
}

/**
 * Estimate snowfall from precipitation and temperature
 * IMPORTANT CONTEXT: Schools close for SNOW and ICE, NOT for rain
 * This function only estimates SNOW - rain (above freezing) returns 0
 * 
 * Simple heuristic: if temp < 32°F (0°C), precipitation is likely snow
 * If above freezing, it's rain (which does NOT cause school closures)
 */
function estimateSnowfall(precipitationMm: number, temperatureC: number): number {
  const temperatureF = (temperatureC * 9/5) + 32;
  
  // If temperature is below freezing, assume all precipitation is snow (or freezing rain/ice)
  // Schools DO close for snow and ice
  if (temperatureF <= 32) {
    // Convert mm to inches (1mm ≈ 0.03937 inches)
    // Snow has ~10:1 ratio (10 inches snow = 1 inch water)
    return (precipitationMm * 0.03937) * 10;
  }
  // If temperature is between 32-40°F, could be mixed precipitation (snow/sleet/ice)
  // This can still cause closures, but estimate conservatively
  else if (temperatureF <= 40) {
    return (precipitationMm * 0.03937) * 5; // Half snow (could be freezing rain/ice which also closes schools)
  }
  // Above 40°F, it's rain - schools do NOT close for rain alone
  // Return 0 because rain does not cause school closures
  return 0;
}

/**
 * Calculate snow day probability based on forecast and thresholds
 * 
 * IMPORTANT CONTEXT: Schools typically close ONLY for:
 * - Snow (accumulation above district thresholds)
 * - Ice (freezing rain, black ice, icy conditions)
 * - Extreme cold (below district temperature thresholds)
 * - High winds combined with cold/snow
 * 
 * Schools do NOT close for:
 * - Regular rain (without freezing/ice)
 * - Light precipitation above freezing
 * - Normal weather conditions
 * 
 * This function only factors in snow, ice, temperature, and wind - NOT regular rain
 */
export async function predictSnowDay(
  districtIdentifier: string | number, // zip code, district name, or district ID
  forecastDate?: Date, // date to predict for (default: tomorrow)
  superintendent?: SuperintendentInput
): Promise<SnowDayPrediction | null> {
  
  // Get district
  let district;
  let isFallbackDistrict = false;
  if (typeof districtIdentifier === 'number') {
    // Already have district ID
    const { getAllDistricts } = await import('./schoolDistrictService');
    const districts = await getAllDistricts();
    district = districts.find(d => d.id === districtIdentifier);
  } else if (/^\d{5}$/.test(String(districtIdentifier))) {
    // Zip code (convert to string first)
    district = await getDistrictByZipCode(String(districtIdentifier));
  } else {
    // District name or location name (e.g., "Vermont", "Burlington")
    district = await getDistrictByName(String(districtIdentifier));
  }

  // If district not found, create fallback district with Vermont-wide defaults
  // This allows the calculator to work with location names like "Vermont" or "Burlington"
  if (!district) {
    isFallbackDistrict = true;
    district = {
      id: 0, // Use 0 as fallback ID
      district_name: String(districtIdentifier),
      district_code: undefined,
      county: undefined,
      zip_codes: [],
      city: String(districtIdentifier),
      latitude: undefined,
      longitude: undefined,
      district_type: undefined,
      enrollment: undefined,
    };
  }

  // Superintendent feeder towns can refine city context
  if (superintendent?.feederTowns && superintendent.feederTowns.length > 0 && !district.city) {
    district = { ...district, city: superintendent.feederTowns[0] };
  }

  // Get thresholds - use defaults if district not found or thresholds don't exist
  let thresholds;
  if (isFallbackDistrict) {
    // Use Vermont-wide default thresholds for fallback districts
    thresholds = {
      id: 0,
      district_id: 0,
      full_closing_snowfall_threshold: 6.0, // Default: 6 inches for full closing
      delay_snowfall_threshold: 3.0, // Default: 3 inches for delay
      ice_threshold: 0.25, // Default: 0.25 inches of ice
      temperature_threshold: 10.0, // Default: Below 10°F increases closure likelihood
      wind_speed_threshold: 30.0, // Default: Above 30 mph increases closure likelihood
      auto_calculate: true,
      manual_override: false,
    };
  } else {
    thresholds = await getDistrictThresholds(district.id);
    if (!thresholds) {
      // If thresholds don't exist, use defaults
      thresholds = {
        id: 0,
        district_id: district.id,
        full_closing_snowfall_threshold: 6.0,
        delay_snowfall_threshold: 3.0,
        ice_threshold: 0.25,
        temperature_threshold: 10.0,
        wind_speed_threshold: 30.0,
        auto_calculate: true,
        manual_override: false,
      };
    }
  }

  // Superintendent-entered thresholds override DB/defaults
  if (superintendent?.thresholds) {
    const t = superintendent.thresholds;
    thresholds = {
      ...thresholds,
      full_closing_snowfall_threshold:
        t.fullClosingSnow ?? thresholds.full_closing_snowfall_threshold,
      delay_snowfall_threshold: t.delaySnow ?? thresholds.delay_snowfall_threshold,
      ice_threshold: t.ice ?? thresholds.ice_threshold,
      temperature_threshold: t.tempF ?? thresholds.temperature_threshold,
      wind_speed_threshold: t.windMph ?? thresholds.wind_speed_threshold,
      manual_override: true,
    };
  }

  // ZIP → lat/lon → local forecast + nearby RWIS (critical for data-driven answers)
  const identifierStr = String(districtIdentifier);
  const zipFromInput =
    /^\d{5}$/.test(identifierStr)
      ? identifierStr
      : extractZipCode(identifierStr) ||
        superintendent?.feederZips?.[0] ||
        (district.zip_codes && district.zip_codes[0]) ||
        null;

  let resolvedZip: VermontZipLocation | null = null;
  if (zipFromInput) {
    resolvedZip = await resolveVermontZip(zipFromInput);
  }

  const resolved = await resolveWeatherLocation({
    zipCode: zipFromInput,
    latitude: resolvedZip?.latitude ?? district.latitude,
    longitude: resolvedZip?.longitude ?? district.longitude,
    city: resolvedZip?.city ?? district.city,
    districtName: district.district_name,
    fallback: 'Vermont',
  });

  // Weather APIs get precise lat,lon when ZIP resolves; never stay on generic "Vermont" if we have a ZIP
  const location = resolved.weatherQuery;
  const locationDisplay = resolved.displayName;
  const originLat = resolved.latitude;
  const originLon = resolved.longitude;

  console.log(
    `[Snow Day] Location resolved for ${district.district_name}: ${locationDisplay} → weather query "${location}"` +
      (zipFromInput ? ` (ZIP ${zipFromInput})` : '')
  );
  
  // Determine target date (default: tomorrow if not specified)
  const targetDate = forecastDate ? new Date(forecastDate) : (() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // Normalize to start of day
    return tomorrow;
  })();
  
  // Format target date as YYYY-MM-DD for Weatherbit API
  const targetDateStr = targetDate.toISOString().split('T')[0];
  
  // Declare roadConditions outside try block so it's accessible throughout the function
  let roadConditions: NearbyRoadCondition[] = [];
  let localSensorBriefing = '';
  let usedApiFallback = false;
  let allStatewideRoadConditions: Awaited<ReturnType<typeof fetchAllRoadConditions>> = [];
  
  // Fetch forecast for THIS SPECIFIC DATE from multiple sources (NWS, Weatherbit, Xweather)
  // CRITICAL: Each day must get its own forecast, not current weather!
  let forecast: WeatherForecast;
  let snowfallInches = 0;
  let precipitationMm = 0;
  let forecastTemp = 0;
  let windSpeed = 0;
  let condition: string = '';
  
  try {
    // CRITICAL: Fetch forecasts from ALL sources (Weatherbit, NWS, Xweather) for THIS SPECIFIC DATE
    // Each day gets its own forecast - never reuse the same forecast for multiple days!
    
    // Try Weatherbit first (best for snowfall forecasts)
    // CRITICAL: Fetch enough days to cover the target date, then find the SPECIFIC day's forecast
    try {
      const daysFromToday = Math.ceil((targetDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      const daysNeeded = Math.max(daysFromToday + 1, 8); // Fetch at least 8 days to ensure we have the target date
      const multiDayForecast = await fetchWeatherbitForecast(location, Math.min(daysNeeded, 16));
      
      const targetForecast = multiDayForecast.find(day => day.valid_date === targetDateStr);
      
      if (targetForecast) {
        snowfallInches = (targetForecast.snow || 0) * 0.0393701;
        precipitationMm = targetForecast.precip || 0;
        forecastTemp = targetForecast.temp;
        windSpeed = targetForecast.wind_spd || 0;
        condition = targetForecast.weather?.description || 'unknown';
        console.log(`[Snow Day] ✅ Weatherbit forecast for ${targetDateStr}: ${snowfallInches.toFixed(1)}" snow, ${forecastTemp.toFixed(0)}°C, ${condition}`);
      } else {
        console.warn(`[Snow Day] ⚠️ Weatherbit forecast for ${targetDateStr} not found. Available dates: ${multiDayForecast.map(d => d.valid_date).join(', ')}`);
      }
    } catch (weatherbitError) {
      console.log(`[Snow Day] ⚠️ Weatherbit forecast error for ${targetDateStr}:`, weatherbitError instanceof Error ? weatherbitError.message : weatherbitError);
    }
    
    // ALWAYS try NWS forecast to supplement or fill gaps (even if Weatherbit worked)
    // CRITICAL: Only use NWS if Weatherbit didn't provide data for THIS SPECIFIC DATE
    // Don't average - use the best source for THIS DATE to ensure each day is different
    if (forecastTemp === 0 || snowfallInches === 0) {
      try {
        const { fetchNWSForecast } = await import('./nwsService');
        const nwsForecast = await fetchNWSForecast(location, targetDateStr);
        if (nwsForecast) {
          // Only use NWS if we don't have data from Weatherbit for THIS date
          if (forecastTemp === 0) {
            forecastTemp = nwsForecast.temperature;
          }
          if (windSpeed === 0) {
            windSpeed = nwsForecast.windSpeed;
          }
          if (!condition) {
            condition = nwsForecast.description;
          }
          // NWS provides precipitation probability, estimate snowfall if temp is below freezing
          if (nwsForecast.precipitation && forecastTemp < 0 && snowfallInches === 0) {
            // Convert probability percentage to mm estimate (rough)
            const precipEstimate = (nwsForecast.precipitation / 100) * 5; // Rough estimate
            snowfallInches = estimateSnowfall(precipEstimate, forecastTemp);
            precipitationMm = precipEstimate;
          }
          console.log(`[Snow Day] ✅ NWS forecast for ${targetDateStr}: ${condition}, ${forecastTemp.toFixed(0)}°C`);
        }
      } catch (nwsError) {
        console.log(`[Snow Day] ⚠️ NWS forecast error for ${targetDateStr}:`, nwsError instanceof Error ? nwsError.message : nwsError);
      }
    }
    
    // ALWAYS try Xweather forecast to supplement or fill gaps
    // CRITICAL: Only use Xweather if we still don't have data for THIS SPECIFIC DATE
    if (forecastTemp === 0 || snowfallInches === 0) {
      try {
        const { fetchXweatherForecast } = await import('./xweatherService');
        const xweatherForecast = await fetchXweatherForecast(location, targetDateStr);
        if (xweatherForecast) {
          // Only use Xweather if we don't have data from other sources for THIS date
          if (forecastTemp === 0) {
            forecastTemp = xweatherForecast.temperature;
          }
          if (windSpeed === 0) {
            windSpeed = xweatherForecast.windSpeed;
          }
          if (!condition) {
            condition = xweatherForecast.description;
          }
          if (xweatherForecast.precipitation && forecastTemp < 0 && snowfallInches === 0) {
            snowfallInches = estimateSnowfall(xweatherForecast.precipitation, forecastTemp);
            precipitationMm = xweatherForecast.precipitation;
          }
          console.log(`[Snow Day] ✅ Xweather forecast for ${targetDateStr}: ${condition}, ${forecastTemp.toFixed(0)}°C`);
        }
      } catch (xweatherError) {
        console.log(`[Snow Day] ⚠️ Xweather forecast error for ${targetDateStr}:`, xweatherError instanceof Error ? xweatherError.message : xweatherError);
      }
    }
    
    // Only use current weather as absolute last resort - this should rarely happen
    if (forecastTemp === 0 && snowfallInches === 0) {
      console.warn(`[Snow Day] No forecast found for ${targetDateStr}, using current weather as fallback`);
      const weatherData = await fetchWeatherFromProvider(location, 'auto');
      
      // If we didn't get forecast data, estimate from current weather
      // NOTE: Only estimate SNOW (not rain) - rain does not cause school closures
      if (snowfallInches === 0 && precipitationMm === 0) {
        // Only estimate if temperature suggests snow/ice is possible (below freezing)
        const tempF = (weatherData.temperature * 9/5) + 32;
        if (tempF <= 32) {
          // Below freezing - could be snow/ice
          snowfallInches = estimateSnowfall(
            weatherData.humidity * 0.1, // Rough estimate
            weatherData.temperature
          );
        }
        // Above freezing = rain, which doesn't cause closures, so snowfallInches stays 0
      }
      
      if (forecastTemp === 0) {
        forecastTemp = weatherData.temperature;
      }
      
      if (windSpeed === 0) {
        windSpeed = weatherData.windSpeed;
      }
      
      if (!condition) {
        condition = weatherData.description;
      }
    }

    // Get road conditions from ALL sources, then scope to this ZIP/district's lat/lon
    try {
      allStatewideRoadConditions = await fetchAllRoadConditions(location);
      if (originLat !== undefined && originLon !== undefined) {
        const nearby = filterConditionsNearLocation(
          allStatewideRoadConditions,
          originLat,
          originLon,
          40
        );
        // Nearby sensors + API fallback layers (NWS/TomTom/Xweather without coords)
        const scoped = scopeConditionsForLocation(
          allStatewideRoadConditions,
          originLat,
          originLon,
          40
        );
        const nearbyDist = new Map<string, number>(
          nearby.map((c) => [
            `${c.source}|${c.route}|${c.latitude}|${c.longitude}|${c.timestamp}`,
            c.distanceMiles,
          ])
        );
        roadConditions = scoped.map((c) => {
          const key = `${c.source}|${c.route}|${c.latitude}|${c.longitude}|${c.timestamp}`;
          return {
            ...c,
            distanceMiles: nearbyDist.get(key) ?? 999,
          };
        });
        localSensorBriefing = formatLocalRWISBriefing(locationDisplay, nearby);
        if (!hasVTransRWIS(scoped)) {
          usedApiFallback = true;
          localSensorBriefing +=
            '\nAPI FALLBACK MODE for this ZIP: integrate NWS, forecast APIs, TomTom/511, and VTrans closures — no local RWIS.\n';
        }
        console.log(
          `[Snow Day] ${nearby.length} nearby RWIS-range + API layers → ${roadConditions.length}/${allStatewideRoadConditions.length} for ${locationDisplay}`
        );
      } else {
        // No coords — keep full multi-source set (APIs matter as much as geocoded rows)
        roadConditions = allStatewideRoadConditions.map((c) => ({
          ...c,
          distanceMiles: 0,
        }));
        localSensorBriefing = formatLocalRWISBriefing(
          locationDisplay,
          roadConditions.filter((c) => c.source === 'VTrans RWIS').slice(0, 8)
        );
        if (!hasVTransRWIS(roadConditions)) {
          usedApiFallback = true;
          localSensorBriefing +=
            '\nAPI FALLBACK MODE: no VTrans RWIS — use NWS/forecast/traffic APIs.\n';
        }
        console.log(
          `[Snow Day] No ZIP/coords — using ${roadConditions.length} multi-source reports for ${district.district_name}`
        );
      }
    } catch (error) {
      console.warn('[Snow Day] Could not fetch road conditions for snow day prediction:', error);
      roadConditions = [];
    }

    // Estimate ice accumulation from condition description and road conditions
    // This is critical for Vermont snow day predictions (ice is MORE important than snow)
    let estimatedIceInches = 0;
    const conditionLower = condition.toLowerCase();
    
    // Check condition description for freezing rain/ice indicators
    if (conditionLower.includes('freezing rain') || conditionLower.includes('freezing drizzle')) {
      // Freezing rain typically accumulates 0.01-0.10 inches
      if (conditionLower.includes('heavy') || conditionLower.includes('significant')) {
        estimatedIceInches = 0.08; // Heavy freezing rain
      } else if (conditionLower.includes('moderate')) {
        estimatedIceInches = 0.05; // Moderate freezing rain
      } else {
        estimatedIceInches = 0.02; // Light freezing rain
      }
    } else if (conditionLower.includes('ice') && !conditionLower.includes('nice')) {
      // General ice conditions (could be black ice, ice pellets, etc.)
      estimatedIceInches = 0.03;
    }
    
    // Also check road conditions for ice confirmation (real-time data is most accurate)
    const iceRoadConditions = roadConditions.filter(rc => rc.condition === 'ice');
    if (iceRoadConditions.length > 0 && estimatedIceInches === 0) {
      // Road conditions report ice but forecast doesn't - trust road conditions
      estimatedIceInches = 0.04; // Default to trace-measurable ice
    }

    forecast = {
      temperature: forecastTemp,
      precipitation: precipitationMm,
      snowfall: snowfallInches,
      ice: estimatedIceInches, // Estimated from condition description and road conditions
      windSpeed: windSpeed,
      condition: condition,
      timestamp: targetDate.toISOString(),
    };
  } catch (error) {
    console.error('Error fetching weather for prediction:', error);
    throw new Error('Unable to fetch weather forecast');
  }

  // Get historical patterns (last 30 days)
  const historicalClosings = await getHistoricalClosings(district.id, 30);

  // Calculate probabilities using district thresholds
  const factors: string[] = [];
  if (usedApiFallback) {
    factors.push(
      `No local VTrans RWIS near ${locationDisplay} — using weather/traffic API fallback layers`
    );
  }
  let fullClosingScore = 0;
  let delayScore = 0;
  let earlyDismissalScore = 0;

  const snowfall = forecast.snowfall || 0;
  const temperatureF = (forecast.temperature * 9/5) + 32;
  const windSpeedMph = forecast.windSpeed * 2.237; // Convert m/s to mph
  
  // COUNTY-SPECIFIC SCORING: Apply Vermont county-specific thresholds and factors
  // This adds/subtracts points based on county geography, road conditions, and timing
  const countyAdjustments = getCountySpecificAdjustments(
    district.county || '', 
    snowfall, 
    temperatureF, 
    windSpeedMph, 
    forecast.ice || 0, 
    forecast.condition, 
    targetDate
  );
  fullClosingScore += countyAdjustments.closingAdjustment;
  delayScore += countyAdjustments.delayAdjustment;
  if (countyAdjustments.factors.length > 0) {
    factors.push(...countyAdjustments.factors);
  }
  
  // CRITICAL: Log the forecast data being used for THIS SPECIFIC DATE
  console.log(`[Snow Day Scoring] ${targetDateStr}: ${snowfall.toFixed(1)}" snow, ${temperatureF.toFixed(0)}°F, ${windSpeedMph.toFixed(0)}mph, ${forecast.condition}`);

  // Factor 1: Snowfall amount (GRANULAR - every inch matters, even small amounts)
  const fullClosingThreshold =
    thresholds.full_closing_snowfall_threshold || VT_SNOW_DAY_BASELINES.fullClosingSnowfallInches;
  const delayThreshold =
    thresholds.delay_snowfall_threshold || VT_SNOW_DAY_BASELINES.delaySnowfallInches;
  
  if (snowfall >= fullClosingThreshold) {
    const excess = snowfall - fullClosingThreshold;
    fullClosingScore += 40 + (excess * 5);
    factors.push(`${snowfall.toFixed(1)}" snow (threshold: ${fullClosingThreshold}")`);
  } else if (snowfall >= fullClosingThreshold * 0.8) {
    fullClosingScore += 20; // Near threshold
    factors.push(`Approaching snowfall threshold`);
  } else if (snowfall > 0) {
   
    const snowScore = Math.min(snowfall * 5, 20);
    fullClosingScore += snowScore;
    delayScore += Math.min(snowfall * 3, 15);
    factors.push(`${snowfall.toFixed(1)}" snow (light accumulation)`);
  }

  if (snowfall >= delayThreshold) {
    delayScore += 30;
    factors.push(`${snowfall.toFixed(1)}" snow for delay threshold`);
  } else if (snowfall > 0 && snowfall < delayThreshold) {
    // GRANULAR: Small amounts still contribute to delay probability
    delayScore += Math.min(snowfall * 5, 20);
  }

  // Factor 2: Temperature (GRANULAR - every degree matters, especially below freezing)
  const tempThreshold = thresholds.temperature_threshold || 10;
  if (temperatureF < tempThreshold) {
    const coldFactor = (tempThreshold - temperatureF) / 10;
    fullClosingScore += Math.min(coldFactor * 10, 20);
    delayScore += Math.min(coldFactor * 5, 10);
    factors.push(`Very cold: ${temperatureF.toFixed(0)}°F`);
  } else if (temperatureF <= 32) {
    // GRANULAR: Below freezing but above extreme cold threshold still matters
    // Colder = higher score (30°F gets less than 20°F, but more than 35°F)
    const freezingFactor = (32 - temperatureF) / 32; // 0 to 1 scale
    fullClosingScore += Math.min(freezingFactor * 8, 8);
    delayScore += Math.min(freezingFactor * 4, 4);
    factors.push(`Below freezing: ${temperatureF.toFixed(0)}°F`);
  }

  // Factor 3: Wind speed + drifting (critical for rural districts)
  // Wind causes drifting on rural roads, making them impassable
  // Heavy wet snow + wind = closure
  // Wind drift often enough for closure in rural areas even with moderate snow
  if (thresholds.wind_speed_threshold && windSpeedMph >= thresholds.wind_speed_threshold) {
    const windFactor = (windSpeedMph - thresholds.wind_speed_threshold) / 10;
    fullClosingScore += Math.min(windFactor * 5, 15);
    delayScore += Math.min(windFactor * 3, 10);
    factors.push(`High winds: ${windSpeedMph.toFixed(0)} mph`);
    
    // Wind + snow = drifting (especially bad for rural districts)
    if (snowfall > 0) {
      fullClosingScore += 10;
      delayScore += 8;
      factors.push(`Wind + snow = drifting on rural roads - makes roads impassable`);
    }
    
    // Heavy wet snow + wind = closure
    if (snowfall >= 4 && temperatureF >= 28 && temperatureF <= 32) {
      fullClosingScore += 15;
      delayScore += 10;
      factors.push('Heavy wet snow + wind = closure (especially dangerous)');
    }
  }
  
  // Very cold wind chills: Schools may close if students waiting for buses are at risk
  // (VT-SND-005): arctic wind chill closes even when pavement is clear — bus-stop safety
  const windChill = estimateWindChillF(temperatureF, windSpeedMph);
  if (windChill <= VT_SNOW_DAY_BASELINES.busStopWindChillF) {
    fullClosingScore += 45;
    delayScore += 25;
    factors.push(
      `ARCTIC wind chill (${windChill.toFixed(0)}°F) — bus-stop safety close even if pavement clear (training VT-SND-005)`
    );
  } else if (windChill <= VT_SNOW_DAY_BASELINES.severeWindChillF) {
    fullClosingScore += 28;
    delayScore += 18;
    factors.push(`Severe wind chill (${windChill.toFixed(0)}°F) - bus safety and frostbite risk`);
  } else if (windChill <= -10) {
    fullClosingScore += 20;
    delayScore += 15;
    factors.push(`Very cold wind chill (${windChill.toFixed(0)}°F) - bus safety and frostbite risk`);
  } else if (windChill <= 0) {
    fullClosingScore += 10;
    delayScore += 8;
    factors.push(`Cold wind chill (${windChill.toFixed(0)}°F) - bus safety concerns`);
  }

  // Factor 4: ICE - CRITICAL FOR VERMONT (ice triggers closures even with small amounts)
  // Ice/freezing rain often triggers closures even with minimal precipitation
  // Freezing rain warnings = high closure likelihood
  // Ice layers (not pure snow) = especially dangerous
  if (thresholds.ice_threshold && forecast.ice && forecast.ice >= thresholds.ice_threshold) {
    fullClosingScore += 50; // Ice is very dangerous
    delayScore += 30;
    factors.push(`${forecast.ice.toFixed(2)}" ice accumulation - CRITICAL: Ice triggers closures even with small amounts`);
  } else if (forecast.ice && forecast.ice > 0) {
    // Even trace amounts of ice are dangerous
    fullClosingScore += 35;
    delayScore += 25;
    factors.push(`${forecast.ice.toFixed(2)}" ice - even small amounts trigger closures`);
  }
  
  // Check condition description for freezing rain/ice indicators
  const conditionLower = forecast.condition.toLowerCase();
  if (conditionLower.includes('freezing rain') || conditionLower.includes('freezing drizzle')) {
    fullClosingScore += 45; // Freezing rain = very high closure probability
    delayScore += 30;
    factors.push('Freezing rain warning - high closure likelihood even with minimal precipitation');
  } else if (conditionLower.includes('ice') && !conditionLower.includes('nice')) {
    fullClosingScore += 30;
    delayScore += 20;
    factors.push('Ice conditions reported - dangerous even at low totals');
  }
  
  // Ice + snow mix = especially bad
  if ((forecast.ice && forecast.ice > 0) && snowfall > 0) {
    fullClosingScore += 15;
    delayScore += 10;
    factors.push('Ice + snow mix - especially dangerous (ice layers under snow)');
  }

  // Factor 5: TIMING - CRITICAL FOR VERMONT (timing matters MORE than total snowfall)
  // Decisions are made 4-6 AM before buses start at 6 AM
  // Snow during morning commute (4-7 AM) is MUCH worse than overnight snow that can be cleared
  const currentHour = new Date().getHours();
  const forecastTargetHour = targetDate.getHours();
  const hoursUntilTarget = (targetDate.getTime() - new Date().getTime()) / (1000 * 60 * 60);
  
  // CRITICAL TIMING WINDOWS (based on Vermont district decision patterns):
  // - Night-before decisions: If forecast shows 6"+ by morning, districts often announce closure evening before
  // - 4-6 AM window: Superintendents check conditions, make decisions before buses start
  // - 4-7 AM snow: Worst timing - snow during morning commute = high closure probability
  // - Overnight snow (before 4 AM): Can often be cleared before buses start
  
  if (hoursUntilTarget <= 12 && hoursUntilTarget >= 0) {
    // Within 12 hours - timing is critical
    if (forecastTargetHour >= 4 && forecastTargetHour <= 7) {
      // CRITICAL: Snow during morning commute window (4-7 AM) = very high closure risk
      fullClosingScore += 25;
      delayScore += 20;
      factors.push('CRITICAL TIMING: Snow during morning commute window (4-7 AM) - buses start at 6 AM');
    } else if (forecastTargetHour >= 0 && forecastTargetHour < 4) {
      // Overnight snow (before 4 AM) - can often be cleared, but still risky
      fullClosingScore += 15;
      delayScore += 12;
      factors.push('Overnight snow timing - may be cleared before buses start, but risky');
    } else if (hoursUntilTarget <= 6) {
      // Very early morning (4-6 AM decision window)
      fullClosingScore += 10;
      delayScore += 8;
      factors.push('Early morning decision window (4-6 AM) - conditions checked before buses start');
    }
  }
  
  // Night-before closure pattern: If 6"+ predicted by morning, districts often announce evening before
  if (hoursUntilTarget <= 18 && hoursUntilTarget >= 12 && snowfall >= 6) {
    fullClosingScore += 15;
    factors.push('Night-before closure pattern: 6"+ predicted by morning often triggers evening announcement');
  }
  
  // Active snow falling at decision time (4-6 AM) = closure likely
  if (forecastTargetHour >= 4 && forecastTargetHour <= 6 && condition.toLowerCase().includes('snow')) {
    fullClosingScore += 20;
    delayScore += 15;
    factors.push('Active snow falling during decision window (4-6 AM) - closure likely');
  }
  
  // Snow rate: 2"/hr during morning = closure likely
  if (snowfall > 0 && hoursUntilTarget <= 6 && hoursUntilTarget >= 0) {
    const estimatedSnowRate = snowfall / Math.max(hoursUntilTarget, 1);
    if (estimatedSnowRate >= 2) {
      fullClosingScore += 25;
      delayScore += 20;
      factors.push(`High snow rate (${estimatedSnowRate.toFixed(1)}"/hr) during morning - closure likely`);
    }
  }

  // Factor 6: Historical patterns + Winter Storm Warning pattern
  // Real-world pattern: ~6" predicted by morning often generates night-before closure announcement
  // Note: hoursUntilTarget is already defined in Factor 5 above
  if (historicalClosings.length > 0) {
    const recentClosings = historicalClosings.filter(c => {
      const closingDate = new Date(c.closing_date);
      const daysDiff = Math.abs((new Date().getTime() - closingDate.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff <= 7;
    }).length;

    if (recentClosings > 0) {
      fullClosingScore += recentClosings * 5; // Recent closings increase probability
      factors.push(`${recentClosings} recent closing(s) in past week`);
    }
  }
  
  // Winter Storm Warning pattern: 6"+ in 12 hours overlapping overnight/morning = night-before closure
  // Note: hoursUntilTarget already defined in Factor 5 - reuse it
  if (hoursUntilTarget <= 18 && hoursUntilTarget >= 12 && snowfall >= 6) {
    // 6"+ predicted by morning = districts often announce closure evening before
    fullClosingScore += 15;
    factors.push('Winter Storm Warning pattern: 6"+ predicted by morning often triggers night-before closure announcement');
  }
  
  // Pattern: Snow starting late morning after buses finish routes rarely causes closures next morning
  // (This is handled by timing factors above - snow after 7 AM doesn't affect next day)

  // Factor 7: Precipitation type from condition description
  // IMPORTANT CONTEXT: Schools typically close ONLY for ice and snow - NOT for rain
  // Regular rain does not cause school closures in Vermont
  // Only ice (freezing rain, black ice) and snow cause closures
  const forecastCondition = forecast.condition.toLowerCase();
  if (forecastCondition.includes('snow') || forecastCondition.includes('blizzard')) {
    fullClosingScore += 15;
    delayScore += 10;
    factors.push('Snow/blizzard conditions');
  } else if (forecastCondition.includes('ice') || forecastCondition.includes('freezing') || forecastCondition.includes('freezing rain')) {
    // Ice is very dangerous - freezing rain, black ice, etc.
    fullClosingScore += 25;
    delayScore += 15;
    factors.push('Ice/freezing conditions (dangerous)');
  }
  // NOTE: Regular rain (without "freezing" or "ice") is explicitly NOT counted
  // Rain alone does not cause school closures - only ice and snow do

  // Factor 8A (PRIMARY for closures): When a student/teacher enters a district,
  // resolve that district's high school(s), check MAIN morning corridors into those
  // schools with VTrans RWIS pavement/μ, and combine with sky/weather API forecast.
  factors.push(
    `Sky/weather APIs for ${locationDisplay}: ${forecast.condition}, ${snowfall.toFixed(1)}" snow, ${temperatureF.toFixed(0)}°F, wind ${windSpeedMph.toFixed(0)} mph`
  );

  let studentRouteAssessment: StudentRouteAssessment | null = null;
  try {
    const feederZips = [
      ...(superintendent?.feederZips || []),
      ...(zipFromInput ? [zipFromInput] : []),
      ...(district.zip_codes || []),
    ].filter((z, i, a) => a.indexOf(z) === i);

    studentRouteAssessment = await assessStudentRoutes(district, roadConditions, {
      highSchoolName: superintendent?.highSchool,
      priorityCorridors: superintendent?.priorityCorridors,
      feederTowns: superintendent?.feederTowns,
      feederZips,
    });
    if (studentRouteAssessment.factors.length > 0) {
      factors.push(...studentRouteAssessment.factors);
    }
    fullClosingScore += studentRouteAssessment.closingAdjustment;
    delayScore += studentRouteAssessment.delayAdjustment;
    if (studentRouteAssessment.summary) {
      factors.push(studentRouteAssessment.summary);
    }
    console.log(
      `[Snow Day] Student routes: ${studentRouteAssessment.highSchools.map((h) => h.name).join(', ') || 'none'} | ` +
        `hazard ${studentRouteAssessment.routeHazardScore}/100 | ` +
        `Δ close ${studentRouteAssessment.closingAdjustment} Δ delay ${studentRouteAssessment.delayAdjustment}`
    );
  } catch (studentRouteError) {
    console.warn(
      '[Snow Day] Student route assessment failed:',
      studentRouteError instanceof Error ? studentRouteError.message : studentRouteError
    );
  }

  // Factor 8A-extra: Superintendent morning notes, plow status, terrain, decision window
  if (superintendent) {
    const announceBy = superintendent.announceByHour ?? 5.25;
    factors.push(`Decision window: announce by ${formatAnnounceByHour(announceBy)}`);

    // Decision window: for near-term days, weigh the announce-by morning call
    // (targetDate is normalized to midnight, so use hours-until + current clock)
    const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
    const nearTermDecision =
      hoursUntilTarget <= 30 &&
      hoursUntilTarget >= -2 &&
      (nowHour <= announceBy + 1 || hoursUntilTarget <= 12);
    if (nearTermDecision) {
      fullClosingScore += 10;
      delayScore += 8;
      factors.push(
        `Inside superintendent decision window (~${formatAnnounceByHour(announceBy)}) — conditions checked before buses`
      );
    }

    if (superintendent.terrain === 'rural') {
      fullClosingScore += 8;
      delayScore += 6;
      if (windSpeedMph >= 15 && snowfall > 0) {
        fullClosingScore += 8;
        factors.push('Rural terrain: wind drift on side roads raises closure risk');
      } else {
        factors.push('Rural terrain: longer bus routes, slower plow coverage');
      }
    } else if (superintendent.terrain === 'mountain') {
      fullClosingScore += 12;
      delayScore += 8;
      factors.push('Mountain routes: elevation/ice more likely; lower snowfall can still close');
      if (snowfall >= 2) {
        fullClosingScore += 6;
      }
    } else if (superintendent.terrain === 'urban') {
      fullClosingScore = Math.max(0, fullClosingScore - 4);
      factors.push('Urban terrain: city plows usually clear main bus corridors faster');
    }

    if (superintendent.plowStatus === 'behind') {
      fullClosingScore += 22;
      delayScore += 16;
      factors.push('Superintendent note: plow progress behind — roads may not be passable by bus start');
    } else if (superintendent.plowStatus === 'on_track') {
      delayScore += 4;
      factors.push('Superintendent note: plows on track — delay more likely than full close if weather holds');
    } else if (superintendent.plowStatus === 'clear') {
      fullClosingScore = Math.max(0, fullClosingScore - 12);
      delayScore = Math.max(0, delayScore - 8);
      factors.push('Superintendent note: major routes reported clear');
    }

    if (superintendent.knownIceSpots) {
      fullClosingScore += 18;
      delayScore += 14;
      factors.push('Known ice spots on bus routes reported by district');
    }
    if (superintendent.parentReports) {
      fullClosingScore += 10;
      delayScore += 12;
      factors.push('Parent/community hazard reports overnight — elevates delay/close caution');
    }

    if (superintendent.morningNotes?.trim()) {
      const notes = superintendent.morningNotes.toLowerCase();
      factors.push(`Morning notes: ${superintendent.morningNotes.trim().slice(0, 160)}`);
      if (
        notes.includes('ice') ||
        notes.includes('impassable') ||
        notes.includes('not plowed') ||
        notes.includes('whiteout') ||
        notes.includes('drift')
      ) {
        fullClosingScore += 15;
        delayScore += 12;
        factors.push('Morning notes indicate hazardous travel language');
      }
      if (notes.includes('clear') || notes.includes('good shape') || notes.includes('passable')) {
        fullClosingScore = Math.max(0, fullClosingScore - 8);
        factors.push('Morning notes suggest corridors improving');
      }
    }

    if (superintendent.feederZips && superintendent.feederZips.length > 0) {
      factors.push(`Feeder ZIPs considered: ${superintendent.feederZips.join(', ')}`);
    }
    if (superintendent.feederTowns && superintendent.feederTowns.length > 0) {
      factors.push(`Feeder towns: ${superintendent.feederTowns.join(', ')}`);
    }
  }

  // Factor 8B: Local road / VTrans RWIS near this ZIP (supports student-route finding)
  // CRITICAL: Superintendents check plow reports at 4-6 AM - are roads passable?
  const xweatherConditions = roadConditions.filter(rc => rc.source === 'Xweather');
  const localRwis = roadConditions.filter(rc => rc.source === 'VTrans RWIS');
  if (localRwis.length > 0) {
    factors.push(
      `${localRwis.length} VTrans RWIS station${localRwis.length > 1 ? 's' : ''} within range of ${locationDisplay}`
    );
    // Closest stations first (what a ZIP-local answer should cite)
    const closest = localRwis.slice(0, 3);
    closest.forEach((r) => {
      factors.push(
        `Nearest: ${r.stationName || r.route} (${r.distanceMiles.toFixed(1)} mi): ${r.condition}` +
          (r.surfaceFriction !== undefined ? `, μ=${r.surfaceFriction.toFixed(2)}` : '') +
          (r.pavementTemperature !== undefined
            ? `, pavement ${r.pavementTemperature.toFixed(0)}°F`
            : '')
      );
    });
    // Then any lower-grip stations farther out in the same radius
    const lowestGrip = [...localRwis]
      .filter((r) => r.surfaceFriction !== undefined)
      .sort((a, b) => (a.surfaceFriction ?? 1) - (b.surfaceFriction ?? 1))
      .slice(0, 3)
      .filter(
        (r) =>
          !closest.some(
            (c) => c.stationName === r.stationName && c.route === r.route
          )
      );
    lowestGrip.forEach((r) => {
      factors.push(
        `Lower grip nearby: ${r.stationName || r.route} (${r.distanceMiles.toFixed(1)} mi): ${r.condition}` +
          (r.surfaceFriction !== undefined ? `, μ=${r.surfaceFriction.toFixed(2)}` : '') +
          (r.pavementTemperature !== undefined
            ? `, pavement ${r.pavementTemperature.toFixed(0)}°F`
            : '')
      );
    });
    // Only apply generic local ice/wet bonuses when student-route scoring didn't already cover them
    const studentAlreadyWeighted =
      !!studentRouteAssessment && studentRouteAssessment.corridorSensors.length > 0;
    const icyLocal = localRwis.filter((r) => r.condition === 'ice');
    const wetNearFreeze = localRwis.filter(
      (r) =>
        r.condition === 'wet' &&
        ((r.pavementTemperature !== undefined && r.pavementTemperature <= 35) ||
          (r.temperature !== undefined && r.temperature <= 35))
    );
    if (!studentAlreadyWeighted && icyLocal.length > 0) {
      fullClosingScore += Math.min(icyLocal.length * 8, 24);
      delayScore += Math.min(icyLocal.length * 5, 15);
      factors.push(
        `Local RWIS ice-risk at ${icyLocal.map((r) => r.stationName || r.route).join(', ')} — bus routes may be unsafe`
      );
    }
    if (!studentAlreadyWeighted && wetNearFreeze.length > 0) {
      delayScore += Math.min(wetNearFreeze.length * 3, 12);
      factors.push(
        `Local RWIS wet pavement near freezing near ${wetNearFreeze
          .slice(0, 2)
          .map((r) => r.stationName || r.route)
          .join(', ')}`
      );
    }
  }

  const dangerousRoadConditions = roadConditions.filter(rc => 
    rc.condition === 'ice' || 
    rc.condition === 'snow-covered' || 
    rc.condition === 'closed' ||
    (rc.source === 'Xweather' && rc.warning && rc.warning.includes('adverse'))
  );
  
  // Check if storm is just starting (4-6 AM decision window)
  // If storm just starting and not enough plow progress = closure likely
  const isDecisionWindow = forecastTargetHour >= 4 && forecastTargetHour <= 6;
  const isStormJustStarting = isDecisionWindow && conditionLower.includes('snow') && snowfall > 0;
  
  if (isStormJustStarting && dangerousRoadConditions.length === 0) {
    // Storm just starting during decision window = closure likely (not enough plow progress yet)
    fullClosingScore += 20;
    delayScore += 15;
    factors.push('Storm just starting during decision window (4-6 AM) - not enough plow progress yet, closure likely');
  }
  
  if (dangerousRoadConditions.length > 0) {
    // Xweather RED conditions or other dangerous road conditions significantly increase closure probability
    const xweatherRed = xweatherConditions.filter(rc => rc.warning && rc.warning.toLowerCase().includes('adverse')).length;
    if (xweatherRed > 0) {
      fullClosingScore += 20; // Xweather RED = adverse conditions = higher closure probability
      delayScore += 15;
      factors.push(`Xweather reports ${xweatherRed} adverse road condition${xweatherRed > 1 ? 's' : ''} (RED status)`);
    }
    
    // Other dangerous conditions (ice, snow-covered, closed roads)
    const otherDangerous = dangerousRoadConditions.filter(rc => rc.source !== 'Xweather').length;
    if (otherDangerous > 0) {
      fullClosingScore += Math.min(otherDangerous * 5, 15); // Up to +15% for multiple dangerous conditions
      delayScore += Math.min(otherDangerous * 3, 10);
      const conditionTypes = [...new Set(dangerousRoadConditions.map(rc => rc.condition))];
      factors.push(`Road conditions: ${conditionTypes.join(', ')} reported from multiple sources - roads not passable for buses`);
    }
    
    // CRITICAL: If roads are closed/icy/snow-covered during decision window, closure is very likely
    if (isDecisionWindow) {
      fullClosingScore += 15;
      delayScore += 12;
      factors.push('Dangerous road conditions during decision window (4-6 AM) - roads not passable, closure likely');
    }
  } else if (xweatherConditions.length > 0) {
    // Xweather data available and showing GREEN/YELLOW - roads are manageable
    const xweatherGreen = xweatherConditions.filter(rc => rc.condition === 'clear').length;
    if (xweatherGreen === xweatherConditions.length) {
      // All Xweather conditions are GREEN - slightly reduces closure probability
      // BUT: Still check if plows have had enough time (if storm just started)
      if (!isStormJustStarting) {
        fullClosingScore = Math.max(0, fullClosingScore - 5);
        factors.push('Xweather reports clear road conditions (GREEN status) - plows have cleared roads');
      }
    }
  }
  
  // Factor 8b: Bridge and shaded section freezing (superintendents check this at 4-6 AM)
  if (isDecisionWindow && temperatureF <= 32) {
    fullClosingScore += 8;
    delayScore += 6;
    factors.push('Bridges and shaded sections freezing during decision window - checked by superintendents at 4-6 AM');
  }
  
  // Factor 8c: Plow progress assessment (are major and secondary roads passable?)
  // If we have road condition data showing clear roads, that means plows have made progress
  const clearRoads = roadConditions.filter(rc => rc.condition === 'clear').length;
  const totalRoadReports = roadConditions.length;
  if (totalRoadReports > 0 && isDecisionWindow) {
    const plowProgressRatio = clearRoads / totalRoadReports;
    if (plowProgressRatio >= 0.7) {
      // Most roads clear = plows have made good progress
      fullClosingScore = Math.max(0, fullClosingScore - 10);
      delayScore = Math.max(0, delayScore - 8);
      factors.push('Plow reports: Major and secondary roads passable (good plow progress)');
    } else if (plowProgressRatio < 0.3) {
      // Most roads still dangerous = insufficient plow progress
      fullClosingScore += 15;
      delayScore += 12;
      factors.push('Plow reports: Insufficient plow progress - roads not yet passable');
    }
  }

  // ——— VTrans-DOMINANT BLEND ———
  // When live RWIS exists on school morning corridors, pavement/μ holds most weight.
  // Sky/weather APIs still matter, but they must not outvote clear VTrans corridor signal.
  const hasVTransCorridors =
    !!studentRouteAssessment && studentRouteAssessment.corridorSensors.length > 0;

  if (hasVTransCorridors && studentRouteAssessment) {
    const vtransClosePts = studentRouteAssessment.closingAdjustment;
    const vtransDelayPts = studentRouteAssessment.delayAdjustment;
    // Remove the additive VTrans pts already folded in so we can re-blend intentionally
    const weatherClose = Math.max(0, fullClosingScore - vtransClosePts);
    const weatherDelay = Math.max(0, delayScore - vtransDelayPts);

    // Map corridor hazard (0–100) + passability into the primary decision signal
    let vtransCloseSignal = studentRouteAssessment.routeHazardScore;
    let vtransDelaySignal = Math.round(studentRouteAssessment.routeHazardScore * 0.85);
    if (!studentRouteAssessment.passable) {
      vtransCloseSignal = Math.max(vtransCloseSignal, 75);
      vtransDelaySignal = Math.max(vtransDelaySignal, 70);
    }
    // Stack explicit pavement penalties (ice/μ/closed) on top of hazard
    vtransCloseSignal = Math.min(100, vtransCloseSignal + Math.max(0, vtransClosePts) * 0.35);
    vtransDelaySignal = Math.min(100, vtransDelaySignal + Math.max(0, vtransDelayPts) * 0.35);

    const VTRANS_WEIGHT = 0.7;
    const WEATHER_WEIGHT = 0.3;
    fullClosingScore =
      vtransCloseSignal * VTRANS_WEIGHT + Math.min(100, weatherClose) * WEATHER_WEIGHT;
    delayScore =
      vtransDelaySignal * VTRANS_WEIGHT + Math.min(100, weatherDelay) * WEATHER_WEIGHT;

    // Hard floors/ceilings so returned % reflects road reality
    if (!studentRouteAssessment.passable || studentRouteAssessment.routeHazardScore >= 70) {
      fullClosingScore = Math.max(fullClosingScore, 70);
      delayScore = Math.max(delayScore, 65);
      factors.push(
        `VTrans-weighted decision (70%): corridor pavement hazard ${studentRouteAssessment.routeHazardScore}/100 — roads drive the close/delay call`
      );
    } else if (
      studentRouteAssessment.passable &&
      studentRouteAssessment.routeHazardScore <= 25
    ) {
      // Clear VTrans corridors: forecast snow alone shouldn't force a full close
      // EXCEPT arctic bus-stop wind chill (VT-SND-005) and extreme ice/snow
      const extremeIce =
        !!(forecast.ice && forecast.ice >= (thresholds.ice_threshold || 0.05)) ||
        conditionLower.includes('freezing rain');
      const extremeSnow =
        snowfall >=
        (thresholds.full_closing_snowfall_threshold ||
          VT_SNOW_DAY_BASELINES.fullClosingSnowfallInches);
      const extremeCold =
        windChill <= VT_SNOW_DAY_BASELINES.busStopWindChillF || temperatureF <= -10;
      if (!extremeIce && !extremeSnow && !extremeCold) {
        fullClosingScore = Math.min(fullClosingScore, VT_SNOW_DAY_BASELINES.clearCorridorCap);
        factors.push(
          `VTrans-weighted decision (70%): corridors mostly clear (hazard ${studentRouteAssessment.routeHazardScore}/100) — caps full-close unless extreme ice/snow/cold`
        );
      } else {
        factors.push(
          extremeCold
            ? `VTrans corridors look passable, but arctic wind chill overrides clear-corridor cap (bus-stop safety)`
            : `VTrans corridors look passable, but extreme sky/ice forecast still elevates close risk (blend 70/30)`
        );
      }
    } else {
      factors.push(
        `VTrans-weighted decision (70% pavement / 30% sky APIs): corridor hazard ${studentRouteAssessment.routeHazardScore}/100`
      );
    }
  } else {
    factors.push(
      'No VTrans sensors on school corridors — sky/weather APIs + district-wide road layers carry the score'
    );
  }

  // Cap scores at 100 before training calibration
  fullClosingScore = Math.min(fullClosingScore, 100);
  delayScore = Math.min(delayScore, 100);

  // ——— TRAINING CALIBRATION (VT-SND-001..020) ———
  // Re-map weather + VTrans blend into multinomial close/delay/open with
  // labeled Vermont decision rules (ice, overnight→delay, lake wind, arctic cold).
  const worstCorridor = studentRouteAssessment?.corridorSensors?.[0];
  const calibrationFeatures: CalibrationFeatures = {
    snowfallInches: snowfall,
    tempF: temperatureF,
    windMph: windSpeedMph,
    windChillF: windChill,
    iceInches: forecast.ice || 0,
    freezingRain:
      conditionLower.includes('freezing rain') ||
      conditionLower.includes('freezing drizzle') ||
      conditionLower.includes('ice storm'),
    timingWindow: inferTimingWindowLabel(
      forecast.condition,
      superintendent?.morningNotes,
      superintendent?.plowStatus,
      targetDate
    ),
    conditionText: forecast.condition || '',
    pavementTempF:
      worstCorridor?.pavementTemperature ??
      studentRouteAssessment?.corridorSensors?.find((s) => s.pavementTemperature != null)
        ?.pavementTemperature ??
      temperatureF,
    surfaceCondition: worstCorridor?.condition || 'unknown',
    frictionMu:
      worstCorridor?.surfaceFriction ??
      studentRouteAssessment?.corridorSensors?.find((s) => s.surfaceFriction != null)
        ?.surfaceFriction ??
      0.65,
    county: district.county || undefined,
    urbanHint: superintendent?.terrain === 'urban',
  };

  const liveWeatherScore = Math.round(
    hasVTransCorridors && studentRouteAssessment
      ? Math.max(
          0,
          fullClosingScore // already blended; recover approximate pre-label weather via inverse not needed —
        )
      : fullClosingScore
  );

  // Prefer pre-blend weather when we still have route hazard; else use current close score
  const weatherForCalib = hasVTransCorridors
    ? Math.round(
        clampScore(
          // Reconstruct approximate weather contribution from additive path:
          // after blend fullClosing ≈ 0.7*hazard + 0.3*weather  → weather ≈ (full - 0.7*h)/0.3
          studentRouteAssessment
            ? (fullClosingScore -
                studentRouteAssessment.routeHazardScore * VT_SNOW_DAY_BASELINES.vtransWeight) /
                VT_SNOW_DAY_BASELINES.weatherWeight
            : fullClosingScore
        )
      )
    : liveWeatherScore;

  const calibrated = applyLiveTrainingCalibration({
    weatherScore: clampScore(weatherForCalib),
    corridorHazard: studentRouteAssessment?.routeHazardScore ?? 0,
    features: calibrationFeatures,
    passable: studentRouteAssessment?.passable,
  });

  // When VTrans corridors exist, trust calibrated multinomial; otherwise keep additive scores
  // but still apply arctic / ice overrides from training.
  if (hasVTransCorridors || calibrated.categoryLabel === 'Closed (Snow Day)') {
    fullClosingScore = calibrated.fullClosingProbability;
    delayScore = Math.max(delayScore, calibrated.delayProbability);
    // If training says delay preferred, keep close lower than delay
    if (calibrated.categoryLabel === 'Delayed Start (2-Hr)') {
      fullClosingScore = calibrated.fullClosingProbability;
      delayScore = calibrated.delayProbability;
    }
    if (calibrated.categoryLabel === 'Open (Normal)') {
      fullClosingScore = calibrated.fullClosingProbability;
      delayScore = calibrated.delayProbability;
    }
    factors.push(...calibrated.factors.slice(0, 6));
  } else {
    factors.push('Training calibration available — applied overrides only (no corridor RWIS)');
    if (windChill <= VT_SNOW_DAY_BASELINES.busStopWindChillF) {
      fullClosingScore = Math.max(fullClosingScore, calibrated.fullClosingProbability);
    }
  }

  // Early dismissal is less common, use lower scores
  earlyDismissalScore = Math.min(fullClosingScore * 0.6, 70);
  
  // Cap all scores at 100
  fullClosingScore = Math.min(100, Math.round(fullClosingScore));
  delayScore = Math.min(100, Math.round(delayScore));

  // Calculate confidence based on data quality and source diversity
  // Higher confidence when we have data from multiple sources and clear indicators
  let confidence = 70; // Base confidence
  if (forecast.snowfall && forecast.snowfall > 0) confidence += 10; // Actual snowfall data available
  if (forecast.ice && forecast.ice > 0) confidence += 10; // Ice data detected
  if (roadConditions.length > 0) confidence += 5; // Road condition data from multiple sources
  if (localRwis.length > 0) confidence += Math.min(localRwis.length, 8); // ZIP-local VTrans sensors
  if (studentRouteAssessment?.highSchools.length) confidence += 6; // Resolved high-school destinations
  if (studentRouteAssessment && studentRouteAssessment.corridorSensors.length > 0) {
    confidence += Math.min(10, 4 + studentRouteAssessment.corridorSensors.length); // Live pavement on student routes
  }
  if (resolvedZip) confidence += 5; // Precise ZIP geocode for forecast point
  if (historicalClosings.length >= 5) confidence += 5; // Historical pattern data
  if (thresholds.total_predictions && thresholds.total_predictions > 10) confidence += 5; // District has prediction history
  confidence = Math.min(confidence, 100);

  // Determine prediction date (when prediction was made)
  const predictionDate = new Date();
  // Use the target date we calculated (already set correctly above)
  const predictedForDate = targetDate;

  // Determine PRIMARY REASON for closure/delay (based on Vermont decision patterns)
  let primaryReason = 'No significant closure factors';
  let closureReasons: string[] = [];
  
  // Check timing first (most important factor in Vermont)
  // Note: hoursUntilTarget and forecastTargetHour are already defined above in Factor 5
  const isMorningCommuteWindow = forecastTargetHour >= 4 && forecastTargetHour <= 7;
  const isDecisionWindowForReasons = forecastTargetHour >= 4 && forecastTargetHour <= 6;
  
  if (fullClosingScore >= 70) {
    // Identify the main reason(s) for closure — VTrans school corridors first (highest weight)
    if (studentRouteAssessment && studentRouteAssessment.corridorSensors.length > 0) {
      const hs =
        studentRouteAssessment.highSchools.map((h) => h.name).join(', ') ||
        'district high school';
      if (!studentRouteAssessment.passable || studentRouteAssessment.routeHazardScore >= 55) {
        closureReasons.push(
          `VTrans RWIS on routes to ${hs}: hazard ${studentRouteAssessment.routeHazardScore}/100 (primary close signal)`
        );
      } else if (studentRouteAssessment.summary) {
        closureReasons.push(studentRouteAssessment.summary);
      }
    }

    // TIMING (most critical for forecast-only cases)
    if (isMorningCommuteWindow && snowfall > 0) {
      closureReasons.push(`Snow during morning commute window (4-7 AM) - buses start at 6 AM`);
    } else if (isDecisionWindowForReasons && conditionLower.includes('snow')) {
      closureReasons.push(`Active snow during decision window (4-6 AM)`);
    }
    
    // ICE (triggers closures even with small amounts)
    if (forecast.ice && forecast.ice >= (thresholds.ice_threshold || 0.05)) {
      closureReasons.push(`Ice accumulation (${forecast.ice.toFixed(2)}") - ice triggers closures even with small amounts`);
    } else if (conditionLower.includes('freezing rain')) {
      closureReasons.push(`Freezing rain warning - high closure likelihood`);
    } else if (forecast.ice && forecast.ice > 0) {
      closureReasons.push(`Ice conditions (${forecast.ice.toFixed(2)}") - even trace amounts are dangerous`);
    }
    
    // SNOWFALL (county-specific thresholds)
    if (
      snowfall >=
      (thresholds.full_closing_snowfall_threshold ||
        VT_SNOW_DAY_BASELINES.fullClosingSnowfallInches)
    ) {
      closureReasons.push(`Heavy snowfall (${snowfall.toFixed(1)}") - exceeds district threshold`);
    } else if (snowfall >= 6 && hoursUntilTarget <= 18) {
      closureReasons.push(`6"+ predicted by morning - often triggers night-before closure announcement`);
    }
    
    // TEMPERATURE & WIND CHILL (reuse estimateWindChillF from scoring)
    if (windChill <= VT_SNOW_DAY_BASELINES.busStopWindChillF) {
      closureReasons.push(
        `Arctic wind chill (${windChill.toFixed(0)}°F) - bus-stop safety close (training VT-SND-005)`
      );
    } else if (windChill <= -10) {
      closureReasons.push(`Very cold wind chill (${windChill.toFixed(0)}°F) - bus safety and frostbite risk`);
    } else if (temperatureF < (thresholds.temperature_threshold || 10)) {
      closureReasons.push(`Extreme cold (${temperatureF.toFixed(0)}°F)`);
    }
    
    // ROAD CONDITIONS (critical for bus safety) — prefer named local stations
    const dangerousRoads = roadConditions.filter(rc => 
      rc.condition === 'ice' || rc.condition === 'snow-covered' || rc.condition === 'closed'
    );
    if (dangerousRoads.length > 0) {
      const named = dangerousRoads
        .slice(0, 3)
        .map(
          (r) =>
            `${r.stationName || r.route}` +
            (r.distanceMiles ? ` (${r.distanceMiles.toFixed(1)} mi)` : '')
        )
        .join(', ');
      closureReasons.push(
        `Dangerous local road sensors: ${named} — roads may not be passable for buses`
      );
    }
    
    // WIND + SNOW (drifting)
    if (windSpeedMph >= 20 && snowfall > 0) {
      closureReasons.push(`Wind + snow = drifting on rural roads - makes roads impassable`);
    }
    
    primaryReason = closureReasons.length > 0 
      ? closureReasons[0] // Use first/most critical reason
      : 'Multiple factors combined';
  } else if (delayScore >= 50) {
    // Identify reasons for delay
    if (
      snowfall >=
        (thresholds.delay_snowfall_threshold || VT_SNOW_DAY_BASELINES.delaySnowfallInches) &&
      snowfall <
        (thresholds.full_closing_snowfall_threshold ||
          VT_SNOW_DAY_BASELINES.fullClosingSnowfallInches)
    ) {
      closureReasons.push(`Moderate snowfall (${snowfall.toFixed(1)}") - may delay rather than close`);
    }
    if (isMorningCommuteWindow) {
      closureReasons.push(`Snow timing during morning commute window`);
    }
    if (temperatureF <= 32 && temperatureF > (thresholds.temperature_threshold || 10)) {
      closureReasons.push(`Freezing temperatures (${temperatureF.toFixed(0)}°F)`);
    }
    if (forecast.ice && forecast.ice > 0 && forecast.ice < (thresholds.ice_threshold || 0.05)) {
      closureReasons.push(`Trace ice conditions - may delay rather than close`);
    }
    primaryReason = closureReasons.length > 0 
      ? `Delay likely due to: ${closureReasons[0]}` 
      : 'Moderate weather conditions';
  }

  // Prefer training-calibrated rationale when it is more specific
  if (calibrated.rationale) {
    primaryReason = calibrated.rationale;
    if (!closureReasons.includes(calibrated.rationale)) {
      closureReasons.unshift(calibrated.rationale);
    }
  }

  return {
    district_id: district?.id || 0,
    district_name: district?.district_name || String(districtIdentifier),
    prediction_date: predictionDate.toISOString().split('T')[0],
    predicted_for_date: predictedForDate.toISOString().split('T')[0],
    full_closing_probability: Math.round(fullClosingScore),
    delay_probability: Math.round(delayScore),
    early_dismissal_probability: Math.round(earlyDismissalScore),
    confidence: Math.min(100, Math.round(confidence)),
    forecast,
    factors,
    primary_reason: primaryReason,
    closure_reasons: closureReasons,
    thresholds,
    locationContext: {
      zip: resolvedZip?.zip || zipFromInput || undefined,
      city: resolvedZip?.city || district.city,
      county: district.county,
      latitude: originLat,
      longitude: originLon,
      displayName: locationDisplay,
      weatherQuery: location,
    },
    nearbySensors: roadConditions.slice(0, 12),
    localSensorBriefing: localSensorBriefing || undefined,
    studentRoutes: studentRouteAssessment || undefined,
    decision_category: calibrated.categoryLabel,
    p_closed: calibrated.pClosed,
    p_delay: calibrated.pDelay,
    p_open: calibrated.pOpen,
    training_rationale: calibrated.rationale,
    scoring_breakdown: {
      weather_score: calibrated.weatherScore,
      corridor_rwis_hazard: calibrated.corridorRwisHazard,
      blended_final_score: calibrated.blendedFinalScore,
      guards_applied: calibrated.guardsApplied,
    },
    user_breakdown: calibrated.userBreakdown,
  };
}

/** NWS-style wind chill (°F); returns air temp when wind chill does not apply. */
function estimateWindChillF(tempF: number, windMph: number): number {
  if (tempF > 50 || windMph <= 3) return tempF;
  const v = Math.pow(windMph, 0.16);
  return 35.74 + 0.6215 * tempF - 35.75 * v + 0.4275 * tempF * v;
}

function clampScore(n: number, lo = 0, hi = 100): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Build a timing-window label for training calibration from forecast + superintendent notes.
 */
function inferTimingWindowLabel(
  condition: string,
  morningNotes: string | undefined,
  plowStatus: SuperintendentInput['plowStatus'] | undefined,
  targetDate: Date
): string {
  const blob = `${condition} ${morningNotes || ''}`.toLowerCase();
  const hour = targetDate.getHours();

  if (blob.includes('extreme cold') || blob.includes('wind chill')) {
    return 'Extreme Cold Morning';
  }
  if (blob.includes('freezing rain') || blob.includes('ice storm')) {
    return hour >= 4 && hour <= 7 ? '5 AM flash freeze' : 'Overnight freezing rain';
  }
  if (
    plowStatus === 'clear' ||
    blob.includes('ended') ||
    blob.includes('clearing') ||
    blob.includes('ending by')
  ) {
    return 'Ended at 2 AM';
  }
  if (blob.includes('blowing') || blob.includes('drifting') || blob.includes('lake')) {
    return 'High wind morning';
  }
  if (hour >= 6 && hour <= 9 && blob.includes('start')) {
    return '6 AM - 9 AM start';
  }
  if (hour >= 4 && hour <= 7) {
    return blob.includes('heavy') ? '4 AM - 6 AM heavy band' : 'Ongoing morning snow';
  }
  if (hour < 4) {
    return 'Overnight into Morning';
  }
  return condition || 'other';
}

/**
 * County-specific adjustments based on Vermont geography and road conditions
 */
function getCountySpecificAdjustments(
  county: string,
  snowfall: number,
  temperatureF: number,
  windSpeedMph: number,
  iceInches: number,
  condition: string,
  targetDate: Date
): { closingAdjustment: number; delayAdjustment: number; factors: string[] } {
  const factors: string[] = [];
  let closingAdjustment = 0;
  let delayAdjustment = 0;
  
  const countyLower = (county || '').toLowerCase();
  const conditionLower = condition.toLowerCase();
  
  // Calculate timing factor (hours until target date)
  const now = new Date();
  const hoursUntilTargetForCounty = (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  const targetHourForCounty = targetDate.getHours();
  
  // Bennington County: 3-5" mountain roads, freezing rain sensitive, elevation changes
  if (countyLower.includes('bennington')) {
    if (snowfall >= 3 && snowfall < 5) {
      closingAdjustment += 15;
      factors.push('Bennington: Mountain road threshold (3-5")');
    }
    if (conditionLower.includes('freezing rain') || iceInches > 0) {
      closingAdjustment += 25;
      delayAdjustment += 15;
      factors.push('Bennington: Freezing rain detected (elevation changes)');
    }
    if (targetHourForCounty >= 4 && targetHourForCounty <= 5) {
      closingAdjustment += 10;
      factors.push('Bennington: High-risk timing (4-5 AM)');
    }
  }
  
  // Caledonia County: 4-6" overnight, -20°F wind chills, long rural routes
  if (countyLower.includes('caledonia')) {
    if (snowfall >= 4 && snowfall <= 6) {
      closingAdjustment += 20;
      factors.push('Caledonia: Overnight threshold (4-6")');
    }
    const windChill = temperatureF - (windSpeedMph * 0.7);
    if (windChill <= -20) {
      closingAdjustment += 25;
      delayAdjustment += 15;
      factors.push(`Caledonia: Extreme wind chill (${windChill.toFixed(0)}°F)`);
    }
    if (targetHourForCounty >= 0 && targetHourForCounty <= 6) {
      closingAdjustment += 12;
      factors.push('Caledonia: Overnight snow + extreme cold');
    }
  }
  
  // Chittenden County: Urban districts (Burlington, South Burlington, Winooski, Colchester)
  // Urban districts stay open more because city plows can clear bus routes faster
  // 4-6" overnight with active snow = closure
  // Heavy wet snow + wind = closure
  // South Burlington sets firm deadline ~5:15 AM for closure decision
  if (countyLower.includes('chittenden')) {
    if (snowfall >= 6) {
      closingAdjustment += 25;
      factors.push('Chittenden: Overnight threshold (6+") - urban districts but still close at high totals');
    } else if (snowfall >= 4 && snowfall <= 6 && hoursUntilTargetForCounty <= 12) {
      // 4-6" overnight with active snow = closure
      closingAdjustment += 20;
      delayAdjustment += 15;
      factors.push('Chittenden: 4-6" overnight with active snow = closure');
    } else if (snowfall >= 3 && snowfall <= 4 && targetHourForCounty >= 5 && targetHourForCounty <= 9) {
      // 3-4" during commute = delay/closure
      closingAdjustment += 18;
      delayAdjustment += 15;
      factors.push('Chittenden: Commute-time snow (3-4") - decision deadline ~5:15 AM');
    }
    if (conditionLower.includes('freezing rain')) {
      closingAdjustment += 20;
      factors.push('Chittenden: Freezing rain risk');
    }
    // Heavy wet snow + wind = closure
    if (snowfall >= 4 && temperatureF >= 28 && temperatureF <= 32 && windSpeedMph >= 20) {
      closingAdjustment += 15;
      factors.push('Chittenden: Heavy wet snow + wind = closure');
    }
    // Urban advantage: Slightly less likely to close than rural districts
    closingAdjustment -= 3; // City plows faster
  }
  
  // Essex County: 2-4", any ice, very remote
  if (countyLower.includes('essex')) {
    if (snowfall >= 2 && snowfall <= 4) {
      closingAdjustment += 20;
      factors.push('Essex: Remote road threshold (2-4")');
    }
    if (iceInches > 0 || conditionLower.includes('ice')) {
      closingAdjustment += 30;
      delayAdjustment += 20;
      factors.push('Essex: Any ice = closure risk (limited plowing)');
    }
    if (targetHourForCounty >= 0 && targetHourForCounty <= 6) {
      closingAdjustment += 10;
      factors.push('Essex: Overnight snowfall');
    }
  }
  
  // Franklin County: 4-6", blowing snow, lake-effect
  if (countyLower.includes('franklin')) {
    if (snowfall >= 4 && snowfall <= 6) {
      closingAdjustment += 18;
      factors.push('Franklin: Threshold (4-6")');
    }
    if (windSpeedMph >= 20 && snowfall > 0) {
      closingAdjustment += 15;
      delayAdjustment += 10;
      factors.push('Franklin: Blowing snow (open farmland)');
    }
    if (targetHourForCounty >= 0 && targetHourForCounty <= 6) {
      closingAdjustment += 8;
      factors.push('Franklin: Early-morning lake-effect');
    }
  }
  
  // Grand Isle County: 3-5", high winds, bridges/causeways
  if (countyLower.includes('grand isle')) {
    if (snowfall >= 3 && snowfall <= 5) {
      closingAdjustment += 15;
      factors.push('Grand Isle: Threshold (3-5")');
    }
    if (windSpeedMph >= 25) {
      closingAdjustment += 20;
      delayAdjustment += 15;
      factors.push('Grand Isle: High winds (bridges/causeways)');
    }
    if (targetHourForCounty >= 0 && targetHourForCounty <= 8 && snowfall > 0) {
      closingAdjustment += 12;
      factors.push('Grand Isle: Overnight snow + morning wind');
    }
  }
  
  // Lamoille County: Northern/Rural - Stowe, Harwood Union area
  // Very long, rural bus routes mean even moderate snow overnight can make roads hazardous
  // 3-5" overnight + wind drift often enough for closure
  // District leaders start reviewing conditions as early as 4 AM
  if (countyLower.includes('lamoille')) {
    if (snowfall >= 3 && snowfall <= 5 && hoursUntilTargetForCounty <= 12) {
      // 3-5" overnight + wind drift often enough for closure
      closingAdjustment += 20;
      delayAdjustment += 12;
      factors.push('Lamoille: 3-5" overnight + wind drift often enough for closure (rural side roads take longer to plow)');
    } else if (snowfall >= 3 && snowfall <= 5) {
      closingAdjustment += 16;
      factors.push('Lamoille: Mountain road threshold (3-5")');
    }
    if (iceInches > 0 && snowfall > 0) {
      closingAdjustment += 25;
      delayAdjustment += 15;
      factors.push('Lamoille: Ice under snow (mountain roads) - very long rural bus routes');
    }
    if (targetHourForCounty >= 0 && targetHourForCounty <= 6) {
      closingAdjustment += 12;
      factors.push('Lamoille: Snow before sunrise - rural routes hazardous by bus start time');
    }
    // Wind drift on rural roads
    if (windSpeedMph >= 20 && snowfall > 0) {
      closingAdjustment += 12;
      factors.push('Lamoille: Wind drift on rural roads - makes roads impassable');
    }
    // Early morning review (4 AM)
    if (targetHourForCounty >= 4 && targetHourForCounty <= 6) {
      closingAdjustment += 8;
      factors.push('Lamoille: Early morning review window (4 AM) - coordinate with road crews');
    }
  }
  
  // Orange County: 4-6", snow + rising rivers, dirt roads
  if (countyLower.includes('orange')) {
    if (snowfall >= 4 && snowfall <= 6) {
      closingAdjustment += 18;
      factors.push('Orange: Threshold (4-6")');
    }
    if (conditionLower.includes('flood') || conditionLower.includes('river')) {
      closingAdjustment += 15;
      factors.push('Orange: River flooding + snowmelt');
    }
    if (targetHourForCounty >= 0 && targetHourForCounty <= 6) {
      closingAdjustment += 10;
      factors.push('Orange: Overnight accumulation');
    }
  }
  
  // Orleans County: 3-5", extreme cold, lake-effect
  if (countyLower.includes('orleans')) {
    if (snowfall >= 3 && snowfall <= 5) {
      closingAdjustment += 16;
      factors.push('Orleans: Threshold (3-5")');
    }
    if (temperatureF <= -15) {
      closingAdjustment += 25;
      delayAdjustment += 15;
      factors.push(`Orleans: Extreme cold (${temperatureF.toFixed(0)}°F)`);
    }
    if (targetHourForCounty >= 0 && targetHourForCounty <= 6) {
      closingAdjustment += 10;
      factors.push('Orleans: Lake-effect snow overnight');
    }
  }
  
  // Rutland County: Southwest VT - 4-7" overnight frequently leads to closures
  // Smaller transportation departments, hill roads make early morning travel riskier
  // Ice layers (not pure snow) = especially bad
  if (countyLower.includes('rutland')) {
    if (snowfall >= 4 && snowfall <= 7 && hoursUntilTargetForCounty <= 12) {
      // 4-7" overnight frequently leads to closures
      closingAdjustment += 22;
      delayAdjustment += 15;
      factors.push('Rutland: 4-7" overnight frequently leads to closures (trucks still clearing side roads at bus start)');
    } else if (snowfall >= 4 && snowfall <= 6) {
      closingAdjustment += 18;
      factors.push('Rutland: Threshold (4-6")');
    }
    if (conditionLower.includes('ice storm') || iceInches >= 0.1) {
      closingAdjustment += 30;
      delayAdjustment += 20;
      factors.push('Rutland: Ice storm (mountain passes) - ice layers especially dangerous');
    }
    // Ice layers rather than pure snow = especially bad
    if (iceInches > 0 && snowfall > 0) {
      closingAdjustment += 12;
      factors.push('Rutland: Ice layers under snow - especially dangerous');
    }
    if (targetHourForCounty >= 0 && targetHourForCounty <= 6) {
      closingAdjustment += 12;
      factors.push('Rutland: Snow before 6 AM - hill roads risky');
    }
    // Wind that causes drifting
    if (windSpeedMph >= 20 && snowfall > 0) {
      closingAdjustment += 10;
      factors.push('Rutland: Wind causing drifting - makes roads impassable');
    }
  }
  
  // Washington County: 3-5", ice accumulation, mixed elevation
  if (countyLower.includes('washington')) {
    if (snowfall >= 3 && snowfall <= 5) {
      closingAdjustment += 16;
      factors.push('Washington: Threshold (3-5")');
    }
    if (iceInches > 0) {
      closingAdjustment += 22;
      delayAdjustment += 15;
      factors.push('Washington: Ice accumulation (mixed elevation)');
    }
    if (targetHourForCounty >= 0 && targetHourForCounty <= 6) {
      closingAdjustment += 10;
      factors.push('Washington: Snow before dawn');
    }
  }
  
  // Windham County: 4-6", flooding + snow, river valleys
  if (countyLower.includes('windham')) {
    if (snowfall >= 4 && snowfall <= 6) {
      closingAdjustment += 18;
      factors.push('Windham: Threshold (4-6")');
    }
    if (conditionLower.includes('flood')) {
      closingAdjustment += 20;
      factors.push('Windham: Flooding + snow (river valleys)');
    }
    if (targetHourForCounty >= 0 && targetHourForCounty <= 8) {
      closingAdjustment += 10;
      factors.push('Windham: Overnight/early-morning storms');
    }
  }
  
  // Windsor County: 4-6", snow + ice mix, Connecticut River
  if (countyLower.includes('windsor')) {
    if (snowfall >= 4 && snowfall <= 6) {
      closingAdjustment += 18;
      factors.push('Windsor: Threshold (4-6")');
    }
    if (iceInches > 0 && snowfall > 0) {
      closingAdjustment += 22;
      delayAdjustment += 15;
      factors.push('Windsor: Snow + ice mix');
    }
    if (targetHourForCounty >= 0 && targetHourForCounty <= 6) {
      closingAdjustment += 12;
      factors.push('Windsor: Snow before 5-6 AM');
    }
    if (conditionLower.includes('flood')) {
      closingAdjustment += 15;
      factors.push('Windsor: Connecticut River flooding');
    }
  }
  
  // Addison County: 4-6" overnight, 2-3" during commute, lake-effect
  if (countyLower.includes('addison')) {
    if (snowfall >= 4 && snowfall <= 6 && targetHourForCounty >= 0 && targetHourForCounty <= 6) {
      closingAdjustment += 20;
      factors.push('Addison: Overnight threshold (4-6")');
    } else if (snowfall >= 2 && snowfall <= 3 && targetHourForCounty >= 5 && targetHourForCounty <= 9) {
      closingAdjustment += 18;
      delayAdjustment += 12;
      factors.push('Addison: Commute-time snow (2-3")');
    }
    if (targetHourForCounty >= 0 && targetHourForCounty <= 4) {
      closingAdjustment += 10;
      factors.push('Addison: Snow after midnight (higher risk)');
    }
    if (windSpeedMph >= 20) {
      closingAdjustment += 8;
      factors.push('Addison: Lake-effect bursts');
    }
  }
  
  return { closingAdjustment, delayAdjustment, factors };
}

/**
 * Get probability category description
 * Aligned to VT-SND training labels: Closed / Delayed Start / Open
 */
export function getProbabilityCategory(probability: number): string {
  return getCalibratedProbabilityCategory(probability);
}

/**
 * Get snow day predictions for tomorrow and the following week (8 days total)
 * This fetches all forecasts at once for efficiency
 */
export async function predictSnowDaysForWeek(
  districtIdentifier: string | number,
  superintendent?: SuperintendentInput
): Promise<MultiDaySnowDayPredictions | null> {
  // Get district (or use fallback - predictSnowDay will handle fallback districts)
  let district;
  let districtName = String(districtIdentifier);
  if (typeof districtIdentifier === 'number') {
    const { getAllDistricts } = await import('./schoolDistrictService');
    const districts = await getAllDistricts();
    district = districts.find(d => d.id === districtIdentifier);
    if (district) {
      districtName = district.district_name;
    }
  } else if (/^\d{5}$/.test(String(districtIdentifier))) {
    district = await getDistrictByZipCode(String(districtIdentifier));
    if (district) {
      districtName = district.district_name;
    }
  } else {
    district = await getDistrictByName(String(districtIdentifier));
    if (district) {
      districtName = district.district_name;
    }
  }

  // Note: Even if district is not found, predictSnowDay will handle it with fallback defaults
  // So we continue and let predictSnowDay handle the fallback case

  // Generate predictions for tomorrow + next 7 days (8 days total)
  const predictions: SnowDayPrediction[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of day
  
  // Fetch predictions for each day (tomorrow = day 1, through day 8)
  // Note: Each predictSnowDay call will fetch forecasts individually
  // This ensures we get the most up-to-date forecast for each specific date
  for (let i = 1; i <= 8; i++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + i);
    targetDate.setHours(0, 0, 0, 0); // Normalize to start of day
    
    try {
      const prediction = await predictSnowDay(districtIdentifier, targetDate, superintendent);
      if (prediction) {
        predictions.push(prediction);
        console.log(`[Snow Day Prediction] Day ${i} (${prediction.predicted_for_date}): Closing ${prediction.full_closing_probability}%, Delay ${prediction.delay_probability}%, Confidence ${prediction.confidence}%`);
      } else {
        console.warn(`[Snow Day Prediction] No prediction returned for day ${i} (${targetDate.toISOString().split('T')[0]})`);
      }
    } catch (error) {
      console.error(`[Snow Day Prediction] Error predicting for day ${i} (${targetDate.toISOString().split('T')[0]}):`, error instanceof Error ? error.message : error);
      // Continue with other days even if one fails
    }
  }
  
  if (predictions.length > 0) {
    console.log(`[Snow Day Prediction] Successfully generated ${predictions.length}/8 predictions for ${districtName}`);
  } else {
    console.error(`[Snow Day Prediction] Failed to generate any predictions for ${districtName}`);
  }

  // Return predictions - use district ID from first prediction if available, or 0 for fallback
  return {
    district_id: predictions.length > 0 ? predictions[0].district_id : (district?.id || 0),
    district_name: districtName,
    predictions,
  };
}









