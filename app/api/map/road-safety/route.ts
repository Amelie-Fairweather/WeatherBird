/**
 * API Route for Vermont Road Safety Map Data
 * Returns road safety ratings for all districts/regions in Vermont
 * Includes optional plow data if provided
 */

import { NextResponse } from 'next/server';
import { getAllDistricts } from '@/lib/schoolDistrictService';
import { calculateDistrictRoadSafety } from '@/lib/districtRoadSafetyService';
import { PlowLocation, calculateRoadSafetyRating } from '@/lib/plowAnalysisService';
import { fetchAllRoadConditions, RoadCondition } from '@/lib/roadDataService';
import { calculateDetailedRoadSafetyScore } from '@/lib/detailedRoadSafetyScoring';
import { fetchWeatherFromProvider } from '@/lib/unifiedWeatherService';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includePlows = searchParams.get('includePlows') === 'true';
    
    // Get all school districts (but don't fail if empty - we'll still return road data)
    let districts = [];
    try {
      districts = await getAllDistricts();
      if (!districts || districts.length === 0) {
        console.warn('[Map API] No districts found - continuing with road data only');
      }
    } catch (error) {
      console.error('[Map API] Error fetching districts (non-fatal):', error);
      // Continue without districts - we'll still return dangerousRoads
    }
    
    // Optionally fetch plow data if requested
    const plows: PlowLocation[] = [];
    if (includePlows) {
      try {
        // Try to get plow data from the plows API
        const plowsResponse = await fetch(`${request.url.split('/api/')[0]}/api/plows/analyze?route=Vermont`);
        if (plowsResponse.ok) {
          // If we get plow data back, extract locations
          // Note: This depends on the plows API actually returning data
          // For now, we'll use empty array and it will work when plow data becomes available
        }
      } catch (error) {
        console.log('Plow data not available:', error);
      }
    }
    
    // Calculate road safety for each district (only if we have districts)
    const roadSafetyData = districts.length > 0 ? await Promise.all(
      districts.map(async (district) => {
        // Use zip code or district name
        const identifier = district.zip_codes && district.zip_codes.length > 0 
          ? district.zip_codes[0] 
          : district.district_name;
        
        const safetyRating = await calculateDistrictRoadSafety(identifier);
        
        // Find plows near this district (within ~20 miles)
        let nearbyPlows: PlowLocation[] = [];
        let plowCoverage = null;
        
        if (district.latitude && district.longitude && plows.length > 0) {
          // Filter plows within approximately 20 miles of the district
          nearbyPlows = plows.filter(plow => {
            const distance = calculateDistance(
              district.latitude!,
              district.longitude!,
              plow.latitude,
              plow.longitude
            );
            return distance <= 20; // 20 miles
          });
          
          // Calculate plow coverage rating for this area
          if (nearbyPlows.length > 0) {
            plowCoverage = calculateRoadSafetyRating(nearbyPlows, district.district_name, 100);
          }
        }
        
        return {
          districtId: district.id,
          districtName: district.district_name,
          city: district.city,
          county: district.county,
          latitude: district.latitude,
          longitude: district.longitude,
          zipCodes: district.zip_codes,
          safetyRating: safetyRating ? {
            rating: safetyRating.rating,
            score: safetyRating.score,
            conditions: safetyRating.conditions,
            warnings: safetyRating.warnings,
            factors: safetyRating.factors,
            confidence: safetyRating.confidence,
          } : null,
          plowCoverage: plowCoverage ? {
            plowCount: plowCoverage.plowCount,
            plowDensity: plowCoverage.plowDensity,
            safetyRating: plowCoverage.safetyRating,
            reasoning: plowCoverage.reasoning,
          } : null,
        };
      })
    ) : [];

    // ALWAYS generate weather-based road conditions FIRST using weather APIs
    // This ensures we ALWAYS have road data to display, regardless of other API failures
    // Generate weather-based road conditions for major Vermont cities/regions
    // This ensures we show road safety predictions even when no incidents are reported
    
    // Initialize road conditions array
    let roadConditions: RoadCondition[] = [];
    
    const majorVermontLocations = [
      { name: 'Burlington', lat: 44.4759, lon: -73.2121 },
      { name: 'Montpelier', lat: 44.2664, lon: -72.5805 },
      { name: 'Rutland', lat: 43.6106, lon: -72.9726 },
      { name: 'Brattleboro', lat: 42.8509, lon: -72.5579 },
      { name: 'St. Albans', lat: 44.8106, lon: -73.0832 },
      { name: 'Barre', lat: 44.1970, lon: -72.5015 },
      { name: 'White River Junction', lat: 43.6506, lon: -72.3193 },
      { name: 'Middlebury', lat: 44.0153, lon: -73.1673 },
      { name: 'Bennington', lat: 42.8781, lon: -73.1968 },
      { name: 'Essex Junction', lat: 44.4914, lon: -73.1107 },
    ];
    
    try {
      // Fetch weather for each location in parallel for performance
      // Each location gets its own accurate weather data using coordinates
      const weatherPromises = majorVermontLocations.map(async (location) => {
        try {
          // Use coordinates for precise location-specific weather
          const coordString = `${location.lat},${location.lon}`;
          const weatherData = await fetchWeatherFromProvider(coordString, 'auto');
          
          // Temperature is in Celsius, convert to Fahrenheit
          const tempC = weatherData.temperature;
          const tempF = Math.round((tempC * 9/5) + 32);
          const windMph = Math.round(weatherData.windSpeed * 2.237);
          const humidity = weatherData.humidity || 0;
          const description = weatherData.description.toLowerCase();
          
          console.log(`[Map API] ${location.name}: ${tempF}°F, ${description}, ${humidity}% humidity`);
          
          // Determine road condition based on accurate location-specific weather
          let condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown' = 'clear';
          let warning = '';
          
          // Priority 1: Freezing rain or ice conditions (most dangerous)
          if (description.includes('freezing rain') || (description.includes('rain') && tempF <= 32)) {
            condition = 'ice';
            warning = `Freezing rain in ${location.name} - black ice likely. Temperature: ${tempF}°F`;
          }
          // Priority 2: Snow conditions
          else if (description.includes('snow') || description.includes('snowfall')) {
            condition = 'snow-covered';
            warning = `Snow in ${location.name}. Temperature: ${tempF}°F`;
          }
          // Priority 3: Ice/freezing conditions (critical for safety)
          else if (tempF <= 32 && (description.includes('rain') || description.includes('drizzle') || humidity > 80)) {
            condition = 'ice';
            warning = `Freezing conditions in ${location.name} - ice risk. Temperature: ${tempF}°F, Humidity: ${humidity}%`;
          }
          // Priority 4: Very cold conditions (severe ice risk)
          else if (tempF <= 20) {
            condition = 'ice';
            warning = `Extremely cold in ${location.name} - severe ice risk. Temperature: ${tempF}°F`;
          }
          // Priority 5: Wet conditions near freezing
          else if (description.includes('rain') || description.includes('drizzle')) {
            condition = 'wet';
            if (tempF <= 35) {
              warning = `Wet roads in ${location.name} near freezing - watch for ice. Temperature: ${tempF}°F`;
            }
          }
          // Priority 6: Near freezing with high humidity
          else if (tempF <= 35 && humidity > 80) {
            condition = 'wet';
            warning = `Near freezing in ${location.name} with high humidity - ice risk. Temperature: ${tempF}°F`;
          }
          
          // Create condition with accurate location-specific data
          // Use a more descriptive route name that might match highways
          const routeName = condition === 'ice' || condition === 'snow-covered' || condition === 'wet' 
            ? `${location.name} Area Roads` 
            : `${location.name} Area`;
          
          return {
            route: routeName,
            condition,
            temperature: tempF,
            warning: warning || undefined,
            source: 'Weather-Based Prediction',
            timestamp: new Date().toISOString(),
            latitude: location.lat,
            longitude: location.lon,
          } as RoadCondition;
        } catch (error) {
          console.error(`[Map API] Failed to fetch weather for ${location.name}:`, error);
          return null;
        }
      });
      
      const weatherBasedConditions = (await Promise.all(weatherPromises))
        .filter((c): c is RoadCondition => c !== null);
      
      if (weatherBasedConditions.length > 0) {
        roadConditions.push(...weatherBasedConditions);
        console.log(`[Map API] Generated ${weatherBasedConditions.length} accurate weather-based conditions`);
      } else {
        console.warn('[Map API] WARNING: No weather-based conditions generated - this should not happen!');
      }
    } catch (error) {
      console.error('Error generating weather-based road conditions:', error);
      // This is critical - we need weather-based predictions, so log the full error
      console.error('Full error details:', error instanceof Error ? error.stack : error);
    }
    
    // Also fetch additional road conditions from other APIs (TomTom, NWS, etc.)
    // But weather-based predictions are the primary source
    try {
      const additionalConditions = await fetchAllRoadConditions('Vermont');
      if (additionalConditions.length > 0) {
        roadConditions.push(...additionalConditions);
        console.log(`[Map API] Added ${additionalConditions.length} additional road conditions from external APIs`);
      }
    } catch (error) {
      console.error('Error fetching additional road conditions (non-fatal):', error);
      // Continue with just weather-based predictions
    }
    
    console.log(`[Map API] Total road conditions: ${roadConditions.length} (${roadConditions.filter(c => c.latitude && c.longitude).length} with coordinates)`);
    
    // Identify dangerous roads based on conditions
    let dangerousRoads: Awaited<ReturnType<typeof identifyDangerousRoads>> = [];
    try {
      console.log(`[Map API] Processing ${roadConditions.length} road conditions to identify dangerous roads...`);
      console.log(`[Map API] Road conditions breakdown: ${roadConditions.filter(c => c.latitude && c.longitude).length} with coordinates, ${roadConditions.filter(c => !c.latitude || !c.longitude).length} without coordinates`);
      dangerousRoads = await identifyDangerousRoads(roadConditions, roadSafetyData);
      console.log(`[Map API] Identified ${dangerousRoads.length} dangerous roads`);
      if (dangerousRoads.length > 0) {
        console.log(`[Map API] Sample dangerous roads: ${dangerousRoads.slice(0, 3).map(r => `${r.route} (${r.safetyLevel}, score: ${r.safetyScore})`).join(', ')}`);
      } else {
        console.warn(`[Map API] WARNING: No dangerous roads identified from ${roadConditions.length} conditions.`);
        console.warn(`[Map API] Conditions with coordinates: ${roadConditions.filter(c => c.latitude && c.longitude).length}`);
        console.warn(`[Map API] Conditions without coordinates: ${roadConditions.filter(c => !c.latitude || !c.longitude).length}`);
        // Log details about conditions for debugging
        roadConditions.forEach((c, i) => {
          console.log(`[Map API] Condition ${i + 1}: route="${c.route}", coords=[${c.latitude}, ${c.longitude}], condition=${c.condition}, source=${c.source}`);
        });
        
        // If we have weather-based conditions but no dangerous roads, there's a bug in identifyDangerousRoads
        const weatherBasedCount = roadConditions.filter(c => c.source === 'Weather-Based Prediction').length;
        if (weatherBasedCount > 0) {
          console.error(`[Map API] ERROR: We have ${weatherBasedCount} weather-based conditions but identifyDangerousRoads returned empty!`);
        }
      }
    } catch (error) {
      console.error('Error identifying dangerous roads (non-fatal):', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      // Continue without dangerous roads - we'll still show districts
    }
    
    // Count data sources for logging/info
    const tomtomIncidents = roadConditions.filter(c => c.source === 'TomTom').length;
    const nwsAlerts = roadConditions.filter(c => c.source === 'NWS').length;
    const xweatherConditions = roadConditions.filter(c => c.source === 'Xweather').length;
    const vtransRWIS = roadConditions.filter(c => c.source === 'VTrans RWIS').length;
    const vtransClosures = roadConditions.filter(c => c.source === 'VTrans Lane Closures').length;
    const vtransIncidents = roadConditions.filter(c => c.source === 'VTrans Incidents').length;
    const ne511 = roadConditions.filter(c => c.source === 'New England 511').length;
    
    // Log data source integration status
    if (tomtomIncidents > 0) {
      console.log(`[Map API] TomTom: ${tomtomIncidents} traffic incidents integrated`);
    }
    if (vtransRWIS > 0) {
      console.log(`[Map API] VTrans RWIS: ${vtransRWIS} sensor stations integrated`);
    }
    if (vtransClosures > 0) {
      console.log(`[Map API] VTrans Lane Closures: ${vtransClosures} closures integrated`);
    }
    if (vtransIncidents > 0) {
      console.log(`[Map API] VTrans Incidents: ${vtransIncidents} incidents integrated`);
    }
    
    return NextResponse.json({
      regions: roadSafetyData,
      plows: plows.length > 0 ? plows.map(p => ({
        id: p.id,
        latitude: p.latitude,
        longitude: p.longitude,
        route: p.route,
        status: p.status,
      })) : [],
      dangerousRoads, // Now includes ALL roads with safety ratings, including TomTom incidents with GPS coordinates
      plowDataStatus: plows.length > 0 ? 'available' : 'unavailable',
      plowDataNote: plows.length === 0 
        ? 'Plow data not yet available. See PLOW_DATA_SOURCES.md for integration details.'
        : `${plows.length} plow trucks tracked`,
      dataSources: {
        total: roadConditions.length,
        tomtomIncidents: tomtomIncidents,
        nwsAlerts: nwsAlerts,
        xweatherConditions: xweatherConditions,
        vtransRWIS: vtransRWIS,
        vtransLaneClosures: vtransClosures,
        vtransIncidents: vtransIncidents,
        newEngland511: ne511,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching road safety map data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Log full error details for debugging
    console.error('Full error details:', {
      message: errorMessage,
      stack: errorStack,
      error,
    });
    
    return NextResponse.json(
      {
        error: 'Failed to fetch road safety map data',
        details: errorMessage,
        ...(process.env.NODE_ENV === 'development' && errorStack ? { stack: errorStack } : {}),
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate distance between two coordinates in miles (Haversine formula)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Identify all roads with safety ratings (not just dangerous ones)
 * Categorizes roads by safety level: excellent, good, caution, poor, hazardous
 */
interface DistrictSafetyData {
  districtId?: number;
  districtName?: string;
  safetyRating?: {
    rating?: string;
    score?: number;
  };
  latitude?: number;
  longitude?: number;
}

async function identifyDangerousRoads(
  roadConditions: RoadCondition[],
  _districtSafetyData: Array<{
    districtId: number;
    districtName: string;
    safetyRating: { rating: string; score: number } | null;
    [key: string]: unknown;
  }>
): Promise<Array<{
  route: string;
  condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
  severity: 'low' | 'moderate' | 'high' | 'extreme';
  safetyLevel: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
  safetyScore: number;
  description: string;
  coordinates: Array<[number, number]>;
  warning?: string;
  routeId: string;
}>> {
  const allRoads: Array<{
    route: string;
    condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
    severity: 'low' | 'moderate' | 'high' | 'extreme';
    safetyLevel: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
    safetyScore: number;
    description: string;
    coordinates: Array<[number, number]>;
    warning?: string;
    routeId: string;
  }> = [];

  // Major Vermont highways with approximate coordinates
  // These are key routes that should be highlighted when dangerous
  const vermontHighways: Record<string, Array<[number, number]>> = {
    'I-89': [[44.4759, -73.2121], [44.2664, -72.5805], [43.6106, -72.9726]], // Burlington to Montpelier to White River Junction
    'I-91': [[42.8509, -72.5579], [43.6106, -72.9726], [44.2664, -72.5805]], // Brattleboro to White River Junction to Montpelier
    'US Route 7': [[42.8781, -73.1968], [43.6106, -72.9726], [44.4759, -73.2121]], // Bennington to Rutland to Burlington
    'VT Route 100': [[42.8509, -72.5579], [44.2664, -72.5805]], // North-South through center
    'VT Route 9': [[42.8509, -72.5579], [42.8781, -73.1968]], // Brattleboro to Bennington
  };

  // Fetch general weather context for Vermont (used as fallback for roads without specific location data)
  // This is only used if a road condition doesn't have its own weather data
  let generalWeatherContext: { temperature?: number; windSpeed?: number; humidity?: number } = {};
  try {
    const weatherData = await fetchWeatherFromProvider('44.2664,-72.5805', 'auto'); // Montpelier center coordinates
    generalWeatherContext = {
      temperature: Math.round((weatherData.temperature * 9/5) + 32),
      windSpeed: Math.round(weatherData.windSpeed * 2.237),
      humidity: weatherData.humidity,
    };
  } catch (error) {
    console.warn('[Road Safety] Could not fetch general weather context:', error);
  }

  // Process ALL road conditions with location-specific weather for maximum accuracy
  // Each condition gets scored using its own weather data when available
  const roadScoringPromises: Promise<{
    route: string;
    condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
    severity: 'low' | 'moderate' | 'high' | 'extreme';
    safetyLevel: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
    safetyScore: number;
    description: string;
    coordinates: Array<[number, number]>;
    warning?: string;
    routeId: string;
  } | null>[] = roadConditions.map(async (condition) => {
    const routeName = condition.route || 'Unknown Route';
    
    // Use location-specific weather if coordinates are available
    let locationWeatherContext = generalWeatherContext;
    if (condition.latitude && condition.longitude) {
      try {
        const locationWeather = await fetchWeatherFromProvider(`${condition.latitude},${condition.longitude}`, 'auto');
        locationWeatherContext = {
          temperature: Math.round((locationWeather.temperature * 9/5) + 32),
          windSpeed: Math.round(locationWeather.windSpeed * 2.237),
          humidity: locationWeather.humidity,
        };
      } catch (error) {
        // Fall back to general context if location-specific fetch fails
        console.warn(`[Road Safety] Could not fetch location weather for ${routeName}, using general context`);
      }
    }
    
    // Use detailed scoring algorithm with location-specific weather
    const detailedScore = await calculateDetailedRoadSafetyScore(
      condition,
      locationWeatherContext // Use location-specific weather for accuracy
    );
    
    const safetyLevel = detailedScore.safetyLevel;
    const safetyScore = detailedScore.safetyScore;
    const severity = detailedScore.severity;
    const explanation = detailedScore.explanation;
    
    // Determine coordinates for this route
    let coordinates: Array<[number, number]> | undefined;
    
    // PRIORITY 1: Use GPS coordinates from condition if available (TomTom, Weather-Based, etc.)
    // Validate coordinates are actually valid numbers before using
    const hasValidCoords = condition.latitude !== undefined && 
                          condition.longitude !== undefined &&
                          typeof condition.latitude === 'number' &&
                          typeof condition.longitude === 'number' &&
                          !isNaN(condition.latitude) && 
                          !isNaN(condition.longitude) &&
                          condition.latitude >= -90 && condition.latitude <= 90 &&
                          condition.longitude >= -180 && condition.longitude <= 180;
    
    if (hasValidCoords) {
      // For any condition with coordinates, create a line segment around the location
      // This allows the condition to be visible as a clickable road segment
      const lat = condition.latitude!;
      const lon = condition.longitude!;
      // Create a line segment (about 0.02 degrees = ~2km) for visibility
      // Larger segment for weather-based predictions to show area coverage
      const segmentSize = condition.source === 'Weather-Based Prediction' ? 0.02 : 0.01;
      coordinates = [
        [lat - segmentSize, lon - segmentSize],
        [lat + segmentSize, lon + segmentSize]
      ];
      console.log(`[Road Safety] Using GPS coordinates for ${routeName} (${condition.source}): [${lat}, ${lon}]`);
    } else {
      // PRIORITY 2: Check if route name matches a known highway
      for (const [highway, coords] of Object.entries(vermontHighways)) {
        if (routeName.toLowerCase().includes(highway.toLowerCase()) || 
            routeName.toLowerCase().includes(highway.replace('-', '').toLowerCase()) ||
            routeName.toLowerCase().includes(highway.replace('I-', 'I').toLowerCase()) ||
            routeName.toLowerCase().includes(highway.replace('US Route', 'US').toLowerCase())) {
          coordinates = coords;
          console.log(`[Road Safety] Matched ${routeName} to highway ${highway} using predefined coordinates`);
          break;
        }
      }
      
      // If still no match, try to extract route number from route name
      if (!coordinates) {
        const routeMatch = routeName.match(/(I-?\d+|US\s*Route\s*\d+|VT\s*Route\s*\d+|Route\s*\d+)/i);
        if (routeMatch) {
          const routeNum = routeMatch[1];
          for (const [highway, coords] of Object.entries(vermontHighways)) {
            if (highway.toLowerCase().includes(routeNum.toLowerCase().replace(/\s+/g, ''))) {
              coordinates = coords;
              console.log(`[Road Safety] Matched route number ${routeNum} to highway ${highway}`);
              break;
            }
          }
        }
      }
    }
    
    // If still no coordinates found, skip (don't show roads without coordinates)
    if (!coordinates) {
      console.warn(`[Road Safety] Skipping ${routeName} - no coordinates available and no highway match`);
      return null; // Skip roads we can't map
    }

    // Show ALL roads with safety assessments, not just dangerous ones
    // This gives users a complete picture of road conditions across Vermont
    // Only skip if we truly have no useful information
    
    // Build route ID - use source to ensure uniqueness (especially for TomTom incidents)
    const sourceSuffix = condition.source ? `-${condition.source.toLowerCase()}` : '';
    const routeId = `road-${routeName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}${sourceSuffix}-${Date.now()}`;
    
    return {
      route: routeName,
      condition: condition.condition,
      severity,
      safetyLevel,
      safetyScore,
      description: condition.warning || explanation || `${condition.condition} conditions reported`,
      coordinates,
      warning: condition.warning || (condition.source === 'TomTom' ? `Real-time traffic incident: ${condition.condition}` : undefined),
      routeId,
    };
  });
  
  // Wait for all async scoring operations to complete and filter out nulls
  const allScoredRoads = await Promise.all(roadScoringPromises);
  type ScoredRoad = {
    route: string;
    condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
    severity: 'low' | 'moderate' | 'high' | 'extreme';
    safetyLevel: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
    safetyScore: number;
    description: string;
    coordinates: Array<[number, number]>;
    warning?: string;
    routeId: string;
  };
  const scoredRoads = allScoredRoads.filter((road): road is ScoredRoad => 
    road !== null && road.coordinates !== undefined && road.coordinates.length > 0
  );
  
  console.log(`[Road Safety] Scored ${scoredRoads.length} roads from ${roadConditions.length} conditions (${allScoredRoads.length - scoredRoads.length} filtered out)`);
  
  // Debug: Log why roads were filtered out
  if (scoredRoads.length === 0 && roadConditions.length > 0) {
    console.error(`[Road Safety] ERROR: All ${roadConditions.length} conditions were filtered out!`);
    allScoredRoads.forEach((road, i) => {
      if (road === null) {
        const condition = roadConditions[i];
        console.error(`[Road Safety] Condition ${i + 1} (${condition.route}) was filtered: coords=[${condition.latitude}, ${condition.longitude}]`);
      } else if (!road.coordinates || road.coordinates.length === 0) {
        console.error(`[Road Safety] Condition ${i + 1} (${road.route}) has no coordinates`);
      }
    });
  }
  
  // Add all scored roads to allRoads array
  allRoads.push(...scoredRoads);

  // Also identify roads based on district safety ratings
  // Connect districts with caution, poor, or hazardous ratings
  // CAUTION ZONES are districts with ratings of 'caution' (scores 40-59)
  // Note: ratedDistricts is kept for potential future use but currently not used
  // const ratedDistricts = districtSafetyData.filter(d => 
  //   d.safetyRating && 
  //   d.safetyRating.rating && 
  //   d.latitude && 
  //   d.longitude &&
  //   d.districtId
  // );

  // Group districts by safety level (commented out - not currently used but kept for future use)
  // CAUTION ZONES: Districts with scores 40-59 (moderate risk - requires attention)
  // const cautionDistricts = ratedDistricts.filter(d => 
  //   d.safetyRating?.rating === 'caution' || 
  //   (d.safetyRating?.score !== undefined && d.safetyRating.score >= 40 && d.safetyRating.score < 60)
  // );
  // const poorDistricts = ratedDistricts.filter(d => d.safetyRating?.rating === 'poor');
  // const hazardousDistricts = ratedDistricts.filter(d => d.safetyRating?.rating === 'hazardous');

  // REMOVED: District connection lines (bright red dashed lines) - user requested removal
  // Only show actual roads with real conditions, not district-to-district connections
  // Commented out to prevent bright red dashed lines between districts
  /*
  const districtsToConnect = [...hazardousDistricts, ...poorDistricts, ...cautionDistricts];

  if (districtsToConnect.length >= 2) {
    for (let i = 0; i < districtsToConnect.length - 1; i++) {
      const district1 = districtsToConnect[i];
      const district2 = districtsToConnect[i + 1];
      
      // Double-check all required properties exist
      if (district1.latitude && district1.longitude && 
          district2.latitude && district2.longitude &&
          district1.safetyRating && district1.safetyRating.rating &&
          district2.safetyRating && district2.safetyRating.rating &&
          district1.districtId && district2.districtId &&
          district1.districtName && district2.districtName) {
        // Determine the worse rating between the two districts
        const rating1 = district1.safetyRating.rating;
        const rating2 = district2.safetyRating.rating;
        const ratingOrder: Record<string, number> = {
          'excellent': 0,
          'good': 1,
          'caution': 2,
          'poor': 3,
          'hazardous': 4,
        };
        const worseRating = ratingOrder[rating1] > ratingOrder[rating2] ? rating1 : rating2;
        
        // Get actual scores for validation
        const score1 = district1.safetyRating.score ?? 100;
        const score2 = district2.safetyRating.score ?? 100;
        
        // VALIDATION: Only assign hazardous rating if both districts have verified hazardous conditions
        // This ensures accuracy - connecting districts only creates hazardous route if both are truly hazardous
        let finalRating = worseRating;
        let severity: 'low' | 'moderate' | 'high' | 'extreme' = 'moderate';
        let finalScore = 60;
        
        if (worseRating === 'hazardous') {
          // Verify both districts actually have hazardous ratings (scores < 20)
          const bothHazardous = score1 < 20 && score2 < 20;
          
          if (bothHazardous) {
            severity = 'extreme';
            finalScore = Math.min(score1, score2); // Use worst score
            finalRating = 'hazardous';
            console.log(`[Road Safety] HAZARDOUS route between ${district1.districtName} (${score1}) and ${district2.districtName} (${score2}) - verified`);
          } else {
            // If one district is less severe, don't mark entire route as hazardous
            severity = 'high';
            finalScore = Math.min(score1, score2);
            finalRating = 'poor'; // Downgrade to poor if not both hazardous
            console.log(`[Road Safety] Route between districts - one not verified hazardous (${score1}, ${score2}), marking as poor instead`);
          }
        } else if (worseRating === 'poor') {
          severity = 'high';
          finalScore = Math.min(score1, score2, 30);
          finalRating = 'poor';
        } else if (worseRating === 'caution') {
          // CAUTION ZONES: Districts with scores 40-59 - highlight in bright orange on map
          severity = 'moderate';
          finalScore = Math.min(score1, score2, 50);
          finalRating = 'caution';
        } else {
          finalScore = Math.min(score1, score2);
        }
        
        // Create a route between these districts
        const routeName = `Route between ${district1.districtName} and ${district2.districtName}`;
        
        // Only create route if rating is determined (using validated finalRating and finalScore)
        allRoads.push({
          route: routeName,
          condition: finalRating === 'hazardous' ? 'hazardous' : finalRating === 'poor' ? 'poor' : 'caution',
          severity,
          safetyLevel: finalRating as 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous',
          safetyScore: finalScore,
          description: `Road conditions: ${finalRating.toUpperCase()} - connecting ${district1.districtName} and ${district2.districtName}`,
          coordinates: [
            [district1.latitude, district1.longitude],
            [district2.latitude, district2.longitude]
          ],
          warning: finalRating === 'hazardous' 
            ? `⚠️ CRITICAL: Verified hazardous conditions in both ${district1.districtName} (${score1}/100) and ${district2.districtName} (${score2}/100) - AVOID TRAVEL`
            : `Road conditions are ${finalRating} in ${district1.districtName} (${score1}/100) and ${district2.districtName} (${score2}/100) districts`,
          routeId: `route-${district1.districtId}-${district2.districtId}`,
        });
      }
    }
  }
  */

  // Remove duplicates and return
  const uniqueRoads = allRoads.filter((road, index, self) =>
    index === self.findIndex(r => r.route === road.route && r.routeId === road.routeId)
  );

  return uniqueRoads;
}









