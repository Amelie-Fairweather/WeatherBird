/**
 * VTrans Traffic Incidents Service
 * Parses traffic incident data from VTrans XML feed
 * 
 * Data includes:
 * - Construction incidents
 * - Hazards
 * - Accidents (including major accidents)
 * - Road closures
 * - GPS polylines for incident locations
 */

export interface VTransIncident {
  id: string;
  street: string;
  type: 'CONSTRUCTION' | 'HAZARD' | 'ACCIDENT' | 'ROAD_CLOSED' | 'OTHER';
  subtype?: string;
  description: string;
  startTime: string;
  endTime: string;
  direction: string;
  polyline: Array<{ latitude: number; longitude: number }>;
}

/**
 * Parse polyline string into array of coordinates
 * Format: "lat1 lon1 lat2 lon2 ..." (decimal degrees)
 */
function parsePolyline(polylineText: string): Array<{ latitude: number; longitude: number }> {
  const coords: Array<{ latitude: number; longitude: number }> = [];
  
  if (!polylineText || !polylineText.trim()) {
    return coords;
  }
  
  // Split by whitespace and parse pairs
  const parts = polylineText.trim().split(/\s+/);
  
  for (let i = 0; i < parts.length - 1; i += 2) {
    const lat = parseFloat(parts[i]);
    const lon = parseFloat(parts[i + 1]);
    
    if (!isNaN(lat) && !isNaN(lon)) {
      coords.push({ latitude: lat, longitude: lon });
    }
  }
  
  return coords;
}

/**
 * Parse VTrans Incidents XML
 */
export function parseVTransIncidentsXML(xmlText: string): VTransIncident[] {
  const incidents: VTransIncident[] = [];
  
  try {
    // Extract incident elements
    const incidentMatches = xmlText.matchAll(/<incident[^>]*>([\s\S]*?)<\/incident>/g);
    
    for (const match of incidentMatches) {
      const incidentContent = match[0];
      
      // Helper to extract tag content
      const getId = (tag: string): string | undefined => {
        const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
        const result = incidentContent.match(regex);
        return result ? result[1].trim() : undefined;
      };
      
      const getAttribute = (attr: string): string | undefined => {
        const regex = new RegExp(`${attr}=["']([^"']+)["']`, 'i');
        const match = incidentContent.match(regex);
        return match ? match[1] : undefined;
      };
      
      // Parse basic info
      const idMatch = incidentContent.match(/id=["']([^"']+)["']/);
      const id = idMatch ? idMatch[1] : 'unknown';
      
      // Parse polyline
      const polylineText = getId('polyline') || '';
      const polyline = parsePolyline(polylineText);
      
      if (polyline.length === 0) {
        // Skip incidents without valid coordinates
        continue;
      }
      
      // Parse type
      const typeText = getId('type')?.toUpperCase() || 'OTHER';
      let type: VTransIncident['type'] = 'OTHER';
      
      if (typeText === 'CONSTRUCTION') type = 'CONSTRUCTION';
      else if (typeText === 'HAZARD') type = 'HAZARD';
      else if (typeText === 'ACCIDENT') type = 'ACCIDENT';
      else if (typeText === 'ROAD_CLOSED') type = 'ROAD_CLOSED';
      
      const incident: VTransIncident = {
        id,
        street: getId('street') || 'Unknown Road',
        type,
        subtype: getId('subtype'),
        description: getId('description') || 'No description',
        startTime: getId('starttime') || new Date().toISOString(),
        endTime: getId('endtime') || new Date().toISOString(),
        direction: getId('direction') || 'UNKNOWN',
        polyline,
      };
      
      incidents.push(incident);
    }
    
    return incidents;
  } catch (error) {
    console.error('Error parsing VTrans Incidents XML:', error);
    return [];
  }
}

/**
 * Convert incidents to road conditions
 */
