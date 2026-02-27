/**
 * TomTom Traffic API Service
 * Provides real-time traffic flow and incident data for road safety assessments
 * Documentation: https://developer.tomtom.com/traffic-api/documentation
 */

const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY || process.env.NEXT_PUBLIC_TOMTOM_API_KEY;
const TOMTOM_BASE_URL = 'https://api.tomtom.com/traffic/services/5';

export interface TomTomTrafficIncident {
  id: string;
  point: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  from?: string;
  to?: string;
  delay: number; // seconds
  incidentType: 'ACCIDENT' | 'JAM' | 'WEATHERHAZARD' | 'ROADWORKS' | 'ROAD_CLOSED' | 'HAZARD' | 'OTHER';
  severity: 'MINOR' | 'MODERATE' | 'MAJOR';
  roadNumber?: string;
  description?: string;
  eventCode: number;
  startTime?: string;
  endTime?: string;
  length?: number; // meters
  closed?: boolean;
  cause?: string;
}

export interface TomTomTrafficFlow {
  flowSegmentData: {
    functionalClass?: string;
    currentSpeed: number; // km/h
    freeFlowSpeed: number; // km/h
    currentTravelTime: number; // seconds
    freeFlowTravelTime: number; // seconds
    confidence: number; // 0-1
    roadClosure?: boolean;
    coordinates: {
      coordinate: Array<{
        latitude: number;
        longitude: number;
      }>;
    };
  };
}

/**
 * Calculate bounding box area in km²
 * Formula: area = (maxLon - minLon) * 111 * cos(centerLat) * (maxLat - minLat) * 111
 */
function calculateBboxArea(bbox: string): number {
  const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number);
  const centerLat = (minLat + maxLat) / 2;
  const latDiff = maxLat - minLat;
  const lonDiff = maxLon - minLon;
  
  // Approximate km conversion: 1 degree lat ≈ 111 km, 1 degree lon ≈ 111 * cos(lat) km
  const area = lonDiff * 111 * Math.cos(centerLat * Math.PI / 180) * latDiff * 111;
  return area;
}

/**
 * Fetch traffic incidents for Vermont
 * Split Vermont into smaller regions to stay under TomTom's 10,000km² limit
 */
export async function fetchTomTomTrafficIncidents(
  boundingBox?: string
): Promise<TomTomTrafficIncident[]> {
  try {
    // If custom bounding box provided, use it (assume it's valid)
    if (boundingBox) {
      return await fetchTomTomIncidentsForBbox(boundingBox);
    }
    
    // Split Vermont into smaller regions to stay under 10,000km² limit
    // Vermont is approximately: -73.454 to -71.464 longitude (1.99°), 42.727 to 45.016 latitude (2.289°)
    // Total area ~24,000km², so we need to split into smaller chunks
    // Each region needs to be ~8,000km² or less
    // Split longitude into 2 parts and latitude into 4 parts = 8 regions (~3,000km² each)
    const vermontRegions = [
      // Northern regions (44.5 to 45.016 latitude)
      '-73.454,44.5,-72.459,45.016',   // NW corner
      '-72.459,44.5,-71.464,45.016',   // NE corner
      // Upper-central regions (44.0 to 44.5 latitude)
      '-73.454,44.0,-72.459,44.5',     // Upper west-central
      '-72.459,44.0,-71.464,44.5',     // Upper east-central
      // Lower-central regions (43.3 to 44.0 latitude)
      '-73.454,43.3,-72.459,44.0',     // Lower west-central
      '-72.459,43.3,-71.464,44.0',     // Lower east-central
      // Southern regions (42.727 to 43.3 latitude)
      '-73.454,42.727,-72.459,43.3',   // SW corner
      '-72.459,42.727,-71.464,43.3',   // SE corner
    ];
    
    // Fetch incidents from all regions in parallel
    const allIncidents: TomTomTrafficIncident[] = [];
    const regionPromises = vermontRegions.map(async (bbox, index) => {
      try {
        const incidents = await fetchTomTomIncidentsForBbox(bbox);
        console.log(`[TomTom] Region ${index + 1}: Found ${incidents.length} incidents`);
        return incidents;
      } catch (error) {
        console.warn(`[TomTom] Failed to fetch region ${index + 1} (${bbox}):`, error instanceof Error ? error.message : error);
        return [];
      }
    });
    
    const regionResults = await Promise.all(regionPromises);
    regionResults.forEach(incidents => {
      allIncidents.push(...incidents);
    });
    
    // Remove duplicates based on incident ID
    const uniqueIncidents = Array.from(
      new Map(allIncidents.map(incident => [incident.id, incident])).values()
    );
    
    console.log(`[TomTom] Total unique incidents: ${uniqueIncidents.length} from ${vermontRegions.length} regions`);
    return uniqueIncidents;
  } catch (error) {
    console.error('Error fetching TomTom traffic incidents:', error);
    return [];
  }
}

