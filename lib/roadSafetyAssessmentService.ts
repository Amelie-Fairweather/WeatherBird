/**
 * Comprehensive Road Safety Assessment Service
 * Provides detailed, accurate safety ratings for individual roads
 */

import { fetchAllRoadConditions, RoadCondition } from './roadDataService';
import { fetchWeatherFromProvider } from './unifiedWeatherService';

export interface RoadSafetyAssessment {
  route: string;
  safetyRating: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
  safetyScore: number; // 0-100
  severity: 'low' | 'moderate' | 'high' | 'extreme';
  
  // Current conditions
  temperatureF: number;
  condition: string;
  roadCondition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
  
  // Detailed factors
  factors: {
    temperatureRisk: {
      level: 'low' | 'moderate' | 'high' | 'extreme';
      score: number;
      description: string;
      details: string[];
    };
    precipitationRisk: {
      level: 'low' | 'moderate' | 'high' | 'extreme';
      score: number;
      type: string;
      description: string;
      details: string[];
    };
    roadSurfaceRisk: {
      level: 'low' | 'moderate' | 'high' | 'extreme';
      score: number;
      condition: string;
      description: string;
      details: string[];
    };
    visibilityRisk: {
      level: 'low' | 'moderate' | 'high' | 'extreme';
      score: number;
      description: string;
      details: string[];
    };
    windRisk: {
      level: 'low' | 'moderate' | 'high' | 'extreme';
      score: number;
      speedMph: number;
      description: string;
      details: string[];
    };
    blackIceRisk: {
      level: 'low' | 'moderate' | 'high' | 'extreme';
      score: number;
      probability: number; // 0-100%
      description: string;
      conditions: string[];
    };
    timeOfDayRisk: {
      level: 'low' | 'moderate' | 'high';
      score: number;
      period: string;
      description: string;
    };
  };
  
  // Critical warnings
  criticalWarnings: string[];
  
  // Detailed recommendations
  recommendations: {
    priority: 'critical' | 'high' | 'moderate' | 'low';
    action: string;
    reasoning: string;
  }[];
  
  // Travel guidance
  travelAdvice: {
    recommended: boolean;
    urgency: 'avoid' | 'extreme_caution' | 'caution' | 'normal' | 'safe';
    estimatedDifficulty: string;
    estimatedTravelTime: string;
  };
  
  // Data quality
  dataQuality: {
    weatherDataFreshness: number; // minutes since update
    roadConditionFreshness: number;
    dataSources: string[];
    confidence: number; // 0-100
  };
  
  lastUpdated: string;
}

/**
 * Calculate comprehensive safety assessment for a specific road
 */
