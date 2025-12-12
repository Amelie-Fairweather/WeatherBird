/**
 * API endpoint to manually add road conditions
 * POST /api/road-conditions/manual
 * 
 * Use this when you have VTrans data, user reports, or other sources
 * 
 * Body: {
 *   route: string,
 *   location: string,
 *   condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'hazardous',
 *   description: string,
 *   severity: 'minor' | 'moderate' | 'severe',
 *   timestamp?: string
 * }
 */

import { NextResponse } from 'next/server';
import { addManualRoadCondition } from '@/lib/vtransService';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { route, location, condition, description, severity, timestamp } = body;

    // Validate required fields
    if (!route || !location || !condition || !description || !severity) {
      return NextResponse.json(
        { error: 'Missing required fields: route, location, condition, description, severity' },
        { status: 400 }
      );
    }

    // Add the road condition
    const roadCondition = await addManualRoadCondition({
      route,
      location,
      condition,
      description,
      severity,
      timestamp: timestamp || new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Road condition added successfully',
      data: roadCondition,
    });
  } catch (error) {
    console.error('Error adding manual road condition:', error);
    return NextResponse.json(
      {
        error: 'Failed to add road condition',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to retrieve active road conditions
 * GET /api/road-conditions/manual?route=Route 17
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const route = searchParams.get('route');

    const { getAllActiveRoadConditions, getRoadConditionsForRoute } = await import('@/lib/vtransService');
    
    const conditions = route 
      ? await getRoadConditionsForRoute(route)
      : await getAllActiveRoadConditions();

    return NextResponse.json({
      success: true,
      count: conditions.length,
      conditions,
    });
  } catch (error) {
    console.error('Error fetching road conditions:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch road conditions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}







