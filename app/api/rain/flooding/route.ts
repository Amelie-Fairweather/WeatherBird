/**
 * API Route for Flooding and Road Safety Data
 * GET /api/rain/flooding?location=Vermont
 * Combines data from multiple sources: NWS alerts, Xweather alerts, and road condition APIs
 */

import { NextResponse } from 'next/server';
import { fetchXweatherAlerts } from '@/lib/xweatherService';
import { fetchNWSAlerts } from '@/lib/nwsService';
import { fetchAllRoadConditions } from '@/lib/roadDataService';

interface FloodWarning {
  id: string;
  location: string;
  severity: 'minor' | 'moderate' | 'major' | 'record';
  status: string;
  description: string;
  waterLevel?: number;
  floodStage?: number;
  timestamp: string;
  source: 'NWS' | 'Xweather';
}

interface RoadSafetyAlert {
  id: string;
  location: string;
  type: string;
  severity: string;
  status: string;
  description: string;
  affectedRoads?: string[];
  timestamp: string;
  source: string;
}

/**
 * Extract flood warnings from NWS and Xweather alerts
 */
function extractFloodWarnings(nwsAlerts: any[], xweatherAlerts: any[]): FloodWarning[] {
  const floodWarnings: FloodWarning[] = [];
  
  // Extract from NWS alerts
  nwsAlerts.forEach((alert: any) => {
    const properties = alert.properties || {};
    const eventType = (properties.eventType || properties.event || '').toLowerCase();
    const event = (properties.event || '').toLowerCase();
    
    // Check for flood-related alerts
    if (eventType.includes('flood') || event.includes('flood')) {
      // Determine severity from NWS
      let severity: 'minor' | 'moderate' | 'major' | 'record' = 'moderate';
      const nwsSeverity = (properties.severity || '').toLowerCase();
      if (nwsSeverity === 'extreme') severity = 'record';
      else if (nwsSeverity === 'severe') severity = 'major';
      else if (nwsSeverity === 'moderate') severity = 'moderate';
      else severity = 'minor';
      
      floodWarnings.push({
        id: properties.id || alert.id || `nws-flood-${Date.now()}`,
        location: properties.areaDesc || 'Vermont',
        severity,
        status: properties.status || 'active',
        description: properties.headline || properties.description || properties.summary || 'Flood warning',
        timestamp: properties.sent || properties.onset || new Date().toISOString(),
        source: 'NWS',
      });
    }
  });
  
  // Extract from Xweather alerts
  xweatherAlerts.forEach((alert: any) => {
    const type = (alert.type || alert.name || '').toLowerCase();
    
    if (type.includes('flood')) {
      let severity: 'minor' | 'moderate' | 'major' | 'record' = 'moderate';
      const alertSeverity = (alert.severity || '').toLowerCase();
      if (alertSeverity === 'extreme') severity = 'record';
      else if (alertSeverity === 'severe') severity = 'major';
      else if (alertSeverity === 'moderate') severity = 'moderate';
      else severity = 'minor';
      
      floodWarnings.push({
        id: alert.id || `xweather-flood-${Date.now()}`,
        location: alert.zones?.[0]?.name || 'Vermont',
        severity,
        status: 'active',
        description: alert.title || alert.body || alert.name || 'Flood warning',
        timestamp: alert.issueTimeISO || new Date().toISOString(),
        source: 'Xweather',
      });
    }
  });
  
  // Remove duplicates based on location and description similarity
  const uniqueWarnings = Array.from(
    new Map(
      floodWarnings.map((warning) => [
        `${warning.location}-${warning.description.substring(0, 50)}`,
        warning,
      ])
    ).values()
  );
  
  return uniqueWarnings;
}

/**
 * Extract road safety alerts from road conditions
 */
function extractRoadSafetyAlerts(roadConditions: any[]): RoadSafetyAlert[] {
  const alerts: RoadSafetyAlert[] = [];
  
  roadConditions.forEach((condition) => {
    // Only create alerts for dangerous conditions
    if (condition.condition === 'closed' || condition.condition === 'ice' || 
        condition.severity === 'MAJOR' || condition.severity === 'MODERATE') {
      
      let severity = 'moderate';
      if (condition.condition === 'closed' || condition.severity === 'MAJOR') {
        severity = 'severe';
      } else if (condition.condition === 'ice') {
        severity = 'high';
      }
      
      alerts.push({
        id: condition.routeId || `road-alert-${Date.now()}-${Math.random()}`,
        location: condition.route || 'Vermont',
        type: condition.condition === 'closed' ? 'Road Closure' : 
              condition.condition === 'ice' ? 'Ice Warning' :
              condition.condition === 'snow-covered' ? 'Snow Warning' : 'Road Hazard',
        severity,
        status: 'active',
        description: condition.warning || `${condition.condition} conditions on ${condition.route}`,
        affectedRoads: condition.route ? [condition.route] : undefined,
        timestamp: condition.timestamp || new Date().toISOString(),
        source: condition.source || 'Unknown',
      });
    }
  });
  
  return alerts;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const location = searchParams.get('location') || 'Vermont';
  
  try {
    // Fetch alerts from NWS and Xweather (same sources as weather alerts banner)
    const [nwsAlerts, xweatherAlerts, roadConditions] = await Promise.all([
      fetchNWSAlerts('VT').catch(() => []),
      fetchXweatherAlerts(location, 20).catch(() => []),
      fetchAllRoadConditions(location).catch(() => []),
    ]);

    // Extract flood warnings from alerts
    const floodWarnings = extractFloodWarnings(nwsAlerts, xweatherAlerts);
    
    // Extract road safety alerts from road conditions
    const roadSafetyAlerts = extractRoadSafetyAlerts(roadConditions);

    return NextResponse.json({
      location,
      floodWarnings,
      roadSafetyAlerts,
      timestamp: new Date().toISOString(),
      sources: {
        nwsAlerts: nwsAlerts.length,
        xweatherAlerts: xweatherAlerts.length,
        roadConditions: roadConditions.length,
      },
    });
  } catch (error) {
    console.error('Error fetching flooding/road safety data:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch flooding and road safety data',
        details: error instanceof Error ? error.message : 'Unknown error',
        location,
        floodWarnings: [],
        roadSafetyAlerts: [],
        timestamp: new Date().toISOString(),
      },
      { status: 200 } // Return 200 with empty arrays so page doesn't crash
    );
  }
}