export async function calculateRoadSafetyAssessment(
  route: string,
  location?: string
): Promise<RoadSafetyAssessment> {
  const assessmentLocation = location || 'Vermont';
  
  // Fetch comprehensive weather data
  const weatherData = await fetchWeatherFromProvider(assessmentLocation, 'auto');
  const roadConditions = await fetchAllRoadConditions(assessmentLocation);
  
  // Find specific road condition for this route
  const routeCondition = roadConditions.find(rc => 
    rc.route.toLowerCase().includes(route.toLowerCase()) ||
    route.toLowerCase().includes(rc.route.toLowerCase())
  ) || roadConditions[0]; // Fallback to general conditions
  
  const tempF = Math.round((weatherData.temperature * 9/5) + 32);
  const windMph = Math.round(weatherData.windSpeed * 2.237);
  const humidity = weatherData.humidity;
  const desc = weatherData.description.toLowerCase();
  
  // Calculate time of day risk
  const now = new Date();
  const hour = now.getHours();
  const timeOfDayRisk = calculateTimeOfDayRisk(hour);
  
  // Factor 1: Temperature Risk (0-25 points)
  const temperatureRisk = calculateTemperatureRisk(tempF, humidity);
  
  // Factor 2: Precipitation Risk (0-30 points)
  const precipitationRisk = calculatePrecipitationRisk(desc, tempF, weatherData.temperature);
  
  // Factor 3: Road Surface Risk (0-30 points)
  const roadSurfaceRisk = calculateRoadSurfaceRisk(routeCondition, tempF);
  
  // Factor 4: Visibility Risk (0-10 points)
  const visibilityRisk = calculateVisibilityRisk(desc, windMph, humidity);
  
  // Factor 5: Wind Risk (0-10 points)
  const windRisk = calculateWindRisk(windMph);
  
  // Factor 6: Black Ice Risk (0-25 points)
  const blackIceRisk = calculateBlackIceRisk(tempF, humidity, desc, routeCondition);
  
  // Calculate total score
  const totalScore = Math.max(0, Math.min(100, 
    100 - temperatureRisk.score - precipitationRisk.score - 
    roadSurfaceRisk.score - visibilityRisk.score - 
    windRisk.score - blackIceRisk.score - timeOfDayRisk.score
  ));
  
  // Determine rating
  const safetyRating: RoadSafetyAssessment['safetyRating'] = 
    totalScore >= 80 ? 'excellent' :
    totalScore >= 60 ? 'good' :
    totalScore >= 40 ? 'caution' :
    totalScore >= 20 ? 'poor' : 'hazardous';
  
  // Determine severity
  const severity: RoadSafetyAssessment['severity'] = 
    totalScore >= 80 ? 'low' :
    totalScore >= 60 ? 'moderate' :
    totalScore >= 40 ? 'high' : 'extreme';
  
  // Compile critical warnings
  const criticalWarnings: string[] = [];
  if (temperatureRisk.level === 'extreme' || temperatureRisk.level === 'high') {
    criticalWarnings.push(`Critical temperature risk: ${temperatureRisk.description}`);
  }
  if (precipitationRisk.level === 'extreme' || precipitationRisk.level === 'high') {
    criticalWarnings.push(`Critical precipitation: ${precipitationRisk.description}`);
  }
  if (roadSurfaceRisk.level === 'extreme' || roadSurfaceRisk.level === 'high') {
    criticalWarnings.push(`Critical road surface: ${roadSurfaceRisk.description}`);
  }
  if (blackIceRisk.level === 'extreme' || blackIceRisk.level === 'high') {
    criticalWarnings.push(`Critical black ice risk: ${blackIceRisk.probability}% probability - ${blackIceRisk.description}`);
  }
  if (routeCondition.condition === 'closed') {
    criticalWarnings.push(`⚠️ ROAD CLOSED - Do not attempt to travel this route`);
  }
  
  // Generate recommendations
  const recommendations = generateRecommendations(
    temperatureRisk,
    precipitationRisk,
    roadSurfaceRisk,
    visibilityRisk,
    windRisk,
    blackIceRisk,
    routeCondition
  );
  
  // Travel advice
  const travelAdvice = generateTravelAdvice(totalScore, routeCondition, criticalWarnings);
  
  return {
    route,
    safetyRating,
    safetyScore: totalScore,
    severity,
    temperatureF: tempF,
    condition: weatherData.description,
    roadCondition: routeCondition.condition,
    factors: {
      temperatureRisk,
      precipitationRisk,
      roadSurfaceRisk,
      visibilityRisk,
      windRisk,
      blackIceRisk,
      timeOfDayRisk,
    },
    criticalWarnings,
    recommendations,
    travelAdvice,
    dataQuality: {
      weatherDataFreshness: Math.round((Date.now() - new Date(weatherData.timestamp).getTime()) / 60000),
      roadConditionFreshness: routeCondition.timestamp 
        ? Math.round((Date.now() - new Date(routeCondition.timestamp).getTime()) / 60000)
        : 0,
      dataSources: [weatherData.source || 'Unknown', routeCondition.source],
      confidence: calculateConfidence(weatherData, routeCondition),
    },
    lastUpdated: new Date().toISOString(),
  };
}

