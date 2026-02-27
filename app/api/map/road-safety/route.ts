/**
 * API Route for Vermont Road Safety Map Data
 * Returns road safety ratings for all districts/regions in Vermont
 * Includes optional plow data if provided
 */

import { NextResponse } from 'next/server';
import { getAllDistricts } from '@/lib/schoolDistrictService';
import { calculateDistrictRoadSafety } from '@/lib/districtRoadSafetyService';
import { calculateRoadSafetyRating, PlowLocation } from '@/lib/plowAnalysisService';
import { fetchAllRoadConditions, RoadCondition } from '@/lib/roadDataService';
import { calculateRoadSafetyAssessment } from '@/lib/roadSafetyAssessmentService';
import { calculateDetailedRoadSafetyScore } from '@/lib/detailedRoadSafetyScoring';
import { fetchWeatherFromProvider } from '@/lib/unifiedWeatherService';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includePlows = searchParams.get('includePlows') === 'true';
    
    // Get all school districts
    const districts = await getAllDistricts();
    
    // Optionally fetch plow data if requested
    let plows: PlowLocation[] = [];
    if (includePlows) {
      try {
        // Try to get plow data from the plows API
        const plowsResponse = await fetch(`${request.url.split('/api/')[0]}/api/plows/analyze?route=Vermont`);
        if (plowsResponse.ok) {
          const plowsData = await plowsResponse.json();
          // If we get plow data back, extract locations
          // Note: This depends on the plows API actually returning data
          // For now, we'll use empty array and it will work when plow data becomes available
        }
      } catch (error) {
        console.log('Plow data not available:', error);
      }
    }
    
    // Calculate road safety for each district
    const roadSafetyData = await Promise.all(
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
    );

    // Fetch road conditions to identify dangerous roads
    // fetchAllRoadConditions() automatically validates and fact-checks all data
    let roadConditions: RoadCondition[] = [];
    try {
      roadConditions = await fetchAllRoadConditions('Vermont');
      console.log(`[Map API] Fetched and validated ${roadConditions.length} road conditions from all sources`);
    } catch (error) {
      console.error('Error fetching road conditions (non-fatal):', error);
      // Continue without road conditions - we'll still show district connections
    }
    
    // Identify dangerous roads based on conditions
    let dangerousRoads: Awaited<ReturnType<typeof identifyDangerousRoads>> = [];
    try {
      dangerousRoads = await identifyDangerousRoads(roadConditions, roadSafetyData);
    } catch (error) {
      console.error('Error identifying dangerous roads (non-fatal):', error);
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
async function identifyDangerousRoads(
  roadConditions: RoadCondition[],
  districtSafetyData: any[]
): Promise<Array<{
  route: string;
  condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
  severity: 'low' | 'moderate' | 'high' | 'extreme';
  safetyLevel: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
  safetyScore: number;
  description: string;
  coordinates?: Array<[number, number]>;
  warning?: string;
  routeId?: string;
}>> {
  const allRoads: Array<{
    route: string;
    condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
    severity: 'low' | 'moderate' | 'high' | 'extreme';
    safetyLevel: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
    safetyScore: number;
    description: string;
    coordinates?: Array<[number, number]>;
    warning?: string;
    routeId?: string;
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

  // Fetch general weather context for Vermont (used for roads without specific location data)
  let generalWeatherContext: { temperature?: number; windSpeed?: number; humidity?: number } = {};
  try {
    const weatherData = await fetchWeatherFromProvider('Vermont', 'auto');
    // Convert to Fahrenheit and mph
    generalWeatherContext = {
      temperature: Math.round((weatherData.temperature * 9/5) + 32), // Convert Celsius to Fahrenheit
      windSpeed: Math.round(weatherData.windSpeed * 2.237), // Convert m/s to mph
      humidity: weatherData.humidity,
    };
  } catch (error) {
    console.warn('[Road Safety] Could not fetch weather context for scoring:', error);
  }

  // Process ALL road conditions and assign safety levels using detailed algorithm
  // Use Promise.all to handle async detailed scoring
  const roadScoringPromises = roadConditions.map(async (condition) => {
    const routeName = condition.route || 'Unknown Route';
    
    // Use detailed scoring algorithm that considers multiple factors
    const detailedScore = await calculateDetailedRoadSafetyScore(
      condition,
      generalWeatherContext // Use general Vermont weather if specific location weather unavailable
    );
    
    const safetyLevel = detailedScore.safetyLevel;
    const safetyScore = detailedScore.safetyScore;
    const severity = detailedScore.severity;
    const explanation = detailedScore.explanation;
    
    // Determine coordinates for this route
    let coordinates: Array<[number, number]> | undefined;
    
    // PRIORITY 1: Use GPS coordinates from TomTom or other sources if available
    if (condition.latitude && condition.longitude) {
      // For TomTom incidents, create a small line segment around the incident location
      // This allows the incident to be visible as a clickable road segment
      const lat = condition.latitude;
      const lon = condition.longitude;
      // Create a small line segment (about 0.01 degrees = ~1km) for visibility
      coordinates = [
        [lat - 0.005, lon - 0.005],
        [lat + 0.005, lon + 0.005]
      ];
    } else {
      // PRIORITY 2: Check if route name matches a known highway
      for (const [highway, coords] of Object.entries(vermontHighways)) {
        if (routeName.toLowerCase().includes(highway.toLowerCase()) || 
            routeName.toLowerCase().includes(highway.replace('-', '').toLowerCase()) ||
            routeName.toLowerCase().includes(highway.replace('I-', 'I').toLowerCase()) ||
            routeName.toLowerCase().includes(highway.replace('US Route', 'US').toLowerCase())) {
          coordinates = coords;
          break;
        }
      }
    }
    
    // If no coordinates found, skip (don't show roads without coordinates)
    if (!coordinates) {
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
  const scoredRoads = allScoredRoads.filter((road): road is {
    route: string;
    condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
    severity: 'low' | 'moderate' | 'high' | 'extreme';
    safetyLevel: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
    safetyScore: number;
    description: string;
    coordinates?: Array<[number, number]>;
    warning?: string;
    routeId?: string;
  } => road !== null);
  
  // Add all scored roads to allRoads array
  allRoads.push(...scoredRoads);

  // Also identify roads based on district safety ratings
  // Connect districts with caution, poor, or hazardous ratings
  // CAUTION ZONES are districts with ratings of 'caution' (scores 40-59)
  const ratedDistricts = districtSafetyData.filter(d => 
    d.safetyRating && 
    d.safetyRating.rating && 
    d.latitude && 
    d.longitude &&
    d.districtId
  );

  // Group districts by safety level
  // CAUTION ZONES: Districts with scores 40-59 (moderate risk - requires attention)
  const cautionDistricts = ratedDistricts.filter(d => 
    d.safetyRating?.rating === 'caution' || 
    (d.safetyRating?.score !== undefined && d.safetyRating.score >= 40 && d.safetyRating.score < 60)
  );
  const poorDistricts = ratedDistricts.filter(d => d.safetyRating?.rating === 'poor');
  const hazardousDistricts = ratedDistricts.filter(d => d.safetyRating?.rating === 'hazardous');

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