/**
 * Fetch incidents for a specific bounding box
 */
async function fetchTomTomIncidentsForBbox(bbox: string): Promise<TomTomTrafficIncident[]> {
  if (!TOMTOM_API_KEY) {
    console.warn('[TomTom] API key not configured - skipping TomTom traffic incidents');
    console.warn('[TomTom] Checked: TOMTOM_API_KEY and NEXT_PUBLIC_TOMTOM_API_KEY - both undefined');
    return [];
  }
  
  // Log first 4 chars for debugging (not the full key for security)
  console.log(`[TomTom] Using API key: ${TOMTOM_API_KEY.substring(0, 4)}... (length: ${TOMTOM_API_KEY.length})`);
  
  // Validate bounding box area (should be under 10,000km²)
  const area = calculateBboxArea(bbox);
  if (area > 10000) {
    console.warn(`[TomTom] Bounding box area ${area.toFixed(0)}km² exceeds 10,000km² limit. Splitting recommended.`);
    // Still try, but warn
  }
  
  // TomTom Traffic API v5 format: /incidentDetails?bbox={bbox}&key={key}
  // Bounding box format: minLon,minLat,maxLon,maxLat as query parameter
  // Note: language parameter removed - "en" is not supported, default language is used
  const url = `${TOMTOM_BASE_URL}/incidentDetails?bbox=${bbox}&key=${TOMTOM_API_KEY}`;
  
  console.log(`[TomTom] Fetching incidents for bbox: ${bbox} (area: ${area.toFixed(0)}km²)`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    console.error(`[TomTom] API error ${response.status} ${response.statusText}`);
    console.error(`[TomTom] Request bbox: ${bbox}`);
    console.error(`[TomTom] Error response: ${errorText.substring(0, 500)}`);
    
    // If it's a 401/403, the API key might be invalid
    if (response.status === 401 || response.status === 403) {
      console.error(`[TomTom] ⚠️ Authentication failed (${response.status}) - API key may be invalid, expired, or have domain restrictions.`);
      console.error(`[TomTom] Check your TOMTOM_API_KEY in .env.local and verify it's active in the TomTom dashboard.`);
    }
    
    // If it's a 400, might be invalid bbox format or other request issue
    if (response.status === 400) {
      console.error(`[TomTom] ⚠️ Bad Request (400) - Check bbox format and ensure area is under 10,000km²`);
    }
    
    // Return empty array instead of throwing - allow other sources to work
    return [];
  }

  const data = await response.json();
  
  // Parse incidents from TomTom response
  const incidents: TomTomTrafficIncident[] = [];
  
  if (data.incidents && Array.isArray(data.incidents)) {
    data.incidents.forEach((incident: any) => {
      try {
        const parsed: TomTomTrafficIncident = {
          id: incident.id || incident.properties?.id || `incident-${Date.now()}-${Math.random()}`,
          point: {
            type: 'Point',
            coordinates: incident.geometry?.coordinates || [0, 0],
          },
          delay: incident.properties?.magnitudeOfDelay || 0,
          incidentType: mapTomTomIncidentType(incident.properties?.iconCategory || incident.type),
          severity: mapTomTomSeverity(incident.properties?.magnitudeOfDelay),
          description: incident.properties?.events?.[0]?.description || incident.description,
          eventCode: incident.properties?.events?.[0]?.code || 0,
          closed: incident.properties?.iconCategory === 11, // Road closed category
        };
        
        incidents.push(parsed);
      } catch (err) {
        console.error('Error parsing TomTom incident:', err);
      }
    });
  }

  return incidents;
}

/**
 * Fetch traffic flow data for a specific location
 */
