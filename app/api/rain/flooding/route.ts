/**
 * API Route for Flooding and Road Safety Data from Weather.io
 * GET /api/rain/flooding?location=Vermont
 */

import { NextResponse } from 'next/server';
import { fetchFloodWarnings, fetchRoadSafetyAlerts } from '@/lib/weatherioService';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const location = searchParams.get('location') || 'Vermont';

    // Fetch both flood warnings and road safety alerts in parallel
    const [floodWarnings, roadSafetyAlerts] = await Promise.all([
      fetchFloodWarnings(location),
      fetchRoadSafetyAlerts(location),
    ]);

    return NextResponse.json({
      location,
      floodWarnings,
      roadSafetyAlerts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching flooding/road safety data:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch flooding and road safety data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}