function calculateTemperatureRisk(tempF: number, humidity: number): RoadSafetyAssessment['factors']['temperatureRisk'] {
  let score = 0;
  let level: 'low' | 'moderate' | 'high' | 'extreme' = 'low';
  const details: string[] = [];
  
  if (tempF <= 20) {
    score = 25;
    level = 'extreme';
    details.push(`Extremely cold (${tempF}°F) - severe ice risk`);
    details.push(`Liquid freezes instantly on contact with road surface`);
  } else if (tempF <= 28) {
    score = 20;
    level = 'high';
    details.push(`Very cold (${tempF}°F) - high ice formation risk`);
    details.push(`Bridges and overpasses freeze first`);
  } else if (tempF <= 32) {
    score = 15;
    level = 'high';
    details.push(`At freezing (${tempF}°F) - ice can form rapidly`);
    details.push(`Watch for black ice, especially in shadows`);
  } else if (tempF <= 35) {
    score = 10;
    level = 'moderate';
    details.push(`Near freezing (${tempF}°F) - conditions can change quickly`);
    details.push(`Early morning and evening are highest risk times`);
  } else if (tempF <= 40) {
    score = 5;
    level = 'moderate';
    details.push(`Cold (${tempF}°F) - monitor conditions closely`);
  }
  
  // High humidity increases ice risk
  if (tempF <= 35 && humidity > 80) {
    score += 5;
    if (level !== 'extreme') {
      level = level === 'high' ? 'extreme' : 'high';
    }
    details.push(`High humidity (${humidity}%) increases condensation and ice risk`);
  }
  
  return {
    level,
    score: Math.min(25, score),
    description: `Temperature ${tempF}°F presents ${level} risk`,
    details,
  };
}

function calculatePrecipitationRisk(
  description: string,
  tempF: number,
  tempC: number
): RoadSafetyAssessment['factors']['precipitationRisk'] {
  let score = 0;
  let level: 'low' | 'moderate' | 'high' | 'extreme' = 'low';
  let type = 'none';
  const details: string[] = [];
  
  if (description.includes('freezing rain') || (description.includes('rain') && tempC <= 0)) {
    score = 30;
    level = 'extreme';
    type = 'freezing rain';
    details.push(`FREEZING RAIN - Extremely dangerous`);
    details.push(`Creates invisible glaze ice on road surface`);
    details.push(`Avoid travel if possible`);
  } else if (description.includes('sleet')) {
    score = 28;
    level = 'extreme';
    type = 'sleet';
    details.push(`Sleet - Very dangerous conditions`);
    details.push(`Creates slippery ice pellets on road`);
  } else if (description.includes('snow') && tempF <= 32) {
    score = 25;
    level = 'high';
    type = 'snow';
    details.push(`Snow falling at ${tempF}°F`);
    details.push(`Roads will become snow-covered quickly`);
    details.push(`Visibility reduced`);
  } else if (description.includes('snow') && tempF > 32) {
    score = 15;
    level = 'moderate';
    type = 'wet snow';
    details.push(`Wet snow at ${tempF}°F`);
    details.push(`Can create slushy conditions`);
  } else if (description.includes('rain') && tempF <= 40) {
    score = 12;
    level = 'moderate';
    type = 'cold rain';
    details.push(`Cold rain at ${tempF}°F`);
    details.push(`Can refreeze overnight`);
  } else if (description.includes('rain')) {
    score = 8;
    level = 'moderate';
    type = 'rain';
    details.push(`Rain expected - roads will be wet`);
    details.push(`Reduced traction, longer stopping distances`);
  }
  
  return {
    level,
    score: Math.min(30, score),
    type,
    description: type === 'none' ? 'No precipitation' : `${type} presents ${level} risk`,
    details,
  };
}

function calculateRoadSurfaceRisk(
  condition: RoadCondition,
  tempF: number
): RoadSafetyAssessment['factors']['roadSurfaceRisk'] {
  let score = 0;
  let level: 'low' | 'moderate' | 'high' | 'extreme' = 'low';
  const details: string[] = [];
  
  switch (condition.condition) {
    case 'closed':
      score = 30;
      level = 'extreme';
      details.push(`ROAD CLOSED - Do not travel`);
      details.push(`Official closure indicates unsafe conditions`);
      break;
    case 'ice':
      score = 28;
      level = 'extreme';
      details.push(`ICE ON ROAD - Extremely dangerous`);
      details.push(`Zero traction - vehicle will slide`);
      details.push(`Avoid if possible`);
      break;
    case 'snow-covered':
      score = 22;
      level = 'high';
      details.push(`Road is snow-covered`);
      details.push(`Reduced traction - use winter tires`);
      details.push(`Allow 3-4x normal stopping distance`);
      if (tempF <= 28) {
        score = 25;
        details.push(`Cold temperatures make snow more compact and slippery`);
      }
      break;
    case 'wet':
      score = tempF <= 35 ? 15 : 8;
      level = tempF <= 35 ? 'high' : 'moderate';
      details.push(`Wet road surface`);
      if (tempF <= 35) {
        details.push(`Cold temperature increases refreezing risk`);
        details.push(`Black ice possible, especially in shaded areas`);
      } else {
        details.push(`Reduced traction - allow extra stopping distance`);
      }
      break;
    case 'clear':
      score = 0;
      level = 'low';
      details.push(`Road surface appears clear`);
      break;
    default:
      score = 10;
      level = 'moderate';
      details.push(`Unknown road condition - exercise caution`);
  }
  
  if (condition.warning) {
    score += 5;
    details.push(`Official warning: ${condition.warning.substring(0, 100)}`);
  }
  
  return {
    level,
    score: Math.min(30, score),
    condition: condition.condition,
    description: `${condition.condition} road surface presents ${level} risk`,
    details,
  };
}