export function convertIncidentsToRoadConditions(
  incidents: VTransIncident[]
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
  polyline?: Array<{ lat: number; lon: number }>;
}> {
  return incidents.map(incident => {
    // Map incident type to condition
    let condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown' = 'unknown';
    
    switch (incident.type) {
      case 'ROAD_CLOSED':
        condition = 'closed';
        break;
      case 'ACCIDENT':
        // Accidents are hazardous but road may still be passable
        condition = 'unknown'; // Will show as caution
        break;
      case 'HAZARD':
        condition = 'unknown'; // Hazards require caution
        break;
      case 'CONSTRUCTION':
        condition = 'unknown'; // Construction zones require caution
        break;
      default:
        condition = 'unknown';
    }
    
    // Check description for closure keywords
    const descLower = incident.description.toLowerCase();
    if (descLower.includes('closed') || descLower.includes('closure')) {
      condition = 'closed';
    }
    
    // Determine severity
    let severity: 'MINOR' | 'MODERATE' | 'MAJOR' | undefined = undefined;
    
    if (condition === 'closed') {
      severity = 'MAJOR';
    } else if (incident.type === 'ACCIDENT') {
      if (incident.subtype === 'ACCIDENT_MAJOR') {
        severity = 'MAJOR';
      } else {
        severity = 'MODERATE';
      }
    } else if (incident.type === 'HAZARD' || incident.type === 'CONSTRUCTION') {
      severity = 'MODERATE';
    } else {
      severity = 'MINOR';
    }
    
    // Build warning message
    let warning = incident.description;
    if (incident.type === 'ACCIDENT' && incident.subtype) {
      warning = `[${incident.subtype}] ${warning}`;
    }
    
    // Convert polyline format
    const polyline = incident.polyline.map(p => ({
      lat: p.latitude,
      lon: p.longitude,
    }));
    
    // Use first coordinate as primary location
    const primaryCoord = incident.polyline[0];
    
    return {
      route: incident.street,
      condition,
      warning,
      source: 'VTrans Incidents',
      timestamp: incident.startTime,
      latitude: primaryCoord.latitude,
      longitude: primaryCoord.longitude,
      severity,
      polyline: polyline.length > 1 ? polyline : undefined,
    };
  });
}

/**
 * Fetch VTrans Incident data from New England Compass Developer Portal
 * Source: https://nec-por.ne-compass.com/DeveloperPortal/
 * Data Set: Incidents
 */
export async function fetchVTransIncidentData(xmlData?: string): Promise<VTransIncident[]> {
  try {
    if (xmlData) {
      return parseVTransIncidentsXML(xmlData);
    }
    
    // Fetch from New England Compass Developer Portal
    const endpoints = [
      'https://nec-por.ne-compass.com/DeveloperPortal/Incidents/Vermont',
      'https://nec-por.ne-compass.com/DeveloperPortal/Incidents/Vermont.xml',
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: {
            'Accept': 'application/xml, text/xml, */*',
            'User-Agent': 'WEATHERbird/1.0 (weather safety app)',
          },
          signal: AbortSignal.timeout(10000),
        });
        
        if (response.ok) {
          const xmlText = await response.text();
          const incidents = parseVTransIncidentsXML(xmlText);
          
          if (incidents.length > 0) {
            console.log(`[VTrans Incidents] Fetched ${incidents.length} incidents from ${endpoint}`);
            return incidents;
          }
        }
      } catch (e) {
        console.warn(`[VTrans Incidents] Failed to fetch from ${endpoint}:`, e instanceof Error ? e.message : 'Unknown error');
        continue;
      }
    }
    
    console.warn('VTrans Incidents: No accessible endpoints found. Use parseVTransIncidentsXML() with XML data directly.');
    return [];
  } catch (error) {
    console.error('Error fetching VTrans incident data:', error);
    return [];
  }
}

/**
 * Fetch and convert incidents to road conditions
 */
export async function fetchVTransIncidentRoadConditions(xmlData?: string): Promise<Array<{
  route: string;
  condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
  temperature?: number;
  warning?: string;
  source: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  severity?: 'MINOR' | 'MODERATE' | 'MAJOR';
  polyline?: Array<{ lat: number; lon: number }>;
}>> {
  try {
    const incidents = await fetchVTransIncidentData(xmlData);
    return convertIncidentsToRoadConditions(incidents);
  } catch (error) {
    console.error('Error fetching VTrans incident road conditions:', error);
    return [];
  }
}









