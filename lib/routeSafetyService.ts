/**
 * Route Safety Service
 * Calculates safety for routes between two locations
 * Used for questions like "should I let my kid drive from X to Y?"
 */

import { fetchAllRoadConditions } from './roadDataService';
import { calculateDetailedRoadSafetyScore } from './detailedRoadSafetyScoring';
import { fetchWeatherFromProvider } from './unifiedWeatherService';
import { getAllDistricts, getDistrictByName, getDistrictByZipCode } from './schoolDistrictService';

export interface RouteSafetyAssessment {
  origin: string;
  destination: string;
  overallSafetyScore: number; // 0-100, higher is safer
  recommendation: 'yes' | 'no' | 'caution'; // yes = safe, no = unsafe, caution = proceed carefully
  safetyLevel: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
  routeConditions: {
    origin: { score: number; level: string; issues: string[] };
    destination: { score: number; level: string; issues: string[] };
    enRoute: { score: number; level: string; issues: string[] };
  };
  trafficConcerns: string[];
  roadDangers: string[];
  summary: string;
  confidence: number;
}

/**
 * Calculate safety for a route between two locations
 */
export async function calculateRouteSafety(
  origin: string,
  destination: string
): Promise<RouteSafetyAssessment | null> {
  try {
    // Fetch road conditions for both locations and general area
    const originConditions = await fetchAllRoadConditions(origin);
    const destConditions = await fetchAllRoadConditions(destination);
    const allRouteConditions = [...originConditions, ...destConditions];

    // Get weather context for route assessment
    let weatherContext: { temperature?: number; windSpeed?: number; humidity?: number } = {};
    try {
      // Try to get weather for destination first, then origin, then general Vermont
      let weatherData;
      try {
        weatherData = await fetchWeatherFromProvider(destination, 'auto');
      } catch {
        try {
          weatherData = await fetchWeatherFromProvider(origin, 'auto');
        } catch {
          weatherData = await fetchWeatherFromProvider('Vermont', 'auto');
        }
      }
      
      weatherContext = {
        temperature: Math.round((weatherData.temperature * 9/5) + 32), // Convert to Fahrenheit
        windSpeed: Math.round(weatherData.windSpeed * 2.237), // Convert to mph
        humidity: weatherData.humidity,
      };
    } catch (error) {
      console.warn('[Route Safety] Could not fetch weather context:', error);
    }

    // Calculate safety for origin location
    let originScore = 80;
    const originIssues: string[] = [];
    const originRoadConditions = originConditions.filter(rc => 
      rc.condition === 'ice' || rc.condition === 'snow-covered' || 
      rc.condition === 'closed' || rc.condition === 'wet'
    );
    
    if (originRoadConditions.length > 0) {
      const avgOriginScore = await Promise.all(
        originRoadConditions.slice(0, 5).map(rc => 
          calculateDetailedRoadSafetyScore(rc, weatherContext)
        )
      );
      originScore = avgOriginScore.reduce((sum, s) => sum + s.safetyScore, 0) / avgOriginScore.length;
      
      if (originRoadConditions.some(rc => rc.condition === 'ice')) {
        originIssues.push('Ice conditions reported');
      }
      if (originRoadConditions.some(rc => rc.condition === 'snow-covered')) {
        originIssues.push('Snow-covered roads');
      }
      if (originRoadConditions.some(rc => rc.condition === 'closed')) {
        originIssues.push('Road closures reported');
      }
    }

    // Calculate safety for destination location
    let destScore = 80;
    const destIssues: string[] = [];
    const destRoadConditions = destConditions.filter(rc => 
      rc.condition === 'ice' || rc.condition === 'snow-covered' || 
      rc.condition === 'closed' || rc.condition === 'wet'
    );
    
    if (destRoadConditions.length > 0) {
      const avgDestScore = await Promise.all(
        destRoadConditions.slice(0, 5).map(rc => 
          calculateDetailedRoadSafetyScore(rc, weatherContext)
        )
      );
      destScore = avgDestScore.reduce((sum, s) => sum + s.safetyScore, 0) / avgDestScore.length;
      
      if (destRoadConditions.some(rc => rc.condition === 'ice')) {
        destIssues.push('Ice conditions reported');
      }
      if (destRoadConditions.some(rc => rc.condition === 'snow-covered')) {
        destIssues.push('Snow-covered roads');
      }
      if (destRoadConditions.some(rc => rc.condition === 'closed')) {
        destIssues.push('Road closures reported');
      }
    }

    // Calculate safety for en-route conditions (use worst of all conditions found)
    let enRouteScore = 80;
    const enRouteIssues: string[] = [];
    const allDangerousConditions = allRouteConditions.filter(rc => 
      rc.condition === 'ice' || rc.condition === 'snow-covered' || 
      rc.condition === 'closed' || rc.condition === 'wet'
    );
    
    if (allDangerousConditions.length > 0) {
      const enRouteScores = await Promise.all(
        allDangerousConditions.slice(0, 10).map(rc => 
          calculateDetailedRoadSafetyScore(rc, weatherContext)
        )
      );
      // Use worst (lowest) score for en-route
      enRouteScore = Math.min(...enRouteScores.map(s => s.safetyScore));
      
      if (allDangerousConditions.some(rc => rc.condition === 'ice')) {
        enRouteIssues.push('Ice conditions along route');
      }
      if (allDangerousConditions.some(rc => rc.condition === 'snow-covered')) {
        enRouteIssues.push('Snow-covered roads along route');
      }
      if (allDangerousConditions.some(rc => rc.condition === 'closed')) {
        enRouteIssues.push('Road closures along route');
      }
      if (allDangerousConditions.some(rc => rc.severity === 'MAJOR')) {
        enRouteIssues.push('Major incidents reported');
      }
    }

    // Overall safety score = worst of origin, destination, and en-route
    const overallSafetyScore = Math.min(originScore, destScore, enRouteScore);

    // Identify traffic concerns
    const trafficConcerns: string[] = [];
    const hasMajorIncidents = allRouteConditions.some(rc => rc.severity === 'MAJOR');
    const hasModerateIncidents = allRouteConditions.some(rc => rc.severity === 'MODERATE');
    const hasDelays = allRouteConditions.some(rc => rc.delay && rc.delay > 300); // >5 min delay
    
    if (hasMajorIncidents) {
      trafficConcerns.push('Major traffic incidents reported');
    }
    if (hasModerateIncidents) {
      trafficConcerns.push('Moderate traffic incidents along route');
    }
    if (hasDelays) {
      trafficConcerns.push('Significant delays expected');
    }
    if (allRouteConditions.length > 10) {
      trafficConcerns.push('Multiple road condition alerts in area');
    }

    // Identify road dangers
    const roadDangers: string[] = [];
    if (allRouteConditions.some(rc => rc.condition === 'ice')) {
      roadDangers.push('Ice on roads - extremely dangerous');
    }
    if (allRouteConditions.some(rc => rc.condition === 'closed')) {
      roadDangers.push('Road closures - some routes may be blocked');
    }
    if (allRouteConditions.some(rc => rc.condition === 'snow-covered')) {
      roadDangers.push('Snow-covered roads - reduced traction');
    }
    if (weatherContext.temperature && weatherContext.temperature <= 32) {
      roadDangers.push(`Freezing temperatures (${weatherContext.temperature}°F) - high ice risk`);
    }
    if (weatherContext.temperature && weatherContext.temperature <= 35 && weatherContext.humidity && weatherContext.humidity > 80) {
      roadDangers.push('High humidity near freezing - black ice risk');
    }

    // Determine safety level
    let safetyLevel: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
    if (overallSafetyScore >= 80) {
      safetyLevel = 'excellent';
    } else if (overallSafetyScore >= 60) {
      safetyLevel = 'good';
    } else if (overallSafetyScore >= 40) {
      safetyLevel = 'caution';
    } else if (overallSafetyScore >= 20) {
      safetyLevel = 'poor';
    } else {
      safetyLevel = 'hazardous';
    }

    // Determine recommendation
    // If score < 40, recommend NO
    // If score 40-60, recommend CAUTION
    // If score > 60, recommend YES
    let recommendation: 'yes' | 'no' | 'caution';
    if (overallSafetyScore < 40) {
      recommendation = 'no';
    } else if (overallSafetyScore < 60) {
      recommendation = 'caution';
    } else {
      recommendation = 'yes';
    }

    // Build summary
    const summaryParts: string[] = [];
    if (recommendation === 'no') {
      summaryParts.push('I would NOT recommend this drive right now.');
    } else if (recommendation === 'caution') {
      summaryParts.push('I would recommend CAUTION - conditions are challenging.');
    } else {
      summaryParts.push('The route appears generally safe, but stay alert.');
    }
    
    if (roadDangers.length > 0) {
      summaryParts.push(`Road dangers: ${roadDangers.join(', ')}.`);
    }
    if (trafficConcerns.length > 0) {
      summaryParts.push(`Traffic concerns: ${trafficConcerns.join(', ')}.`);
    }

    const summary = summaryParts.join(' ');

    // Calculate confidence based on data availability
    let confidence = 75;
    if (allRouteConditions.length > 0) confidence += 10;
    if (weatherContext.temperature !== undefined) confidence += 10;
    if (originConditions.length > 0 && destConditions.length > 0) confidence += 5;
    confidence = Math.min(100, confidence);

    // Helper function to get safety level string
    const getLevelString = (score: number): string => {
      if (score >= 80) return 'excellent';
      if (score >= 60) return 'good';
      if (score >= 40) return 'caution';
      if (score >= 20) return 'poor';
      return 'hazardous';
    };

    return {
      origin,
      destination,
      overallSafetyScore: Math.round(overallSafetyScore),
      recommendation,
      safetyLevel,
      routeConditions: {
        origin: {
          score: Math.round(originScore),
          level: getLevelString(originScore),
          issues: originIssues.length > 0 ? originIssues : ['No major issues reported']
        },
        destination: {
          score: Math.round(destScore),
          level: getLevelString(destScore),
          issues: destIssues.length > 0 ? destIssues : ['No major issues reported']
        },
        enRoute: {
          score: Math.round(enRouteScore),
          level: getLevelString(enRouteScore),
          issues: enRouteIssues.length > 0 ? enRouteIssues : ['No major issues reported']
        }
      },
      trafficConcerns: trafficConcerns.length > 0 ? trafficConcerns : ['No major traffic concerns'],
      roadDangers: roadDangers.length > 0 ? roadDangers : ['No major road dangers reported'],
      summary,
      confidence,
    };
  } catch (error) {
    console.error('[Route Safety] Error calculating route safety:', error);
    return null;
  }
}









