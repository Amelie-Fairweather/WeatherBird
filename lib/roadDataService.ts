/**
 * Service for fetching Vermont road condition data
 * Currently supports:
 * - National Weather Service API (free)
 * - Xweather Road Weather API (requires API key)
 * Can be extended to support VTrans, 511, etc.
 */

import { fetchXweatherRoadWeather, XweatherRoadCondition } from './xweatherService';

interface RoadCondition {
  route: string;
  condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
  temperature?: number;
  warning?: string;
  source: string;
  timestamp: string;
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
 */
export function formatRoadConditionsForAI(conditions: RoadCondition[]): string {
  if (conditions.length === 0) {
    return 'No active road warnings at this time.';
  }

  let summary = 'Active Road Conditions and Warnings:\n';
  conditions.forEach((condition, index) => {
    summary += `${index + 1}. ${condition.route}: ${condition.condition.toUpperCase()}`;
    if (condition.warning) {
      summary += ` - ${condition.warning.substring(0, 100)}...`;
    }
    summary += '\n';
  });

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

  return allConditions;
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




