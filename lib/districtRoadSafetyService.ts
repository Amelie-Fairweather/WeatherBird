/**
 * District Road Safety Service
 * Calculates road safety ratings for specific school districts based on zip codes and current weather
 */

import { fetchAllRoadConditions } from './roadDataService';
import { getDistrictByZipCode, getDistrictByName, getAllDistricts, SchoolDistrict } from './schoolDistrictService';
import { fetchWeatherFromProvider } from './unifiedWeatherService';

export interface RoadSafetyRating {
  district: string;
  rating: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
  score: number; // 0-100, higher is safer
  conditions: string[];
  warnings: string[];
  recommendations: string[];
  lastUpdated: string;
  // Detailed breakdown
  factors: {
    temperature: { value: number; impact: number; description: string };
    precipitation: { type: string; impact: number; description: string };
    roadConditions: { conditions: string[]; impact: number; description: string };
    wind: { speed: number; impact: number; description: string };
    visibility: { level: string; impact: number; description: string };
    timeOfDay: { period: string; impact: number; description: string };
    blackIceRisk: { risk: 'low' | 'moderate' | 'high' | 'extreme'; description: string };
    overallAssessment: string;
  };
  dataSources: string[];
  confidence: number; // 0-100, how confident we are in this rating
}

/**
 * Calculate road safety rating for a district based on weather and road conditions
 */