function calculateVisibilityRisk(
  description: string,
  windMph: number,
  humidity: number
): RoadSafetyAssessment['factors']['visibilityRisk'] {
  let score = 0;
  let level: 'low' | 'moderate' | 'high' | 'extreme' = 'low';
  const details: string[] = [];
  
  if (description.includes('fog') || description.includes('mist')) {
    score = humidity > 90 ? 10 : 8;
    level = humidity > 90 ? 'extreme' : 'high';
    details.push(`Fog/mist reduces visibility`);
    if (humidity > 90) {
      details.push(`Dense fog - visibility may be less than 100 feet`);
      details.push(`Reduce speed significantly, use low beams`);
    }
  } else if (description.includes('snow') && windMph > 20) {
    score = 9;
    level = 'high';
    details.push(`Blowing snow reduces visibility`);
    details.push(`Wind at ${windMph} mph creates whiteout conditions`);
  } else if (description.includes('rain') && windMph > 30) {
    score = 7;
    level = 'moderate';
    details.push(`Heavy rain and wind reduce visibility`);
  }
  
  return {
    level,
    score: Math.min(10, score),
    description: level === 'low' ? 'Good visibility expected' : `Visibility risk: ${level}`,
    details,
  };
}

function calculateWindRisk(windMph: number): RoadSafetyAssessment['factors']['windRisk'] {
  let score = 0;
  let level: 'low' | 'moderate' | 'high' | 'extreme' = 'low';
  const details: string[] = [];
  
  if (windMph >= 50) {
    score = 10;
    level = 'extreme';
    details.push(`Extreme wind (${windMph} mph) - dangerous driving conditions`);
    details.push(`High-profile vehicles at risk of being blown over`);
    details.push(`Avoid travel if possible`);
  } else if (windMph >= 40) {
    score = 8;
    level = 'high';
    details.push(`Strong wind (${windMph} mph) - difficult driving`);
    details.push(`Reduced vehicle control, especially on bridges`);
  } else if (windMph >= 30) {
    score = 6;
    level = 'moderate';
    details.push(`Windy (${windMph} mph) - exercise caution`);
    details.push(`Especially on open roads and bridges`);
  } else if (windMph >= 20) {
    score = 3;
    level = 'moderate';
    details.push(`Moderate wind (${windMph} mph)`);
  }
  
  return {
    level,
    score: Math.min(10, score),
    speedMph: windMph,
    description: `Wind ${windMph} mph presents ${level} risk`,
    details,
  };
}

