/**
 * VTrans Lane Closure Service
 * Parses lane closure, construction, and road closure data from VTrans XML feed
 * 
 * Data includes:
 * - Lane closures (construction, maintenance, etc.)
 * - Road closures (seasonal, emergency, etc.)
 * - Bridge maintenance
 * - Construction projects
 * - GPS coordinates for closure locations
 */

export interface VTransLaneClosure {
  id: string;
  description: string;
  eventType: 'Construction' | 'Other' | 'PSA';
  severity: 'Low' | 'Medium' | 'High';
  status: 'Opened' | 'Closed' | 'Unknown';
  
  // Location data
  startLocation: {
    state: string;
    county: string;
    district: string;
    city: string;
    roadway: string;
    direction: string;
    crossstreet?: string;
    latitude: number;
    longitude: number;
  };
  
  endLocation: {
    state: string;
    county: string;
    district: string;
    city: string;
    roadway: string;
    direction: string;
    crossstreet?: string;
    latitude: number;
    longitude: number;
  };
  
  midpoints?: Array<{
    order: number;
    latitude: number;
    longitude: number;
  }>;
  
  // Lane information
  affectedLanesDescription: string;
  lanesBlocked: boolean;
  
  // Timing
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  daysClosed?: string[];
  
  // Restrictions
  speedRestriction?: number;
  widthRestriction?: number; // inches
  heightRestriction?: number; // inches
  
  // Metadata
  lastUpdated: string;
  created: string;
}

/**
 * Convert microdegree coordinates to decimal degrees
 */
function microdegreesToDecimal(microdeg: number): number {
  return microdeg / 1000000;
}

/**
 * Parse VTrans Lane Closure XML
 */