export async function fetchTomTomTrafficFlow(
  latitude: number,
  longitude: number
): Promise<TomTomTrafficFlow | null> {
  try {
    const url = `${TOMTOM_BASE_URL}/flowSegmentData/relative0/10/json?key=${TOMTOM_API_KEY}&point=${latitude},${longitude}&unit=MPH`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`TomTom Flow API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    return data as TomTomTrafficFlow;
  } catch (error) {
    console.error('Error fetching TomTom traffic flow:', error);
    return null;
  }
}

/**
 * Map TomTom icon category to incident type
 */
function mapTomTomIncidentType(category: number | string): TomTomTrafficIncident['incidentType'] {
  if (typeof category === 'string') {
    if (category.includes('ACCIDENT')) return 'ACCIDENT';
    if (category.includes('JAM')) return 'JAM';
    if (category.includes('WEATHER')) return 'WEATHERHAZARD';
    if (category.includes('ROADWORKS') || category.includes('CONSTRUCTION')) return 'ROADWORKS';
    if (category.includes('CLOSED')) return 'ROAD_CLOSED';
    if (category.includes('HAZARD')) return 'HAZARD';
    return 'OTHER';
  }
  
  // Icon category numbers (approximate mapping)
  const categoryMap: Record<number, TomTomTrafficIncident['incidentType']> = {
    0: 'ACCIDENT',
    1: 'ACCIDENT',
    2: 'JAM',
    3: 'JAM',
    4: 'ROADWORKS',
    5: 'ROADWORKS',
    6: 'ROAD_CLOSED',
    7: 'HAZARD',
    8: 'WEATHERHAZARD',
    9: 'HAZARD',
    10: 'JAM',
    11: 'ROAD_CLOSED',
  };
  
  return categoryMap[category as number] || 'OTHER';
}

/**
 * Map TomTom delay magnitude to severity
 */
function mapTomTomSeverity(delay: number): TomTomTrafficIncident['severity'] {
  if (!delay || delay === 0) return 'MINOR';
  if (delay < 300) return 'MINOR'; // Less than 5 minutes
  if (delay < 900) return 'MODERATE'; // 5-15 minutes
  return 'MAJOR'; // More than 15 minutes
}

/**
 * Convert TomTom traffic incidents to RoadCondition format
 */
export function convertTomTomIncidentsToRoadConditions(
  incidents: TomTomTrafficIncident[]
): Array<{
  route: string;
  condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
  temperature?: number;
  warning?: string;
  source: string;
  timestamp: string;
      latitude?: number;
      longitude?: number;
      severity?: 'MINOR' | 'MODERATE' | 'MAJOR';
}> {
  return incidents.map(incident => {
    let condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown' = 'unknown';
    let warning = '';
    
    switch (incident.incidentType) {
      case 'ROAD_CLOSED':
        condition = 'closed';
        warning = `Road closed: ${incident.description || 'Road closure reported'}`;
        break;
      case 'ACCIDENT':
        condition = 'closed'; // Treat accidents as closures for safety
        warning = `Traffic accident: ${incident.description || 'Accident reported'}. Delay: ${Math.round(incident.delay / 60)} minutes`;
        break;
      case 'WEATHERHAZARD':
        // Try to determine weather-related condition
        const desc = (incident.description || '').toLowerCase();
        if (desc.includes('ice') || desc.includes('icy')) {
          condition = 'ice';
          warning = `Ice hazard: ${incident.description || 'Icy conditions reported'}`;
        } else if (desc.includes('snow')) {
          condition = 'snow-covered';
          warning = `Snow hazard: ${incident.description || 'Snow conditions reported'}`;
        } else if (desc.includes('rain') || desc.includes('wet')) {
          condition = 'wet';
          warning = `Wet conditions: ${incident.description || 'Wet road conditions reported'}`;
        } else {
          condition = 'unknown';
          warning = `Weather hazard: ${incident.description || 'Weather-related road hazard'}`;
        }
        break;
      case 'ROADWORKS':
        condition = 'closed'; // Treat major roadworks as closures
        warning = `Road works: ${incident.description || 'Construction/road work in progress'}`;
        break;
      case 'JAM':
        condition = 'clear'; // Traffic jam but road is clear
        warning = `Traffic congestion: ${incident.description || `Heavy traffic. Delay: ${Math.round(incident.delay / 60)} minutes`}`;
        break;
      case 'HAZARD':
        condition = 'unknown';
        warning = `Road hazard: ${incident.description || 'Hazard reported on road'}`;
        break;
      default:
        condition = 'unknown';
        warning = incident.description || 'Traffic incident reported';
    }
    
    // Add severity to warning
    if (incident.severity && incident.severity !== 'MINOR') {
      warning += ` (${incident.severity} severity)`;
    }
    
    return {
      route: incident.roadNumber || incident.from || 'Unknown Route',
      condition,
      warning,
      source: 'TomTom',
      timestamp: incident.startTime || new Date().toISOString(),
      latitude: incident.point.coordinates[1],
      longitude: incident.point.coordinates[0],
      severity: incident.severity as 'MINOR' | 'MODERATE' | 'MAJOR' | undefined,
      delay: incident.delay,
    };
  });
}









