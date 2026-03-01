/**
 * Detailed Road Safety Scoring Algorithm
 * 
 * This service provides sophisticated, multi-factor road safety assessment
 * that considers multiple variables to determine accurate, varying danger levels.
 * 
 * Factors considered:
 * - Road condition type and severity
 * - Temperature (critical for ice formation)
 * - Data freshness/age
 * - Source reliability
 * - Road type/importance
 * - Time of day
 * - Weather conditions (wind, visibility)
 * - Combination effects (e.g., ice + extreme cold = more dangerous)
 */

import { RoadCondition } from './roadDataService';

export interface DetailedRoadSafetyScore {
  safetyScore: number; // 0-100, higher is safer
  safetyLevel: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
  severity: 'low' | 'moderate' | 'high' | 'extreme';
  factors: {
    baseCondition: { score: number; weight: number; description: string };
    temperature: { score: number; weight: number; description: string };
    dataFreshness: { score: number; weight: number; description: string };
    severity: { score: number; weight: number; description: string };
    sourceReliability: { score: number; weight: number; description: string };
    roadType: { score: number; weight: number; description: string };
    timeOfDay: { score: number; weight: number; description: string };
    combinationEffects: { score: number; weight: number; description: string };
  };
  explanation: string;
  confidence: number; // 0-100, how confident we are in this assessment
}

// Source reliability scores (0-100, higher = more reliable)
const SOURCE_RELIABILITY: Record<string, number> = {
  'VTrans RWIS': 100,
  'VTrans Lane Closure': 95,
  'VTrans Incident': 95,
  'NWS': 90,
  'Xweather': 80,
  'TomTom': 75,
  'New England 511': 70,
  'Weatherbit': 70,
  'Weatherstack': 65,
  'Visual Crossing': 65,
  'OpenWeatherMap': 60,
  'Unknown': 50,
};

/**
 * Get weather data for a location (needed for temperature/wind calculations)
 */
async function getWeatherForLocation(lat?: number, lon?: number): Promise<{
  temperature?: number; // Celsius
  windSpeed?: number; // m/s
  humidity?: number;
  description?: string;
}> {
  // Try to fetch weather if coordinates available
  // For now, return empty - will be enhanced when weather service is available
  // In practice, this should call unifiedWeatherService
  return {};
}

/**
 * Calculate detailed road safety score based on multiple factors
 */
