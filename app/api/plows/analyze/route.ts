/**
 * API endpoint to analyze plow data and generate road safety ratings
 * 
 * POST /api/plows/analyze
 * Body: {
 *   plows: [{ id, latitude, longitude, route?, timestamp }],
 *   route?: string,
 *   routeLength?: number
 * }
 * 
 * Or GET /api/plows/analyze?route=Vermont
 * (Will attempt to fetch plow data if available)
 */

import { NextResponse } from 'next/server';
import {
  calculateRoadSafetyRating,
  analyzePlowDistribution,
  formatPlowAnalysisForAI,
  PlowLocation,
} from '@/lib/plowAnalysisService';
import { fetchPlowDataFromVTrans } from '@/lib/plowAnalysisService';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const route = searchParams.get('route') || 'Vermont';

    // Try to fetch plow data (if API available)
    const plows = await fetchPlowDataFromVTrans();

    if (plows.length === 0) {
      return NextResponse.json({
        error: 'No plow data available. Plow data API not yet accessible.',
        message: 'Contact VTrans for API access, or use POST endpoint with manual plow data.',
      }, { status: 404 });
    }

    const rating = calculateRoadSafetyRating(plows, route);
    const distribution = analyzePlowDistribution(plows);
    const aiContext = formatPlowAnalysisForAI(rating, distribution);

    return NextResponse.json({
      success: true,
      rating,
      distribution,
      aiContext,
    });
  } catch (error) {
    console.error('Error analyzing plows:', error);
    return NextResponse.json(
      {
        error: 'Failed to analyze plow data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { plows, route = 'Vermont', routeLength } = body;

    if (!plows || !Array.isArray(plows)) {
      return NextResponse.json(
        { error: 'plows array is required' },
        { status: 400 }
      );
    }

    // Validate plow data structure
    const validPlows: PlowLocation[] = plows.map((plow: any, index: number) => {
      if (!plow.latitude || !plow.longitude) {
        throw new Error(`Plow at index ${index} is missing latitude or longitude`);
      }
      return {
        id: plow.id || `plow-${index}`,
        latitude: parseFloat(plow.latitude),
        longitude: parseFloat(plow.longitude),
        route: plow.route,
        direction: plow.direction,
        timestamp: plow.timestamp || new Date().toISOString(),
        status: plow.status || 'active',
      };
    });

    // Calculate safety rating
    const rating = calculateRoadSafetyRating(validPlows, route, routeLength);
    const distribution = analyzePlowDistribution(validPlows);
    const aiContext = formatPlowAnalysisForAI(rating, distribution);

    return NextResponse.json({
      success: true,
      rating,
      distribution,
      aiContext,
    });
  } catch (error) {
    console.error('Error analyzing plows:', error);
    return NextResponse.json(
      {
        error: 'Failed to analyze plow data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

















