/**
 * API Route to parse VTrans Lane Closure XML data
 */

import { NextResponse } from 'next/server';
import { parseVTransLaneClosureXML, convertLaneClosuresToRoadConditions } from '@/lib/vtransLaneClosureService';

export async function POST(request: Request) {
  try {
    const body = await request.text();
    
    if (!body) {
      return NextResponse.json(
        { error: 'No XML data provided' },
        { status: 400 }
      );
    }
    
    // Parse the XML
    const closures = parseVTransLaneClosureXML(body);
    const roadConditions = convertLaneClosuresToRoadConditions(closures);
    
    return NextResponse.json({
      success: true,
      closuresFound: closures.length,
      roadConditions: roadConditions.length,
      closures: closures.slice(0, 10), // Return first 10 for preview
      roadConditions: roadConditions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error parsing VTrans Lane Closure XML:', error);
    return NextResponse.json(
      {
        error: 'Failed to parse XML',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}