function calculateBlackIceRisk(
  tempF: number,
  humidity: number,
  description: string,
  condition: RoadCondition
): RoadSafetyAssessment['factors']['blackIceRisk'] {
  let probability = 0;
  let score = 0;
  let level: 'low' | 'moderate' | 'high' | 'extreme' = 'low';
  const conditions: string[] = [];
  
  // Base probability from temperature
  if (tempF <= 20) {
    probability = 90;
    score = 25;
    level = 'extreme';
    conditions.push(`Very cold (${tempF}°F) - ice forms instantly`);
  } else if (tempF <= 28) {
    probability = 70;
    score = 20;
    level = 'high';
    conditions.push(`Cold (${tempF}°F) - high ice formation risk`);
  } else if (tempF <= 32) {
    probability = 50;
    score = 15;
    level = 'moderate';
    conditions.push(`At freezing (${tempF}°F) - ice can form`);
  } else if (tempF <= 35) {
    probability = 30;
    score = 10;
    level = 'moderate';
    conditions.push(`Near freezing (${tempF}°F) - watch for ice`);
  }
  
  // Adjust based on conditions
  if (condition.condition === 'ice' || condition.condition === 'wet') {
    probability += 30;
    score += 10;
    if (level !== 'extreme') {
      level = level === 'high' ? 'extreme' : 'high';
    }
    conditions.push(`Road already has ice/wet conditions`);
  }
  
  if (humidity > 80 && tempF <= 35) {
    probability += 20;
    score += 5;
    conditions.push(`High humidity increases condensation`);
  }
  
  if (description.includes('rain') && tempF <= 35) {
    probability += 25;
    score += 8;
    conditions.push(`Rain at cold temperatures freezes on contact`);
  }
  
  // Time of day (early morning/evening higher risk)
  const hour = new Date().getHours();
  if ((hour >= 22 || hour <= 7) && tempF <= 35) {
    probability += 15;
    score += 5;
    conditions.push(`Early morning/evening - lower road temperatures`);
  }
  
  probability = Math.min(100, probability);
  score = Math.min(25, score);
  
  if (probability >= 70) level = 'extreme';
  else if (probability >= 50) level = 'high';
  else if (probability >= 30) level = 'moderate';
  
  return {
    level,
    score,
    probability,
    description: `${probability}% probability of black ice - ${level} risk`,
    conditions,
  };
}

function calculateTimeOfDayRisk(hour: number): RoadSafetyAssessment['factors']['timeOfDayRisk'] {
  let score = 0;
  let level: 'low' | 'moderate' | 'high' = 'low';
  let period = '';
  
  // Early morning (5-8 AM) - highest risk
  if (hour >= 5 && hour < 8) {
    score = 8;
    level = 'high';
    period = 'Early morning (5-8 AM)';
  }
  // Evening/night (10 PM - 5 AM) - high risk
  else if (hour >= 22 || hour < 5) {
    score = 6;
    level = 'moderate';
    period = 'Night/Evening (10 PM - 5 AM)';
  }
  // Daytime - lower risk
  else {
    score = 2;
    level = 'low';
    period = 'Daytime';
  }
  
  return {
    level,
    score,
    period,
    description: `${period} - ${level} risk period`,
  };
}