export async function calculateDistrictRoadSafety(
  districtIdentifier: string | number
): Promise<RoadSafetyRating | null> {
  // Get district info
  let district: SchoolDistrict | null = null;
  
  if (typeof districtIdentifier === 'string') {
    // Try zip code first
    if (/^\d{5}$/.test(districtIdentifier)) {
      district = await getDistrictByZipCode(districtIdentifier);
    }
    // If not found or not a zip, try district name
    if (!district) {
      district = await getDistrictByName(districtIdentifier);
    }
    
    // If still not found, try to find district by city name
    if (!district) {
      const allDistricts = await getAllDistricts();
      district = allDistricts.find(d => 
        d.city?.toLowerCase().includes(districtIdentifier.toLowerCase()) ||
        districtIdentifier.toLowerCase().includes(d.city?.toLowerCase() || '')
      ) || null;
    }
  }

  // Determine location for weather data - prefer coordinates for accuracy, then city, then district name
  // This improves Xweather data accuracy by using district-specific locations
  let location = typeof districtIdentifier === 'string' ? districtIdentifier : 'Vermont';
  if (district) {
    if (district.latitude && district.longitude) {
      // Use coordinates for most accurate location-specific data (best for Xweather)
      location = `${district.latitude},${district.longitude}`;
    } else if (district.city) {
      // Use city name (better than district name for Xweather)
      location = district.city;
    } else if (district.district_name) {
      location = district.district_name;
    }
  }
  
  // Use district name for the rating result, or location name if no district found
  const districtName = district?.district_name || location;
  
  let currentWeather;
  
  try {
    const weatherData = await fetchWeatherFromProvider(location, 'auto');
    currentWeather = {
      temperature: weatherData.temperature,
      description: weatherData.description,
      windSpeed: weatherData.windSpeed,
      humidity: weatherData.humidity,
    };
  } catch (error) {
    console.error('Error fetching weather for district:', error);
  }

  // Get road conditions for the area (using district's zip codes or city)
  // CRITICAL: Use district-specific location to get accurate local road conditions
  const roadConditions = await fetchAllRoadConditions(location);
  
  // Factor in district-specific geography (county, elevation, etc.)
  // This ensures districts in different areas get different ratings even with similar weather
  let locationModifier = 0;
  if (district?.county) {
    const countyLower = district.county.toLowerCase();
    // Mountain counties (higher elevation = more dangerous in winter)
    if (countyLower.includes('lamoille') || countyLower.includes('rutland') || 
        countyLower.includes('washington') || countyLower.includes('orleans')) {
      locationModifier -= 5; // Mountain roads are more dangerous
    }
    // Remote counties (less plowing resources)
    if (countyLower.includes('essex') || countyLower.includes('caledonia')) {
      locationModifier -= 8; // Remote areas have less plowing
    }
    // Lake-effect areas (more variable conditions)
    if (countyLower.includes('franklin') || countyLower.includes('grand isle') || 
        countyLower.includes('addison') || countyLower.includes('orleans')) {
      locationModifier -= 3; // Lake-effect can cause sudden changes
    }
  }
  
  // Calculate safety score with comprehensive factors
  let score = 100; // Start with perfect score
  score += locationModifier; // Apply location-specific modifier
  const conditions: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const dataSources: string[] = [];
  
  let tempF = 0;
  let windMph = 0;
  let humidity = 0;

  // Factor 1: Temperature (comprehensive analysis)
  if (currentWeather) {
    tempF = Math.round((currentWeather.temperature * 9/5) + 32);
    windMph = Math.round(currentWeather.windSpeed * 2.237);
    humidity = currentWeather.humidity;
    
    dataSources.push(currentWeather.description || 'Weather API');
    
    // Detailed temperature risk assessment
    if (tempF <= 20) {
      score -= 25;
      warnings.push(`Extremely cold (${tempF}°F) - severe ice formation risk`);
      recommendations.push('CRITICAL: Avoid travel if possible - extreme cold creates instant ice');
      recommendations.push('Bridges and overpasses freeze first - extreme caution required');
    } else if (tempF <= 28) {
      score -= 20;
      warnings.push(`Very cold (${tempF}°F) - high ice formation risk`);
      recommendations.push('High risk of ice, especially on bridges and in shaded areas');
      recommendations.push('Consider delaying non-essential travel');
    } else if (tempF <= 32) {
      score -= 15;
      warnings.push(`At freezing (${tempF}°F) - ice can form rapidly`);
      recommendations.push('Watch for black ice, especially in shadows and on bridges');
      recommendations.push('Conditions can deteriorate quickly');
    } else if (tempF <= 35) {
      score -= 10;
      conditions.push(`Near freezing (${tempF}°F) - monitor conditions closely`);
      recommendations.push('Be cautious - conditions may change quickly, especially overnight');
    } else if (tempF <= 40) {
      score -= 5;
      conditions.push(`Cold (${tempF}°F) - some ice risk in shaded areas`);
    }
    
    // High humidity increases ice risk when near freezing
    if (tempF <= 35 && humidity > 80) {
      score -= 5;
      warnings.push(`High humidity (${humidity}%) increases condensation and ice formation risk`);
    }
  }

  // Factor 2: Precipitation type (detailed assessment)
  if (currentWeather) {
    const desc = currentWeather.description.toLowerCase();
    if (desc.includes('freezing rain') || (desc.includes('rain') && currentWeather.temperature <= 0)) {
      score -= 35;
      warnings.push('FREEZING RAIN - EXTREMELY DANGEROUS');
      recommendations.push('CRITICAL: Avoid travel - freezing rain creates invisible glaze ice');
      recommendations.push('Roads become extremely slippery with zero traction');
    } else if (desc.includes('sleet')) {
      score -= 28;
      warnings.push('Sleet - very dangerous conditions');
      recommendations.push('Avoid travel if possible - sleet creates extremely slippery conditions');
      recommendations.push('If travel necessary: reduce speed by 50%, use winter tires');
    } else if (desc.includes('snow') && tempF <= 32) {
      score -= 25;
      warnings.push(`Snow falling at ${tempF}°F - roads will become snow-covered quickly`);
      recommendations.push('Allow 2-3x normal travel time');
      recommendations.push('Use winter tires or chains, reduce speed significantly');
    } else if (desc.includes('snow') && tempF > 32) {
      score -= 15;
      warnings.push(`Wet snow at ${tempF}°F - creates slushy conditions`);
      recommendations.push('Allow extra travel time, watch for slush buildup');
    } else if (desc.includes('rain') && tempF <= 40) {
      score -= 12;
      conditions.push(`Cold rain at ${tempF}°F - can refreeze overnight`);
      recommendations.push('Monitor conditions - rain may freeze as temperatures drop');
    } else if (desc.includes('rain')) {
      score -= 8;
      conditions.push('Rain expected - roads will be wet');
      recommendations.push('Allow extra stopping distance, reduce speed');
    }
  }

  // Factor 3: Active road warnings (comprehensive)
  const hasIceWarnings = roadConditions.some(rc => rc.condition === 'ice');
  const hasSnowWarnings = roadConditions.some(rc => rc.condition === 'snow-covered');
  const hasClosures = roadConditions.some(rc => rc.condition === 'closed');
  const hasWetConditions = roadConditions.some(rc => rc.condition === 'wet');

  if (hasClosures) {
    score -= 40;
    warnings.push('ROAD CLOSURES REPORTED - Some roads may be closed');
    recommendations.push('CRITICAL: Check route before traveling - avoid closed roads');
    recommendations.push('Do not attempt to travel on closed roads');
  } else if (hasIceWarnings) {
    score -= 30;
    warnings.push('ICE CONDITIONS REPORTED - Extremely dangerous');
    recommendations.push('CRITICAL: Reduce speed by 50% or more');
    recommendations.push('Increase following distance to 5-6 seconds minimum');
    recommendations.push('Avoid sudden movements - no hard braking or sharp turns');
  } else if (hasSnowWarnings) {
    score -= 25;
    warnings.push('SNOW-COVERED ROADS REPORTED');
    recommendations.push('Use winter driving techniques');
    recommendations.push('Allow 3-4x normal stopping distance');
    recommendations.push('Reduce speed by 30-40%');
  } else if (hasWetConditions && tempF <= 35) {
    score -= 15;
    warnings.push(`Wet roads at ${tempF}°F - high refreezing risk`);
    recommendations.push('Monitor for black ice formation');
    recommendations.push('Especially dangerous in shaded areas and on bridges');
  }

  // Factor 4: Wind speed (detailed analysis)
  if (currentWeather && windMph >= 50) {
    score -= 10;
    warnings.push(`EXTREME WIND (${windMph} mph) - dangerous driving conditions`);
    recommendations.push('Avoid travel - high-profile vehicles at risk');
  } else if (windMph >= 40) {
    score -= 8;
    warnings.push(`Strong wind (${windMph} mph) - difficult driving conditions`);
    recommendations.push('Exercise extreme caution, especially on bridges and open roads');
  } else if (windMph >= 30) {
    score -= 6;
    conditions.push(`Windy conditions (${windMph} mph)`);
    recommendations.push('Exercise caution on bridges and open roads');
  } else if (windMph >= 20) {
    score -= 3;
    conditions.push(`Moderate wind (${windMph} mph)`);
  }

  // Factor 5: Visibility
  if (currentWeather) {
    const desc = currentWeather.description.toLowerCase();
    if (desc.includes('fog') || desc.includes('mist')) {
      if (humidity > 90) {
        score -= 10;
        warnings.push('Dense fog - visibility may be less than 100 feet');
        recommendations.push('Reduce speed significantly, use low beam headlights');
      } else {
        score -= 7;
        conditions.push('Fog/mist reducing visibility');
        recommendations.push('Reduce speed, use low beams');
      }
    }
  }

  // Factor 6: Black ice risk (comprehensive calculation - ACCURATE)
  let blackIceRisk = 'low';
  let blackIceProbability = 0;
  
  // Calculate black ice probability based on temperature, humidity, and conditions
  if (tempF <= 32) {
    // At or below freezing - base probability
    if (tempF <= 20) {
      blackIceProbability = 90;
      blackIceRisk = 'extreme';
    } else if (tempF <= 28) {
      blackIceProbability = 70;
      blackIceRisk = 'high';
    } else {
      blackIceProbability = 50;
      blackIceRisk = 'moderate';
    }
    
    // Adjust for humidity
    if (humidity > 85) {
      blackIceProbability = Math.min(100, blackIceProbability + 10);
    } else if (humidity > 75) {
      blackIceProbability = Math.min(100, blackIceProbability + 5);
    }
    
    // Adjust for wet conditions
    if (hasWetConditions) {
      blackIceProbability = Math.min(100, blackIceProbability + 15);
    }
    
    // Apply score deduction based on probability (ACCURATE SCORING)
    if (blackIceProbability >= 70) {
      score -= 20;
      warnings.push(`BLACK ICE RISK: ${blackIceProbability}% probability - EXTREME risk`);
      recommendations.push('CRITICAL: Watch for black ice, especially on bridges and in shadows');
      recommendations.push('Black ice is invisible - drive as if it exists everywhere');
    } else if (blackIceProbability >= 50) {
      score -= 15;
      warnings.push(`BLACK ICE RISK: ${blackIceProbability}% probability - HIGH risk`);
      recommendations.push('CRITICAL: Watch for black ice, especially on bridges and in shadows');
      recommendations.push('Black ice is invisible - extreme caution required');
    } else {
      score -= 10;
      warnings.push(`Black ice risk (${blackIceProbability}%) - moderate risk`);
      recommendations.push('Monitor for black ice, especially in early morning/evening');
    }
  } else if (tempF <= 35 && humidity > 80) {
    blackIceProbability = 30;
    blackIceRisk = 'moderate';
    score -= 8;
    warnings.push(`Black ice risk (${blackIceProbability}%) due to high humidity and near-freezing temperatures`);
    recommendations.push('Monitor for black ice, especially in early morning/evening');
  } else if (tempF <= 35) {
    blackIceProbability = 20;
    blackIceRisk = 'low';
    score -= 5;
    conditions.push(`Low black ice risk (${blackIceProbability}%) - monitor conditions`);
  }

  // Factor 7: Time of day risk
  const hour = new Date().getHours();
  if ((hour >= 22 || hour <= 7) && tempF <= 35) {
    score -= 6;
    conditions.push('Early morning/evening period - lower road temperatures increase ice risk');
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score));

  // CRITICAL VALIDATION: Only mark as hazardous if truly dangerous conditions exist
  // Require at least ONE of these severe conditions to justify hazardous rating:
  const hasSevereConditions = 
    hasClosures || // Road closures
    hasIceWarnings || // Ice reported
    tempF <= 20 || // Extremely cold (high ice risk)
    (tempF <= 32 && hasSnowWarnings && windMph >= 30) || // Freezing temps + snow + wind
    (hasClosures && hasIceWarnings); // Multiple severe conditions

  // Determine rating (ACCURATE AND VALIDATED)
  let rating: RoadSafetyRating['rating'];
  if (score >= 80) {
    rating = 'excellent';
  } else if (score >= 60) {
    rating = 'good';
  } else if (score >= 40) {
    rating = 'caution';
  } else if (score >= 20) {
    rating = 'poor';
  } else {
    // HAZARDOUS RATING: Only assign if score < 20 AND severe conditions verified
    // If score dropped below 20 but no severe conditions, cap at 20 (poor rating)
    if (!hasSevereConditions && score < 20) {
      console.warn(`[Road Safety] Score ${score} would be hazardous but no severe conditions verified - capping at 20 (poor)`);
      score = 20; // Cap at poor rating minimum
      rating = 'poor';
    } else {
      rating = 'hazardous';
      // Log for accuracy tracking
      console.log(`[Road Safety] HAZARDOUS rating assigned (score: ${score}) - Verified severe conditions:`, {
        hasClosures,
        hasIceWarnings,
        tempF,
        hasSnowWarnings,
        windMph,
      });
    }
  }

  // Add general conditions if none specific
  if (conditions.length === 0 && warnings.length === 0 && currentWeather) {
    conditions.push(`Clear conditions in ${location}`);
  }

  // Calculate confidence based on data freshness and completeness
  const confidence = currentWeather ? 85 : 60; // High confidence if we have weather data
  
  // Detailed factors breakdown
  const factors = {
    temperature: {
      value: tempF,
      impact: tempF <= 32 ? (tempF <= 20 ? 25 : tempF <= 28 ? 20 : 15) : tempF <= 35 ? 10 : tempF <= 40 ? 5 : 0,
      description: tempF <= 32 
        ? `Critical temperature risk (${tempF}°F) - high ice formation risk`
        : tempF <= 35 
        ? `Near freezing (${tempF}°F) - monitor closely`
        : `Temperature ${tempF}°F - normal conditions`
    },
    precipitation: {
      type: currentWeather?.description || 'none',
      impact: currentWeather?.description?.toLowerCase().includes('freezing') ? 35 
        : currentWeather?.description?.toLowerCase().includes('sleet') ? 28
        : currentWeather?.description?.toLowerCase().includes('snow') ? (tempF <= 32 ? 25 : 15)
        : currentWeather?.description?.toLowerCase().includes('rain') ? (tempF <= 40 ? 12 : 8)
        : 0,
      description: currentWeather?.description || 'No precipitation'
    },
    roadConditions: {
      conditions: roadConditions.map(rc => rc.condition),
      impact: hasClosures ? 40 : hasIceWarnings ? 30 : hasSnowWarnings ? 25 : hasWetConditions && tempF <= 35 ? 15 : 0,
      description: hasClosures 
        ? 'Road closures reported'
        : hasIceWarnings
        ? 'Ice conditions reported'
        : hasSnowWarnings
        ? 'Snow-covered roads'
        : hasWetConditions && tempF <= 35
        ? 'Wet roads with refreezing risk'
        : 'Road conditions appear clear'
    },
    wind: {
      speed: windMph,
      impact: windMph >= 50 ? 10 : windMph >= 40 ? 8 : windMph >= 30 ? 6 : windMph >= 20 ? 3 : 0,
      description: windMph >= 40 
        ? `Strong wind (${windMph} mph) - affects vehicle control`
        : windMph >= 20
        ? `Moderate wind (${windMph} mph)`
        : 'Light wind conditions'
    },
    visibility: {
      level: currentWeather?.description?.toLowerCase().includes('fog') ? (humidity > 90 ? 'extreme' : 'high') : 'good',
      impact: currentWeather?.description?.toLowerCase().includes('fog') ? (humidity > 90 ? 10 : 7) : 0,
      description: currentWeather?.description?.toLowerCase().includes('fog')
        ? 'Fog reducing visibility'
        : 'Good visibility'
    },
    timeOfDay: {
      period: hour >= 22 || hour <= 7 ? 'Night/Early Morning' : 'Daytime',
      impact: (hour >= 22 || hour <= 7) && tempF <= 35 ? 6 : 0,
      description: (hour >= 22 || hour <= 7) && tempF <= 35
        ? 'Night/early morning - increased ice risk'
        : 'Normal risk period'
    },
    blackIceRisk: {
      risk: blackIceRisk as 'low' | 'moderate' | 'high' | 'extreme',
      description: blackIceProbability > 0
        ? `${blackIceProbability}% probability of black ice - ${blackIceRisk} risk`
        : 'Low black ice risk'
    },
    overallAssessment: score >= 80
      ? 'Excellent road conditions - safe for normal travel'
      : score >= 60
      ? 'Good road conditions - normal winter driving precautions apply'
      : score >= 40
      ? 'Caution advised - adverse conditions present'
      : score >= 20
      ? 'Poor road conditions - travel not recommended unless necessary'
      : 'Hazardous road conditions - avoid travel if possible'
  };

  return {
    district: districtName, // Use district name if found, otherwise use location (city name)
    rating,
    score,
    conditions,
    warnings,
    recommendations,
    lastUpdated: new Date().toISOString(),
    factors,
    dataSources: [...new Set([...dataSources, ...roadConditions.map(rc => rc.source)])],
    confidence,
  };
}

/**
 * Format road safety rating for AI context
 */
export function formatRoadSafetyRatingForAI(rating: RoadSafetyRating): string {
  let text = `\n=== ROAD SAFETY RATING FOR ${rating.district.toUpperCase()} ===\n`;
  text += `Safety Rating: ${rating.rating.toUpperCase()} (Score: ${rating.score}/100)\n\n`;
  
  if (rating.conditions.length > 0) {
    text += `Current Conditions:\n`;
    rating.conditions.forEach(c => text += `- ${c}\n`);
    text += `\n`;
  }
  
  if (rating.warnings.length > 0) {
    text += `⚠️ WARNINGS:\n`;
    rating.warnings.forEach(w => text += `- ${w}\n`);
    text += `\n`;
  }
  
  if (rating.recommendations.length > 0) {
    text += `Recommendations:\n`;
    rating.recommendations.forEach(r => text += `- ${r}\n`);
  }
  
  return text;
}









