/**
 * Service for fetching Vermont road condition data
 * Currently supports:
 * - National Weather Service API (free)
 * - Xweather Road Weather API (requires API key)
 * - TomTom Traffic API (real-time traffic incidents)
 * - New England 511 (attempts public access, most data requires API key)
 * - VTrans RWIS (Road Weather Information System) - Public XML feed (no API key needed!)
 * - VTrans Lane Closures (Construction, maintenance, road closures) - Public XML feed (no API key needed!)
 * - VTrans Traffic Incidents (Accidents, hazards, closures) - Public XML feed (no API key needed!)
 * Can be extended to support additional sources
 */

import { fetchXweatherRoadWeather, XweatherRoadCondition } from './xweatherService';
import { fetchTomTomTrafficIncidents, convertTomTomIncidentsToRoadConditions } from './tomtomService';
import { fetchNewEngland511PublicRoadConditions } from './newEngland511PublicService';
import {
  fetchVTransRWISRoadConditions,
  formatVermontRWISSummaryForAI,
} from './vtransRWISService';
import { fetchVTransLaneClosureRoadConditions } from './vtransLaneClosureService';
import { fetchVTransIncidentRoadConditions } from './vtransIncidentsService';

export interface RoadCondition {
  route: string;
  condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
  temperature?: number;
  pavementTemperature?: number;
  surfaceFriction?: number; // 0–1 (VTrans RWIS μ)
  windSpeed?: number; // mph
  locationDescription?: string;
  stationName?: string;
  warning?: string;
  source: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  severity?: 'MINOR' | 'MODERATE' | 'MAJOR';
  delay?: number; // seconds
}

/**
 * Fetch road weather data from National Weather Service
 * This provides road weather forecasts and warnings
 */
export async function fetchNWSRoadWeather(location: string = 'Vermont'): Promise<RoadCondition[]> {
  try {
    // NWS API endpoint for alerts
    // Note: You'll need to get the zone code for Vermont
    // Vermont zones: VTZ001-VTZ027 (counties)
    const alertsUrl = 'https://api.weather.gov/alerts/active?zone=VTZ001,VTZ002,VTZ003,VTZ004,VTZ005,VTZ006,VTZ007,VTZ008,VTZ009,VTZ010,VTZ011,VTZ012,VTZ013,VTZ014,VTZ015,VTZ016,VTZ017,VTZ018,VTZ019,VTZ020,VTZ021,VTZ022,VTZ023,VTZ024,VTZ025,VTZ026,VTZ027';
    
    const response = await fetch(alertsUrl, {
      headers: {
        'User-Agent': 'WEATHERbird/1.0 (weather safety app)',
      },
    });

    if (!response.ok) {
      throw new Error(`NWS API error: ${response.statusText}`);
    }

    const data = await response.json();
    const roadConditions: RoadCondition[] = [];

    // Parse alerts for road-related warnings
    if (data.features && Array.isArray(data.features)) {
      data.features.forEach((alert: any) => {
        const properties = alert.properties;
        const eventType = properties.eventType?.toLowerCase() || '';
        
        // Filter for road-relevant alerts
        if (
          eventType.includes('winter') ||
          eventType.includes('ice') ||
          eventType.includes('snow') ||
          eventType.includes('flood') ||
          eventType.includes('wind') ||
          eventType.includes('freeze')
        ) {
          roadConditions.push({
            route: properties.areaDesc || 'Vermont',
            condition: determineConditionFromAlert(eventType),
            warning: properties.headline || properties.description,
            source: 'NWS',
            timestamp: properties.sent || new Date().toISOString(),
          });
        }
      });
    }

    return roadConditions;
  } catch (error) {
    console.error('Error fetching NWS road weather:', error);
    return [];
  }
}

/**
 * Determine road condition from NWS alert type
 */
function determineConditionFromAlert(eventType: string): RoadCondition['condition'] {
  const lower = eventType.toLowerCase();
  
  if (lower.includes('ice') || lower.includes('freeze')) {
    return 'ice';
  }
  if (lower.includes('snow')) {
    return 'snow-covered';
  }
  if (lower.includes('flood')) {
    return 'closed';
  }
  if (lower.includes('wind') || lower.includes('storm')) {
    return 'wet';
  }
  
  return 'unknown';
}

/**
 * Get road condition summary for AI context
 * All conditions have been validated and fact-checked before reaching this function
 */
