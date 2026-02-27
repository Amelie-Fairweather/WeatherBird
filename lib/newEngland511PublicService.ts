/**
 * New England 511 Data Access via Developer Portal
 * 
 * Uses the New England Compass Developer Portal for Vermont data
 * Source: https://nec-por.ne-compass.com/DeveloperPortal/
 * 
 * The portal provides public XML feeds for:
 * - Incidents
 * - Lane Closures
 * - Environment Sensor Data (RWIS)
 * - Traffic Conditions
 * - Travel Times
 * 
 * Note: Some endpoints may require API key registration
 */

/**
 * Fetch incidents from New England Compass Developer Portal
 * This is the official source for Vermont 511 data
 */
export async function fetchPublicIncidents(region: string = 'Vermont'): Promise<any[]> {
  try {
    // Use the official Developer Portal endpoint for incidents
    // The portal provides XML data for Vermont
    const endpoints = [
      `https://nec-por.ne-compass.com/DeveloperPortal/Incidents/${region}`,
      `https://nec-por.ne-compass.com/DeveloperPortal/Incidents/${region}.xml`,
      // Fallback to old patterns if needed
      `https://newengland511.org/api/public/incidents?region=${region}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: {
            'Accept': 'application/xml, application/json, */*',
            'User-Agent': 'WEATHERbird/1.0 (weather safety app)',
          },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          
          if (contentType.includes('json')) {
            const data = await response.json();
            if (data.incidents || Array.isArray(data)) {
              return Array.isArray(data) ? data : data.incidents || [];
            }
          } else if (contentType.includes('xml')) {
            // Note: XML parsing is handled by vtransIncidentsService.ts
            // This function is a fallback for JSON data
            console.log(`[New England 511] XML data detected at ${endpoint} - use vtransIncidentsService for parsing`);
            return [];
          }
        }
      } catch (e) {
        // Continue to next endpoint
        continue;
      }
    }

    // If no endpoints work, return empty array (data may be accessed via XML parsers)
    console.log('New England 511: No JSON endpoints available (XML data accessed via vtransIncidentsService)');
    return [];
  } catch (error) {
    console.warn('New England 511 public data fetch error:', error);
    return [];
  }
}

/**
 * Check if New England 511 has any public RSS feeds
 */
export async function fetchPublicRSSFeed(): Promise<any[]> {
  try {
    const rssFeeds = [
      'https://newengland511.org/feed',
      'https://newengland511.org/rss',
      'https://newengland511.org/incidents/rss',
    ];

    for (const feedUrl of rssFeeds) {
      try {
        const response = await fetch(feedUrl, {
          headers: {
            'Accept': 'application/rss+xml, application/xml, text/xml',
            'User-Agent': 'WEATHERbird/1.0',
          },
        });

        if (response.ok) {
          const xmlText = await response.text();
          // Basic RSS parsing (would need proper XML parser for production)
          // For now, just return that a feed exists
          if (xmlText.includes('<rss') || xmlText.includes('<feed')) {
            console.log(`New England 511 RSS feed found at: ${feedUrl}`);
            // TODO: Parse RSS feed properly with xml2js or similar
            return []; // Placeholder - would parse RSS here
          }
        }
      } catch (e) {
        continue;
      }
    }

    return [];
  } catch (error) {
    console.warn('New England 511 RSS feed check error:', error);
    return [];
  }
}

/**
 * Convert New England 511 public data to RoadCondition format
 */
export function convertNewEngland511ToRoadConditions(data: any[]): Array<{
  route: string;
  condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
  warning?: string;
  source: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
}> {
  return data.map(item => {
    let condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown' = 'unknown';
    
    // Map incident types to conditions
    const desc = (item.description || item.title || '').toLowerCase();
    if (desc.includes('closed') || desc.includes('closure')) {
      condition = 'closed';
    } else if (desc.includes('ice') || desc.includes('icy')) {
      condition = 'ice';
    } else if (desc.includes('snow')) {
      condition = 'snow-covered';
    } else if (desc.includes('wet') || desc.includes('rain')) {
      condition = 'wet';
    } else if (desc.includes('clear') || desc.includes('normal')) {
      condition = 'clear';
    }

    return {
      route: item.route || item.location || item.title || 'Unknown Route',
      condition,
      warning: item.description || item.title,
      source: 'New England 511 (Public)',
      timestamp: item.timestamp || item.date || new Date().toISOString(),
      latitude: item.latitude || item.lat,
      longitude: item.longitude || item.lon,
    };
  });
}

/**
 * Attempt to fetch public data and convert to road conditions
 * 
 * NOTE: Most 511 data is accessed via VTrans services which use the Developer Portal:
 * - VTrans Incidents service uses: https://nec-por.ne-compass.com/DeveloperPortal/Incidents/Vermont
 * - VTrans Lane Closures service uses: https://nec-por.ne-compass.com/DeveloperPortal/LaneClosures/Vermont
 * - VTrans RWIS service uses: https://nec-por.ne-compass.com/DeveloperPortal/EnvironmentSensorData/Vermont
 * 
 * This function attempts to get any additional JSON data if available
 */
export async function fetchNewEngland511PublicRoadConditions(
  region: string = 'Vermont'
): Promise<Array<{
  route: string;
  condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
  warning?: string;
  source: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
}>> {
  try {
    // Try public incidents endpoint (JSON format)
    // Note: Most data comes via XML through VTrans services, but check for JSON too
    const incidents = await fetchPublicIncidents(region);
    
    if (incidents.length > 0) {
      return convertNewEngland511ToRoadConditions(incidents);
    }

    // Try RSS feeds as fallback
    const rssData = await fetchPublicRSSFeed();
    if (rssData.length > 0) {
      return convertNewEngland511ToRoadConditions(rssData);
    }

    // Most 511 data is accessed via VTrans services (Incidents, Lane Closures, RWIS)
    // which use the Developer Portal XML endpoints
    return [];
  } catch (error) {
    console.warn('New England 511 public data fetch failed:', error);
    return [];
  }
}

/**
 * Get information about New England 511 API access
 */
export function getNewEngland511ApiInfo(): {
  hasPublicAccess: boolean;
  requiresApiKey: boolean;
  developerPortalUrl: string;
  note: string;
} {
  return {
    hasPublicAccess: false,
    requiresApiKey: true,
    developerPortalUrl: 'https://nec-por.ne-compass.com/DeveloperPortal/',
    note: 'New England 511 requires API key registration. Most endpoints are not publicly accessible. Consider contacting them for public safety app access.',
  };
}









