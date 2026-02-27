import { NextResponse } from 'next/server';
import { fetchXweatherAlerts, XweatherAlert } from '@/lib/xweatherService';
import { fetchNWSAlerts } from '@/lib/nwsService';

interface UnifiedAlert {
  id: string;
  name: string;
  type: string;
  severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme';
  title: string;
  body: string;
  expiresISO?: string;
  issueTimeISO?: string;
  source: 'Xweather' | 'NWS';
}

/**
 * Convert NWS alert format to unified alert format
 */
function convertNWSAlertToUnified(nwsAlert: any): UnifiedAlert {
  const properties = nwsAlert.properties || {};
  
  // Map NWS severity/urgency to unified severity
  let severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme' = 'Moderate';
  const nwsSeverity = properties.severity?.toLowerCase() || '';
  const nwsUrgency = properties.urgency?.toLowerCase() || '';
  
  if (nwsSeverity === 'extreme' || nwsUrgency === 'immediate') {
    severity = 'Extreme';
  } else if (nwsSeverity === 'severe' || nwsUrgency === 'expected') {
    severity = 'Severe';
  } else if (nwsSeverity === 'moderate' || nwsUrgency === 'future') {
    severity = 'Moderate';
  } else {
    severity = 'Minor';
  }
  
  return {
    id: properties.id || nwsAlert.id || `nws-${Date.now()}-${Math.random()}`,
    name: properties.event || 'Weather Alert',
    type: properties.event || properties.eventType || 'Unknown',
    severity,
    title: properties.headline || properties.event || 'Weather Alert',
    body: properties.description || properties.summary || '',
    expiresISO: properties.expires,
    issueTimeISO: properties.sent || properties.onset,
    source: 'NWS',
  };
}

/**
 * GET /api/weather/alerts
 * Fetch weather alerts from BOTH Xweather AND NWS
 * Combines alerts from both sources for comprehensive coverage
 * 
 * Query params:
 * - location: Location to fetch alerts for (default: 'Vermont')
 * - limit: Maximum number of alerts to return (default: 10)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const location = searchParams.get('location') || 'Vermont';
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    // Fetch alerts from BOTH sources in parallel
    const [xweatherAlerts, nwsAlerts] = await Promise.all([
      fetchXweatherAlerts(location, limit).catch((err) => {
        console.error('[Alerts API] Error fetching Xweather alerts:', err);
        return [] as XweatherAlert[];
      }),
      fetchNWSAlerts('VT').catch((err) => {
        console.error('[Alerts API] Error fetching NWS alerts:', err);
        return [];
      }),
    ]);

    // Convert Xweather alerts to unified format
    const unifiedXweatherAlerts: UnifiedAlert[] = xweatherAlerts.map((alert) => ({
      id: alert.id,
      name: alert.name,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      body: alert.body,
      expiresISO: alert.expiresISO,
      issueTimeISO: alert.issueTimeISO,
      source: 'Xweather' as const,
    }));

    // Convert NWS alerts to unified format
    const unifiedNWSAlerts: UnifiedAlert[] = nwsAlerts.map(convertNWSAlertToUnified);

    // Combine alerts from both sources
    const allAlerts: UnifiedAlert[] = [...unifiedXweatherAlerts, ...unifiedNWSAlerts];

    // Remove duplicates based on alert ID and type+title similarity
    const uniqueAlerts = Array.from(
      new Map(
        allAlerts.map((alert) => [
          // Use a combination of source+id+type to identify unique alerts
          `${alert.source}-${alert.id}-${alert.type}`,
          alert,
        ])
      ).values()
    );

    // Sort by severity (Extreme > Severe > Moderate > Minor), then by issue time (newest first)
    const severityOrder = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1 };
    uniqueAlerts.sort((a, b) => {
      const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      if (severityDiff !== 0) return severityDiff;
      
      // If same severity, sort by issue time (newest first)
      const aTime = a.issueTimeISO ? new Date(a.issueTimeISO).getTime() : 0;
      const bTime = b.issueTimeISO ? new Date(b.issueTimeISO).getTime() : 0;
      return bTime - aTime;
    });

    // Limit results
    const limitedAlerts = uniqueAlerts.slice(0, limit);

    return NextResponse.json({
      alerts: limitedAlerts,
      count: limitedAlerts.length,
      sources: {
        xweather: unifiedXweatherAlerts.length,
        nws: unifiedNWSAlerts.length,
      },
      location,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching weather alerts:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch weather alerts',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}