export function formatRoadConditionsForAI(conditions: RoadCondition[]): string {
  if (conditions.length === 0) {
    return 'No active road warnings at this time. All data sources have been checked and validated.';
  }

  // Group by source for better context
  const bySource = new Map<string, RoadCondition[]>();
  conditions.forEach(condition => {
    const source = condition.source;
    if (!bySource.has(source)) {
      bySource.set(source, []);
    }
    bySource.get(source)!.push(condition);
  });

  let summary = 'ACTIVE VERMONT ROAD CONDITIONS (Validated):\n';
  summary += `Total validated conditions: ${conditions.length} from ${bySource.size} sources\n\n`;

  const rwis = bySource.get('VTrans RWIS') || [];
  const apiSourcesPresent = [
    'NWS',
    'TomTom',
    'Xweather',
    'New England 511',
  ].filter((s) => (bySource.get(s)?.length || 0) > 0);
  const otherVTrans =
    (bySource.get('VTrans Lane Closures')?.length || 0) +
    (bySource.get('VTrans Incidents')?.length || 0);

  if (rwis.length > 0) {
    summary += formatVermontRWISSummaryForAI(rwis) + '\n';
    summary +=
      'INTEGRATION RULE: Lead with VTrans RWIS pavement sensors for local roads, AND weave in weather APIs (NWS/Weatherbit/Xweather), TomTom traffic, and VTrans closures/incidents when those sections have data. Do not answer from RWIS alone.\n\n';
  } else {
    summary +=
      'VTrans RWIS STATUS: No live pavement-sensor readings in this payload.\n';
    summary +=
      'API FALLBACK MODE: Use NWS alerts, forecast APIs (Weatherbit/Xweather/etc.), TomTom traffic, New England 511, and any VTrans lane closures/incidents below as the primary road/travel picture. Answer with those numbers — do NOT say road data is unavailable if API sections have content.\n';
    if (apiSourcesPresent.length > 0 || otherVTrans > 0) {
      summary += `Available non-RWIS layers: ${[
        ...apiSourcesPresent,
        otherVTrans > 0 ? 'VTrans closures/incidents' : null,
      ]
        .filter(Boolean)
        .join(', ')}.\n\n`;
    } else {
      summary += '\n';
    }
  }
  
  // Prioritize official sources first
  const sourcePriority = ['VTrans RWIS', 'VTrans Lane Closures', 'VTrans Incidents', 'NWS', 'TomTom', 'Xweather', 'New England 511'];
  
  sourcePriority.forEach(sourceName => {
    const sourceConditions = bySource.get(sourceName);
    if (sourceConditions && sourceConditions.length > 0) {
      summary += `\n[${sourceName} - ${sourceConditions.length} condition(s)]:\n`;
      // Cap RWIS detail lines so Maple prompt stays within context, but keep richest stations first
      const ordered =
        sourceName === 'VTrans RWIS'
          ? [...sourceConditions].sort((a, b) => {
              const sev = { MAJOR: 0, MODERATE: 1, MINOR: 2 } as const;
              const sa = a.severity ? sev[a.severity] : 3;
              const sb = b.severity ? sev[b.severity] : 3;
              if (sa !== sb) return sa - sb;
              return (a.surfaceFriction ?? 1) - (b.surfaceFriction ?? 1);
            })
          : sourceConditions;
      const limit = sourceName === 'VTrans RWIS' ? 40 : ordered.length;
      ordered.slice(0, limit).forEach((condition, index) => {
        const label = condition.stationName
          ? `${condition.route} (${condition.stationName})`
          : condition.route;
        summary += `${index + 1}. ${label}: ${condition.condition.toUpperCase()}`;
        if (condition.locationDescription) {
          summary += ` @ ${condition.locationDescription}`;
        } else if (condition.latitude && condition.longitude) {
          summary += ` (${condition.latitude.toFixed(4)}, ${condition.longitude.toFixed(4)})`;
        }
        if (condition.temperature !== undefined) {
          summary += ` | air ${condition.temperature.toFixed(0)}°F`;
        }
        if (condition.pavementTemperature !== undefined) {
          summary += ` | pavement ${condition.pavementTemperature.toFixed(0)}°F`;
        }
        if (condition.surfaceFriction !== undefined) {
          summary += ` | μ=${condition.surfaceFriction.toFixed(2)}`;
        }
        if (condition.windSpeed !== undefined && condition.windSpeed >= 20) {
          summary += ` | wind ${condition.windSpeed} mph`;
        }
        if (condition.warning) {
          const maxLen = sourceName === 'VTrans RWIS' ? 220 : 150;
          const warning =
            condition.warning.length > maxLen
              ? condition.warning.substring(0, maxLen) + '...'
              : condition.warning;
          summary += ` — ${warning}`;
        }
        if (condition.severity) {
          summary += ` [${condition.severity}]`;
        }
        summary += ` (Updated ${new Date(condition.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} ET)\n`;
      });
      if (ordered.length > limit) {
        summary += `... plus ${ordered.length - limit} more VTrans RWIS stations (see statewide mix above).\n`;
      }
    }
  });

  // Include any other sources not in priority list
  bySource.forEach((sourceConditions, sourceName) => {
    if (!sourcePriority.includes(sourceName)) {
      summary += `\n[${sourceName} - ${sourceConditions.length} condition(s)]:\n`;
      sourceConditions.forEach((condition, index) => {
        summary += `${index + 1}. ${condition.route}: ${condition.condition.toUpperCase()}`;
        if (condition.warning) {
          summary += ` - ${condition.warning.substring(0, 100)}...`;
        }
        summary += '\n';
      });
    }
  });

  if (rwis.length > 0) {
    summary +=
      '\nNote: VTrans RWIS = pavement ground truth; weather/traffic APIs = forecast, alerts, and incidents. Use both.';
  } else {
    summary +=
      '\nNote: No VTrans RWIS here — weather and traffic APIs are the authoritative fallback for this answer.';
  }

  return summary;
}