function generateRecommendations(
  tempRisk: RoadSafetyAssessment['factors']['temperatureRisk'],
  precipRisk: RoadSafetyAssessment['factors']['precipitationRisk'],
  roadRisk: RoadSafetyAssessment['factors']['roadSurfaceRisk'],
  visRisk: RoadSafetyAssessment['factors']['visibilityRisk'],
  windRisk: RoadSafetyAssessment['factors']['windRisk'],
  blackIceRisk: RoadSafetyAssessment['factors']['blackIceRisk'],
  condition: RoadCondition
): RoadSafetyAssessment['recommendations'] {
  const recommendations: RoadSafetyAssessment['recommendations'] = [];
  
  // Critical recommendations
  if (condition.condition === 'closed') {
    recommendations.push({
      priority: 'critical',
      action: 'DO NOT TRAVEL - Road is closed',
      reasoning: 'Official closure indicates unsafe conditions. Traveling on closed roads is illegal and extremely dangerous.',
    });
    return recommendations;
  }
  
  if (blackIceRisk.level === 'extreme' || tempRisk.level === 'extreme') {
    recommendations.push({
      priority: 'critical',
      action: 'Avoid travel if possible',
      reasoning: `${blackIceRisk.probability}% black ice probability with extreme cold conditions. Roads are extremely dangerous.`,
    });
  }
  
  if (precipRisk.level === 'extreme') {
    recommendations.push({
      priority: 'critical',
      action: 'Avoid travel - extreme precipitation',
      reasoning: `${precipRisk.type} creates extremely dangerous road conditions with zero traction.`,
    });
  }
  
  // High priority
  if (roadRisk.level === 'high' || roadRisk.level === 'extreme') {
    recommendations.push({
      priority: 'high',
      action: 'Use winter tires or chains',
      reasoning: `Road surface is ${roadRisk.condition}, requiring specialized tires for safe travel.`,
    });
    recommendations.push({
      priority: 'high',
      action: 'Reduce speed by 50% or more',
      reasoning: `Stopping distance increases 3-4x on ${roadRisk.condition} surfaces.`,
    });
  }
  
  if (blackIceRisk.level === 'high') {
    recommendations.push({
      priority: 'high',
      action: 'Watch for black ice, especially on bridges and shaded areas',
      reasoning: `${blackIceRisk.probability}% probability - ice is invisible and extremely slippery.`,
    });
  }
  
  if (visRisk.level === 'high' || visRisk.level === 'extreme') {
    recommendations.push({
      priority: 'high',
      action: 'Reduce speed significantly and use low beam headlights',
      reasoning: `Visibility is severely reduced. Drive slowly and stay visible.`,
    });
  }
  
  // Moderate priority
  if (windRisk.level === 'high') {
    recommendations.push({
      priority: 'moderate',
      action: 'Exercise extra caution on bridges and open roads',
      reasoning: `Strong wind (${windRisk.speedMph} mph) affects vehicle control.`,
    });
  }
  
  if (tempRisk.level === 'moderate' || tempRisk.level === 'high') {
    recommendations.push({
      priority: 'moderate',
      action: 'Monitor conditions closely - they can change rapidly',
      reasoning: `Temperature ${tempRisk.level} risk - conditions may deteriorate quickly.`,
    });
  }
  
  // General safety
  recommendations.push({
    priority: 'moderate',
    action: 'Allow 2-3x normal travel time',
    reasoning: 'Adverse conditions require slower speeds and more cautious driving.',
  });
  
  recommendations.push({
    priority: 'low',
    action: 'Check route conditions before departing',
    reasoning: 'Conditions may change. Verify current status before traveling.',
  });
  
  return recommendations;
}

function generateTravelAdvice(
  score: number,
  condition: RoadCondition,
  warnings: string[]
): RoadSafetyAssessment['travelAdvice'] {
  if (condition.condition === 'closed' || score < 20) {
    return {
      recommended: false,
      urgency: 'avoid',
      estimatedDifficulty: 'Extremely dangerous - road may be impassable',
      estimatedTravelTime: 'Not recommended',
    };
  }
  
  if (score < 40) {
    return {
      recommended: false,
      urgency: 'extreme_caution',
      estimatedDifficulty: 'Very difficult - dangerous conditions',
      estimatedTravelTime: '2-3x normal travel time, if travel is necessary',
    };
  }
  
  if (score < 60) {
    return {
      recommended: warnings.length > 2 ? false : true,
      urgency: 'caution',
      estimatedDifficulty: 'Difficult - requires extra care',
      estimatedTravelTime: '1.5-2x normal travel time',
    };
  }
  
  if (score < 80) {
    return {
      recommended: true,
      urgency: 'normal',
      estimatedDifficulty: 'Moderate - some caution needed',
      estimatedTravelTime: '1.2-1.5x normal travel time',
    };
  }
  
  return {
    recommended: true,
    urgency: 'safe',
    estimatedDifficulty: 'Normal driving conditions',
    estimatedTravelTime: 'Normal travel time',
  };
}

function calculateConfidence(weatherData: any, condition: RoadCondition): number {
  let confidence = 100;
  
  // Reduce confidence if data is old
  const weatherAge = (Date.now() - new Date(weatherData.timestamp).getTime()) / 60000; // minutes
  if (weatherAge > 60) confidence -= 20;
  else if (weatherAge > 30) confidence -= 10;
  
  if (condition.timestamp) {
    const conditionAge = (Date.now() - new Date(condition.timestamp).getTime()) / 60000;
    if (conditionAge > 120) confidence -= 15;
    else if (conditionAge > 60) confidence -= 10;
  } else {
    confidence -= 10; // No timestamp for road condition
  }
  
  // Reduce if we're using fallback/general conditions
  if (condition.route === 'Vermont' || condition.route.includes('Unknown')) {
    confidence -= 15;
  }
  
  return Math.max(0, Math.min(100, confidence));
}









