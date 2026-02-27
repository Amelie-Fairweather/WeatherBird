/**
 * API Route to parse VTrans RWIS XML data
 * Can accept XML as POST body or fetch from endpoint
 */

import { NextResponse } from 'next/server';
import { parseVTransRWISXML, convertVTransRWISToRoadConditions } from '@/lib/vtransRWISService';
import { fetchVTransRWISData } from '@/lib/vtransRWISService';

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
    const stations = parseVTransRWISXML(body);
    const roadConditions = convertVTransRWISToRoadConditions(stations);
    
    return NextResponse.json({
      success: true,
      stationsFound: stations.length,
      roadConditions: roadConditions.length,
      stations: stations.slice(0, 10), // Return first 10 for preview
      roadConditions: roadConditions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error parsing VTrans RWIS XML:', error);
    return NextResponse.json(
      {
        error: 'Failed to parse XML',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    // Try to fetch from endpoints
    const stations = await fetchVTransRWISData();
    
    if (stations.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No RWIS data available. Use POST with XML data, or provide the correct endpoint URL.',
        stations: [],
        roadConditions: [],
      });
    }
    
    const roadConditions = convertVTransRWISToRoadConditions(stations);
    
    return NextResponse.json({
      success: true,
      stationsFound: stations.length,
      roadConditions: roadConditions.length,
      stations: stations.slice(0, 10),
      roadConditions: roadConditions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching VTrans RWIS:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch RWIS data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}