/**
 * Fetch road weather data from Xweather Road Weather API
 * Provides road condition forecasts with GREEN/YELLOW/RED status
 * Documentation: https://www.xweather.com/docs/weather-api/endpoints/roadweather
 */
export async function fetchXweatherRoadConditions(location: string = 'Vermont'): Promise<RoadCondition[]> {
  try {
    const xweatherData = await fetchXweatherRoadWeather(location);
    const roadConditions: RoadCondition[] = [];

    xweatherData.forEach((item: XweatherRoadCondition) => {
      // Get the most recent forecast period (first one is usually current)
      const currentPeriod = item.periods[0];
      if (!currentPeriod) return;

      // Convert Xweather summary to our condition type
      let condition: RoadCondition['condition'] = 'unknown';
      if (currentPeriod.summary === 'GREEN') {
        condition = 'clear';
      } else if (currentPeriod.summary === 'YELLOW') {
        condition = 'wet';
      } else if (currentPeriod.summary === 'RED') {
        // RED could mean snow, ice, or other adverse conditions
        // We'll need to infer from context or use 'unknown' for now
        condition = 'unknown';
      }

      const routeName = item.road?.name || item.place.name || location;
      
      roadConditions.push({
        route: routeName,
        condition: condition,
        warning: currentPeriod.summary === 'RED' 
          ? 'Adverse road conditions expected - use caution'
          : currentPeriod.summary === 'YELLOW'
          ? 'Potential for wet roads - extend caution'
          : undefined,
        source: 'Xweather',
        timestamp: currentPeriod.dateTimeISO || new Date().toISOString(),
      });
    });

    return roadConditions;
  } catch (error) {
    console.error('Error fetching Xweather road conditions:', error);
    // Don't throw - return empty array so other sources can still work
    return [];
  }
}

/**
 * Fetch road conditions from all available sources
 * Combines NWS alerts and Xweather road weather data
 */
