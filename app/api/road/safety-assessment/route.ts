/**
 * API Route for Detailed Road Safety Assessment
 * GET /api/road/safety-assessment?route=I-89&location=Vermont
 */

import { NextResponse } from 'next/server';
import { calculateRoadSafetyAssessment } from '@/lib/roadSafetyAssessmentService';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const route = searchParams.get('route');
    const location = searchParams.get('location') || 'Vermont';

    if (!route) {
      return NextResponse.json(
        { error: 'Route parameter is required' },
        { status: 400 }
      );
    }

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




