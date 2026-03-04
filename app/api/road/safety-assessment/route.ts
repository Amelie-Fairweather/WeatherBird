/**
 * API Route for Detailed Road Safety Assessment
 * GET /api/road/safety-assessment?route=I-89&location=Vermont
 * Also supports: ?q=I-89 Burlington (searches for road and extracts location)
 */

import { NextResponse } from 'next/server';
import { calculateRoadSafetyAssessment } from '@/lib/roadSafetyAssessmentService';

// Common Vermont locations for location extraction
const VERMONT_LOCATIONS = [
  'Burlington', 'Montpelier', 'Rutland', 'Brattleboro', 'St. Albans',
  'Barre', 'White River Junction', 'Middlebury', 'Bennington',
  'Essex Junction', 'Shelburne', 'South Burlington', 'Winooski',
  'Barre City', 'St. Johnsbury', 'Hartford', 'Colchester'
];

// Common Vermont road patterns
const ROAD_PATTERNS = [
  /I-(\d+)/i,           // Interstate (I-89, I-91)
  /US Route (\d+)/i,     // US Route 7
  /VT Route (\d+)/i,     // VT Route 100
  /Route (\d+)/i,        // Route 7
  /(\w+) Road/i,         // Main Street Road
  /(\w+) Highway/i,      // Main Highway
];

/**
 * Parse search query to extract road name and location
 */
function parseRoadSearch(query: string): { route: string; location: string } {
  const trimmed = query.trim();
  
  // If query contains a known location, extract it
  let location = 'Vermont';
  let route = trimmed;
  
  for (const loc of VERMONT_LOCATIONS) {
    if (trimmed.toLowerCase().includes(loc.toLowerCase())) {
      location = loc;
      // Remove location from route name
      route = trimmed.replace(new RegExp(loc, 'gi'), '').trim();
      break;
    }
  }
  
  // Clean up route name (remove extra spaces, common words)
  route = route
    .replace(/\s+/g, ' ')
    .replace(/^(in|at|near|on|the)\s+/i, '')
    .trim();
  
  // If route is empty after extraction, use original query
  if (!route) {
    route = trimmed;
  }
  
  return { route, location };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Support both 'route' parameter and 'q' (query) parameter for search
    const routeParam = searchParams.get('route');
    const queryParam = searchParams.get('q');
    
    let route: string | null = null;
    let location = searchParams.get('location') || 'Vermont';
    
    if (queryParam) {
      // Parse search query
      const parsed = parseRoadSearch(queryParam);
      route = parsed.route;
      location = parsed.location;
    } else if (routeParam) {
      route = routeParam;
      location = searchParams.get('location') || 'Vermont';
    }
    
    if (!route) {
      return NextResponse.json(
        { 
          error: 'Route parameter is required',
          hint: 'Use ?route=I-89 or ?q=I-89 Burlington to search for a road'
        },
        { status: 400 }
      );
    }

    console.log(`[Road Search] Searching for route: "${route}" in location: "${location}"`);

    const assessment = await calculateRoadSafetyAssessment(route, location);

    if (!assessment) {
      return NextResponse.json(
        {
          error: 'Unable to generate predictions',
          details: 'Assessment calculation returned no data',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      assessment,
      searchQuery: queryParam || routeParam,
      parsedRoute: route,
      parsedLocation: location,
    });
  } catch (error) {
    console.error('Error calculating road safety assessment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Provide more specific error messages
    if (errorMessage.includes('weather') || errorMessage.includes('Weather')) {
      return NextResponse.json(
        {
          error: 'Unable to generate predictions',
          details: 'Failed to fetch weather data. Please try again in a moment.',
        },
        { status: 503 }
      );
    }
    
    if (errorMessage.includes('road') || errorMessage.includes('Road')) {
      return NextResponse.json(
        {
          error: 'Unable to generate predictions',
          details: 'Failed to fetch road condition data. Please try again in a moment.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Unable to generate predictions',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}




