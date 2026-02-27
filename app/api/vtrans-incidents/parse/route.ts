/**
 * API Route to parse VTrans Traffic Incidents XML data
 */

import { NextResponse } from 'next/server';
import { parseVTransIncidentsXML, convertIncidentsToRoadConditions } from '@/lib/vtransIncidentsService';

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
    const incidents = parseVTransIncidentsXML(body);
    const roadConditions = convertIncidentsToRoadConditions(incidents);
    
    return NextResponse.json({
      success: true,
      incidentsFound: incidents.length,
      roadConditionsCount: roadConditions.length,
      incidents: incidents.slice(0, 10), // Return first 10 for preview
      roadConditions: roadConditions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error parsing VTrans Incidents XML:', error);
    return NextResponse.json(
      {
        error: 'Failed to parse XML',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}