export function parseVTransLaneClosureXML(xmlText: string): VTransLaneClosure[] {
  const closures: VTransLaneClosure[] = [];
  
  try {
    // Extract laneClosure elements
    const closureMatches = xmlText.matchAll(/<laneClosure[^>]*>([\s\S]*?)<\/laneClosure>/g);
    
    for (const match of closureMatches) {
      const closureContent = match[0];
      
      // Helper to extract tag content
      const getId = (tag: string, parent?: string): string | undefined => {
        const searchContent = parent ? 
          closureContent.match(new RegExp(`<${parent}[^>]*>([\\s\\S]*?)<\\/${parent}>`, 'i'))?.[1] || '' :
          closureContent;
        const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
        const result = searchContent.match(regex);
        return result ? result[1].trim() : undefined;
      };
      
      const getNumeric = (tag: string, parent?: string): number | undefined => {
        const value = getId(tag, parent);
        return value && !isNaN(Number(value)) ? Number(value) : undefined;
      };
      
      const getAttribute = (tag: string, attr: string): boolean | undefined => {
        const regex = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']*)["']`, 'i');
        const match = closureContent.match(regex);
        if (match && match[1]) {
          return match[1] === 'true';
        }
        return undefined;
      };
      
      // Parse basic info
      const idMatch = closureContent.match(/id=["']([^"']+)["']/);
      const id = idMatch ? idMatch[1] : 'unknown';
      
      // Parse locations
      const startLat = getNumeric('lat', 'startLocation');
      const startLon = getNumeric('lon', 'startLocation');
      const endLat = getNumeric('lat', 'endLocation');
      const endLon = getNumeric('lon', 'endLocation');
      
      if (!startLat || !startLon || !endLat || !endLon) continue;
      
      // Parse midpoints
      const midpoints: Array<{ order: number; latitude: number; longitude: number }> = [];
      const midpointMatches = closureContent.matchAll(/<point>([\s\S]*?)<\/point>/g);
      for (const pointMatch of midpointMatches) {
        const order = getNumeric('order', 'point') || 0;
        const lat = getNumeric('lat', 'point');
        const lon = getNumeric('lon', 'point');
        if (lat && lon) {
          midpoints.push({
            order,
            latitude: microdegreesToDecimal(lat),
            longitude: microdegreesToDecimal(lon),
          });
        }
      }
      midpoints.sort((a, b) => a.order - b.order);
      
      // Check if lanes are blocked
      const hasBlockedLanes = closureContent.includes('isBlocked="true"') || 
                              getId('affectedLanesDescription')?.toLowerCase().includes('closed') ||
                              getId('affectedLanesDescription')?.toLowerCase().includes('blocked');
      
      // Parse days closed
      const daysClosedMatch = closureContent.match(/<daysClosed[^>]*>([\s\S]*?)<\/daysClosed>/);
      const daysClosed: string[] = [];
      if (daysClosedMatch) {
        const daysContent = daysClosedMatch[1];
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach(day => {
          if (daysContent.includes(`${day}="true"`)) {
            daysClosed.push(day);
          }
        });
      }
      
      const closure: VTransLaneClosure = {
        id,
        description: getId('desc') || 'No description',
        eventType: (getId('eventType') as 'Construction' | 'Other' | 'PSA') || 'Other',
        severity: (getId('severity') as 'Low' | 'Medium' | 'High') || 'Low',
        status: (getId('status') as 'Opened' | 'Closed' | 'Unknown') || 'Unknown',
        startLocation: {
          state: getId('state', 'startLocation') || 'Vermont',
          county: getId('county', 'startLocation') || '',
          district: getId('district', 'startLocation') || '',
          city: getId('city', 'startLocation') || '',
          roadway: getId('roadway', 'startLocation') || '',
          direction: getId('direction', 'startLocation') || '',
          crossstreet: getId('crossstreet', 'startLocation'),
          latitude: microdegreesToDecimal(startLat),
          longitude: microdegreesToDecimal(startLon),
        },
        endLocation: {
          state: getId('state', 'endLocation') || 'Vermont',
          county: getId('county', 'endLocation') || '',
          district: getId('district', 'endLocation') || '',
          city: getId('city', 'endLocation') || '',
          roadway: getId('roadway', 'endLocation') || '',
          direction: getId('direction', 'endLocation') || '',
          crossstreet: getId('crossstreet', 'endLocation'),
          latitude: microdegreesToDecimal(endLat),
          longitude: microdegreesToDecimal(endLon),
        },
        midpoints: midpoints.length > 0 ? midpoints : undefined,
        affectedLanesDescription: getId('affectedLanesDescription') || 'Unknown',
        lanesBlocked: hasBlockedLanes,
        startDate: getId('startDate'),
        endDate: getId('endDate'),
        startTime: getId('startTime'),
        endTime: getId('endTime'),
        daysClosed: daysClosed.length > 0 ? daysClosed : undefined,
        speedRestriction: getNumeric('speed', 'roadRestrictions'),
        widthRestriction: getNumeric('width', 'roadRestrictions'),
        heightRestriction: getNumeric('height', 'roadRestrictions'),
        lastUpdated: getId('lastUpdatedTimestamp') || new Date().toISOString(),
        created: getId('createdTimestamp') || new Date().toISOString(),
      };
      
      closures.push(closure);
    }
    
    return closures;
  } catch (error) {
    console.error('Error parsing VTrans Lane Closure XML:', error);
    return [];
  }
}

/**
 * Convert lane closures to road conditions
 */
export function convertLaneClosuresToRoadConditions(
  closures: VTransLaneClosure[]
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
  return closures
    .filter(closure => closure.lanesBlocked || closure.status === 'Closed' || closure.status === 'Opened')
    .map(closure => {
      // Determine condition based on closure type
      let condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown' = 'unknown';
      
      if (closure.status === 'Closed' || closure.affectedLanesDescription.toLowerCase().includes('all lanes closed')) {
        condition = 'closed';
      } else if (closure.lanesBlocked) {
        // Partial closure - treat as caution
        condition = 'unknown'; // Will show as caution on map
      }
      
      // Build warning message
      let warning = closure.description;
      if (closure.affectedLanesDescription) {
        warning += ` - ${closure.affectedLanesDescription}`;
      }
      if (closure.startTime && closure.endTime) {
        warning += ` (${closure.startTime}-${closure.endTime})`;
      }
      
      // Determine severity
      let severity: 'MINOR' | 'MODERATE' | 'MAJOR' | undefined = undefined;
      if (condition === 'closed') {
        severity = 'MAJOR';
      } else if (closure.severity === 'High') {
        severity = 'MAJOR';
      } else if (closure.severity === 'Medium') {
        severity = 'MODERATE';
      } else if (closure.severity === 'Low') {
        severity = 'MINOR';
      }
      
      // Build polyline from coordinates
      const polyline: Array<{ lat: number; lon: number }> = [];
      polyline.push({ lat: closure.startLocation.latitude, lon: closure.startLocation.longitude });
      if (closure.midpoints) {
        closure.midpoints.forEach(mp => {
          polyline.push({ lat: mp.latitude, lon: mp.longitude });
        });
      }
      polyline.push({ lat: closure.endLocation.latitude, lon: closure.endLocation.longitude });
      
      return {
        route: closure.startLocation.roadway || closure.id,
        condition,
        warning,
        source: 'VTrans Lane Closures',
        timestamp: closure.lastUpdated,
        latitude: closure.startLocation.latitude,
        longitude: closure.startLocation.longitude,
        severity,
        polyline: polyline.length > 2 ? polyline : undefined, // Only include if multiple points
      };
    });
}

/**
 * Fetch VTrans Lane Closure data from New England Compass Developer Portal
 * Source: https://nec-por.ne-compass.com/DeveloperPortal/
 * Data Set: Lane Closures
 */
export async function fetchVTransLaneClosureData(xmlData?: string): Promise<VTransLaneClosure[]> {
  try {
    if (xmlData) {
      return parseVTransLaneClosureXML(xmlData);
    }
    
    // Fetch from New England Compass Developer Portal
    const endpoints = [
      'https://nec-por.ne-compass.com/DeveloperPortal/LaneClosures/Vermont',
      'https://nec-por.ne-compass.com/DeveloperPortal/LaneClosures/Vermont.xml',
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
          const closures = parseVTransLaneClosureXML(xmlText);
          
          if (closures.length > 0) {
            console.log(`[VTrans Lane Closures] Fetched ${closures.length} closures from ${endpoint}`);
            return closures;
          }
        }
      } catch (e) {
        console.warn(`[VTrans Lane Closures] Failed to fetch from ${endpoint}:`, e instanceof Error ? e.message : 'Unknown error');
        continue;
      }
    }
    
    console.warn('VTrans Lane Closures: No accessible endpoints found. Use parseVTransLaneClosureXML() with XML data directly.');
    return [];
  } catch (error) {
    console.error('Error fetching VTrans lane closure data:', error);
    return [];
  }
}

/**
 * Fetch and convert lane closures to road conditions
 */
export async function fetchVTransLaneClosureRoadConditions(xmlData?: string): Promise<Array<{
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
    const closures = await fetchVTransLaneClosureData(xmlData);
    return convertLaneClosuresToRoadConditions(closures);
  } catch (error) {
    console.error('Error fetching VTrans lane closure road conditions:', error);
    return [];
  }
}