export async function calculateDetailedRoadSafetyScore(
  condition: RoadCondition,
  weatherContext?: {
    temperature?: number; // Fahrenheit
    windSpeed?: number; // mph
    humidity?: number;
  }
): Promise<DetailedRoadSafetyScore> {
  
  // Start with base score of 100 (perfect conditions)
  let totalScore = 100;
  const factors: DetailedRoadSafetyScore['factors'] = {
    baseCondition: { score: 100, weight: 40, description: '' },
    temperature: { score: 100, weight: 20, description: '' },
    dataFreshness: { score: 100, weight: 10, description: '' },
    severity: { score: 100, weight: 15, description: '' },
    sourceReliability: { score: 100, weight: 5, description: '' },
    roadType: { score: 100, weight: 5, description: '' },
    timeOfDay: { score: 100, weight: 3, description: '' },
    combinationEffects: { score: 100, weight: 2, description: '' },
  };

  // Convert temperature to Fahrenheit if needed
  let tempF = weatherContext?.temperature;
  if (condition.temperature !== undefined) {
    // Condition temperature is already in Fahrenheit (set in route.ts)
    // Only convert if it's clearly in Celsius (very cold values < 0 or reasonable Celsius range)
    if (condition.temperature < -10 || (condition.temperature >= -10 && condition.temperature <= 50 && condition.temperature !== Math.round(condition.temperature))) {
      // Likely Celsius - convert
      tempF = Math.round((condition.temperature * 9/5) + 32);
    } else {
      // Already in Fahrenheit
      tempF = condition.temperature;
    }
  }
  const windMph = weatherContext?.windSpeed ? weatherContext.windSpeed : undefined;
  const humidity = weatherContext?.humidity;

  // FACTOR 1: Base Condition (40% weight) - Most important
  let baseConditionScore = 100;
  let baseDescription = '';
  
  switch (condition.condition) {
    case 'closed':
      baseConditionScore = 5; // Closed roads are extremely dangerous
      baseDescription = 'Road is closed - do not travel';
      break;
      
    case 'ice':
      baseConditionScore = 20; // Ice is very dangerous, but severity varies
      baseDescription = 'Ice conditions reported';
      break;
      
    case 'snow-covered':
      baseConditionScore = 35; // Snow-covered roads vary by depth and temperature
      baseDescription = 'Snow-covered roads';
      break;
      
    case 'wet':
      baseConditionScore = 60; // Wet roads are moderately dangerous
      baseDescription = 'Wet road conditions';
      break;
      
    case 'clear':
      baseConditionScore = 95; // Clear roads are generally safe
      baseDescription = 'Clear road conditions';
      break;
      
    case 'unknown':
      baseConditionScore = 50; // Unknown conditions - assume moderate risk
      baseDescription = 'Road conditions unknown';
      break;
  }
  
  factors.baseCondition = { score: baseConditionScore, weight: 40, description: baseDescription };
  totalScore = (totalScore * 0.6) + (baseConditionScore * 0.4);

  // FACTOR 2: Temperature Impact (20% weight) - Critical for ice formation
  let temperatureScore = 100;
  let tempDescription = '';
  
  if (tempF !== undefined) {
    if (tempF <= 20) {
      // Extremely cold - instant ice formation risk
      temperatureScore = 15;
      tempDescription = `Extremely cold (${tempF}°F) - severe ice formation risk`;
      
      // Combination: ice + extreme cold = even more dangerous
      if (condition.condition === 'ice') {
        temperatureScore = 5; // Ice at extreme cold is catastrophic
        tempDescription += ' - ice conditions exacerbated by extreme cold';
      }
    } else if (tempF <= 28) {
      // Very cold - high ice risk
      temperatureScore = 30;
      tempDescription = `Very cold (${tempF}°F) - high ice formation risk`;
      
      if (condition.condition === 'ice') {
        temperatureScore = 10;
        tempDescription += ' - ice conditions exacerbated by very cold temperatures';
      } else if (condition.condition === 'wet') {
        temperatureScore = 25; // Wet at very cold = immediate ice
        tempDescription += ' - wet roads will freeze instantly';
      }
    } else if (tempF <= 32) {
      // At freezing - moderate ice risk
      temperatureScore = 50;
      tempDescription = `At freezing (${tempF}°F) - ice can form rapidly`;
      
      if (condition.condition === 'ice') {
        temperatureScore = 20;
        tempDescription += ' - active ice formation';
      } else if (condition.condition === 'wet') {
        temperatureScore = 35; // Wet at freezing = high refreeze risk
        tempDescription += ' - wet roads will freeze as temps drop';
      }
    } else if (tempF <= 35) {
      // Near freezing - some ice risk
      temperatureScore = 70;
      tempDescription = `Near freezing (${tempF}°F) - monitor for ice formation`;
      
      if (condition.condition === 'wet') {
        temperatureScore = 55; // Wet near freezing = possible refreeze
        tempDescription += ' - wet roads may refreeze overnight';
      }
    } else if (tempF <= 40) {
      // Cold but above freezing
      temperatureScore = 85;
      tempDescription = `Cold (${tempF}°F) - low ice risk in shaded areas`;
    } else {
      // Warm - minimal ice risk
      temperatureScore = 95;
      tempDescription = `Warm (${tempF}°F) - minimal ice risk`;
    }
    
    // Humidity adjustment (high humidity + cold = more ice risk)
    if (humidity && tempF <= 35 && humidity > 80) {
      temperatureScore = Math.max(0, temperatureScore - 15);
      tempDescription += ` - high humidity (${humidity}%) increases ice formation risk`;
    }
  } else {
    // No temperature data - assume moderate risk
    temperatureScore = 70;
    tempDescription = 'Temperature data not available - assume moderate risk';
  }
  
  factors.temperature = { score: temperatureScore, weight: 20, description: tempDescription };
  totalScore = (totalScore * 0.8) + (temperatureScore * 0.2);

  // FACTOR 3: Data Freshness (10% weight) - Stale data is less reliable
  let dataFreshnessScore = 100;
  let freshnessDescription = '';
  
  const dataAge = Date.now() - new Date(condition.timestamp).getTime();
  const dataAgeMinutes = Math.floor(dataAge / (60 * 1000));
  const dataAgeHours = Math.floor(dataAgeMinutes / 60);
  
  if (dataAgeMinutes <= 30) {
    // Very fresh data (within 30 minutes)
    dataFreshnessScore = 100;
    freshnessDescription = `Data is fresh (${dataAgeMinutes} minutes old)`;
  } else if (dataAgeMinutes <= 60) {
    // Fresh data (within 1 hour)
    dataFreshnessScore = 90;
    freshnessDescription = `Data is recent (${dataAgeMinutes} minutes old)`;
  } else if (dataAgeHours <= 2) {
    // Moderately fresh (within 2 hours)
    dataFreshnessScore = 75;
    freshnessDescription = `Data is ${dataAgeHours} hour(s) old - conditions may have changed`;
    
    // Stale data for dangerous conditions is more concerning
    if (condition.condition === 'ice' || condition.condition === 'closed') {
      dataFreshnessScore = 50; // Stale ice data is unreliable
      freshnessDescription += ' - stale data for dangerous conditions is unreliable';
    }
  } else if (dataAgeHours <= 6) {
    // Stale data (2-6 hours)
    dataFreshnessScore = 50;
    freshnessDescription = `Data is ${dataAgeHours} hours old - may be outdated`;
    
    if (condition.condition === 'ice' || condition.condition === 'closed') {
      dataFreshnessScore = 25;
      freshnessDescription += ' - stale data for dangerous conditions is highly unreliable';
    }
  } else {
    // Very stale data (> 6 hours)
    dataFreshnessScore = 20;
    freshnessDescription = `Data is ${dataAgeHours} hours old - likely outdated`;
    
    // Very stale data for dangerous conditions should downgrade the rating
    if (condition.condition === 'ice' || condition.condition === 'closed') {
      dataFreshnessScore = 10;
      freshnessDescription += ' - very stale data for dangerous conditions';
    }
  }
  
  factors.dataFreshness = { score: dataFreshnessScore, weight: 10, description: freshnessDescription };
  totalScore = (totalScore * 0.9) + (dataFreshnessScore * 0.1);

  // FACTOR 4: Severity Level (15% weight) - MAJOR incidents are more dangerous
  let severityScore = 100;
  let severityDescription = '';
  
  if (condition.severity === 'MAJOR') {
    severityScore = 20;
    severityDescription = 'MAJOR severity incident - extreme danger';
  } else if (condition.severity === 'MODERATE') {
    severityScore = 50;
    severityDescription = 'MODERATE severity - significant danger';
  } else if (condition.severity === 'MINOR') {
    severityScore = 80;
    severityDescription = 'MINOR severity - some risk';
  } else {
    // No severity specified - use default based on condition
    if (condition.condition === 'closed' || condition.condition === 'ice') {
      severityScore = 40; // Assume moderate-high severity for dangerous conditions
      severityDescription = 'No severity specified - assuming moderate-high risk for dangerous condition';
    } else {
      severityScore = 85;
      severityDescription = 'No severity specified - assuming moderate risk';
    }
  }
  
  factors.severity = { score: severityScore, weight: 15, description: severityDescription };
  totalScore = (totalScore * 0.85) + (severityScore * 0.15);

  // FACTOR 5: Source Reliability (5% weight) - Official sources are more trustworthy
  const sourceReliabilityScore = SOURCE_RELIABILITY[condition.source] || SOURCE_RELIABILITY['Unknown'];
  const sourceDescription = `Source: ${condition.source} (reliability: ${sourceReliabilityScore}%)`;
  
  factors.sourceReliability = { 
    score: sourceReliabilityScore, 
    weight: 5, 
    description: sourceDescription 
  };
  totalScore = (totalScore * 0.95) + (sourceReliabilityScore * 0.05);

  // FACTOR 6: Road Type/Importance (5% weight) - Major highways more important
  let roadTypeScore = 100;
  let roadTypeDescription = '';
  
  const routeName = (condition.route || '').toLowerCase();
  if (routeName.includes('i-89') || routeName.includes('i-91') || routeName.includes('interstate')) {
    roadTypeScore = 85; // Interstate highways - slight penalty for dangerous conditions (higher impact)
    roadTypeDescription = 'Interstate highway - high traffic volume increases impact';
  } else if (routeName.includes('us route') || routeName.includes('us-')) {
    roadTypeScore = 88;
    roadTypeDescription = 'US Route - significant traffic volume';
  } else if (routeName.includes('vt route') || routeName.includes('vt-') || routeName.includes('route')) {
    roadTypeScore = 92;
    roadTypeDescription = 'State route - moderate traffic volume';
  } else {
    roadTypeScore = 95; // Local roads - lower impact
    roadTypeDescription = 'Local road - lower traffic volume';
  }
  
  factors.roadType = { score: roadTypeScore, weight: 5, description: roadTypeDescription };
  totalScore = (totalScore * 0.95) + (roadTypeScore * 0.05);

  // FACTOR 7: Time of Day (3% weight) - Night/early morning increases ice risk
  let timeOfDayScore = 100;
  let timeDescription = '';
  
  const hour = new Date().getHours();
  const isNightOrEarlyMorning = hour >= 22 || hour <= 7;
  
  if (isNightOrEarlyMorning && tempF !== undefined && tempF <= 35) {
    timeOfDayScore = 80; // Night/early morning + cold = increased ice risk
    timeDescription = `Night/early morning (${hour}:00) - lower road temperatures increase ice risk`;
    
    if (condition.condition === 'wet' && tempF <= 35) {
      timeOfDayScore = 60; // Wet at night in cold = high refreeze risk
      timeDescription += ' - wet roads will refreeze during night hours';
    }
  } else {
    timeOfDayScore = 100;
    timeDescription = `Daytime (${hour}:00) - normal risk period`;
  }
  
  factors.timeOfDay = { score: timeOfDayScore, weight: 3, description: timeDescription };
  totalScore = (totalScore * 0.97) + (timeOfDayScore * 0.03);

  // FACTOR 8: Combination Effects (2% weight) - Multiple factors together
  let combinationScore = 100;
  let combinationDescription = 'No significant combination effects';
  
  // Ice + extreme cold = catastrophic
  if (condition.condition === 'ice' && tempF !== undefined && tempF <= 20) {
    combinationScore = 0;
    combinationDescription = 'ICE + EXTREME COLD: Catastrophic combination - instant ice formation';
  }
  // Ice + high wind = more dangerous
  else if (condition.condition === 'ice' && windMph !== undefined && windMph >= 30) {
    combinationScore = 30;
    combinationDescription = 'ICE + STRONG WIND: Wind reduces traction further';
  }
  // Snow + high wind = whiteout/blowing snow
  else if (condition.condition === 'snow-covered' && windMph !== undefined && windMph >= 30) {
    combinationScore = 40;
    combinationDescription = 'SNOW + STRONG WIND: Blowing snow reduces visibility';
  }
  // Wet + near freezing + night = refreeze risk
  else if (condition.condition === 'wet' && tempF !== undefined && tempF <= 35 && isNightOrEarlyMorning) {
    combinationScore = 50;
    combinationDescription = 'WET + COLD + NIGHT: High refreeze risk';
  }
  // Closed + ice = extreme danger
  else if (condition.condition === 'closed' && condition.warning?.toLowerCase().includes('ice')) {
    combinationScore = 5;
    combinationDescription = 'CLOSED + ICE: Road closed due to ice - extreme danger';
  }
  
  factors.combinationEffects = { score: combinationScore, weight: 2, description: combinationDescription };
  totalScore = (totalScore * 0.98) + (combinationScore * 0.02);

  // Apply data freshness penalty for dangerous conditions
  // If data is stale for a dangerous condition, reduce score further
  if ((condition.condition === 'ice' || condition.condition === 'closed') && dataAgeHours > 2) {
    // Reduce score by 10-20 points for stale dangerous data
    const stalePenalty = Math.min(20, dataAgeHours * 5);
    totalScore = Math.max(0, totalScore - stalePenalty);
  }

  // Ensure score is within bounds
  totalScore = Math.max(0, Math.min(100, totalScore));

  // Determine safety level and severity
  let safetyLevel: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
  let severity: 'low' | 'moderate' | 'high' | 'extreme';
  
  if (totalScore >= 80) {
    safetyLevel = 'excellent';
    severity = 'low';
  } else if (totalScore >= 60) {
    safetyLevel = 'good';
    severity = 'low';
  } else if (totalScore >= 40) {
    safetyLevel = 'caution';
    severity = 'moderate';
  } else if (totalScore >= 20) {
    safetyLevel = 'poor';
    severity = 'high';
  } else {
    safetyLevel = 'hazardous';
    severity = 'extreme';
  }

  // Calculate confidence based on data completeness and freshness
  let confidence = 85; // Default confidence
  
  // Increase confidence if we have temperature data
  if (tempF !== undefined) confidence += 5;
  
  // Decrease confidence if data is stale
  if (dataAgeHours > 2) confidence -= 15;
  else if (dataAgeHours > 1) confidence -= 10;
  
  // Decrease confidence for unknown conditions
  if (condition.condition === 'unknown') confidence -= 10;
  
  // Increase confidence for official sources
  if (condition.source.includes('VTrans') || condition.source === 'NWS') confidence += 5;
  
  confidence = Math.max(50, Math.min(100, confidence));

  // Build explanation
  const explanation = `Safety score: ${Math.round(totalScore)}/100. ` +
    `${baseDescription}. ${tempDescription}. ${freshnessDescription}. ` +
    `${severityDescription}. ${sourceDescription}. ${combinationDescription}`;

  return {
    safetyScore: Math.round(totalScore),
    safetyLevel,
    severity,
    factors,
    explanation,
    confidence,
  };
}