export async function fetchAllRoadConditions(location: string = 'Vermont'): Promise<RoadCondition[]> {
  const allConditions: RoadCondition[] = [];

  // Fetch from NWS (free, always try)
  try {
    const nwsConditions = await fetchNWSRoadWeather(location);
    allConditions.push(...nwsConditions);
  } catch (error) {
    console.error('Error fetching NWS road conditions:', error);
  }

  // Fetch from Xweather (if API keys are set)
  try {
    const xweatherConditions = await fetchXweatherRoadConditions(location);
    allConditions.push(...xweatherConditions);
  } catch (error) {
    // Silently fail if Xweather isn't configured
    console.log('Xweather road conditions not available (may need API keys)');
  }

  // Fetch from TomTom Traffic API (real-time traffic incidents)
  try {
    const tomtomIncidents = await fetchTomTomTrafficIncidents();
    const tomtomConditions = convertTomTomIncidentsToRoadConditions(tomtomIncidents);
    allConditions.push(...tomtomConditions);
    if (tomtomConditions.length > 0) {
      console.log(`[Road Data] TomTom: Fetched ${tomtomConditions.length} real-time traffic incidents`);
    }
  } catch (error) {
    // Log error but continue - TomTom is optional
    console.warn('TomTom traffic incidents not available:', error instanceof Error ? error.message : error);
  }

  // Fetch New England 511 data via Developer Portal
  // Note: Incidents are handled via VTrans Incidents service (which uses the Developer Portal)
  // This attempts to get any additional public JSON data if available
  try {
    const ne511Conditions = await fetchNewEngland511PublicRoadConditions(location);
    if (ne511Conditions.length > 0) {
      allConditions.push(...ne511Conditions);
      console.log(`[Road Data] New England 511: Fetched ${ne511Conditions.length} additional public incidents`);
    }
  } catch (error) {
    // Note: Most 511 data comes through VTrans Incidents service via Developer Portal
    // This is just for any additional JSON endpoints - silent fail is fine
  }

  // Fetch VTrans RWIS data (public XML feed - no API key needed!)
  try {
    const vtransConditions = await fetchVTransRWISRoadConditions();
    if (vtransConditions.length > 0) {
      allConditions.push(...vtransConditions);
      console.log(`[Road Data] VTrans RWIS: Fetched ${vtransConditions.length} sensor station readings`);
    }
  } catch (error) {
    console.warn('VTrans RWIS data not available:', error);
  }

  // Fetch VTrans Lane Closure data from New England Compass Developer Portal
  // Source: https://nec-por.ne-compass.com/DeveloperPortal/
  try {
    const closureConditions = await fetchVTransLaneClosureRoadConditions();
    if (closureConditions.length > 0) {
      allConditions.push(...closureConditions);
      console.log(`[Road Data] VTrans Lane Closures: Fetched ${closureConditions.length} closure/construction alerts`);
    }
  } catch (error) {
    console.warn('VTrans Lane Closure data not available:', error);
  }

  // Fetch VTrans Traffic Incidents data from New England Compass Developer Portal
  // Source: https://nec-por.ne-compass.com/DeveloperPortal/
  try {
    const incidentConditions = await fetchVTransIncidentRoadConditions();
    if (incidentConditions.length > 0) {
      allConditions.push(...incidentConditions);
      console.log(`[Road Data] VTrans Incidents: Fetched ${incidentConditions.length} traffic incidents`);
    }
  } catch (error) {
    console.warn('VTrans Incident data not available:', error);
  }

  // Validate and filter conditions for accuracy (CRITICAL for government-grade reliability)
  const { validateAndFilterRoadConditions, crossReferenceRoadConditions } = await import('./dataValidationService');
  
  const validation = validateAndFilterRoadConditions(allConditions);
  
  if (validation.invalidCount > 0) {
    console.warn(`[Road Data] Removed ${validation.invalidCount} invalid conditions for accuracy`);
  }
  if (validation.warningCount > 0) {
    console.log(`[Road Data] ${validation.warningCount} conditions have warnings - check timestamps/coordinates`);
  }

  // Cross-reference for fact-checking
  const crossRef = crossReferenceRoadConditions(validation.validConditions);
  if (crossRef.conflicts.length > 0) {
    console.warn(`[Road Data] Found ${crossRef.conflicts.length} conflicts between sources - prioritizing official sources`);
  }

  // Remove duplicates based on route and condition (after validation)
  const uniqueConditions = validation.validConditions.filter((condition, index, self) =>
    index === self.findIndex(c => 
      c.route === condition.route && 
      c.condition === condition.condition &&
      Math.abs((c.latitude || 0) - (condition.latitude || 0)) < 0.01 &&
      Math.abs((c.longitude || 0) - (condition.longitude || 0)) < 0.01
    )
  );

  console.log(`[Road Data] Final validated conditions: ${uniqueConditions.length} (removed ${allConditions.length - uniqueConditions.length} invalid/duplicates)`);

  return uniqueConditions;
}

/**
 * Placeholder for future VTrans integration
 * TODO: Implement when VTrans API access is obtained
 */
export async function fetchVTransRoadConditions(): Promise<RoadCondition[]> {
  // TODO: Implement VTrans API integration
  // This would fetch real-time road conditions from Vermont Agency of Transportation
  return [];
}




