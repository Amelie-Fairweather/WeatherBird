/**
 * Service for fetching data from New England 511 API
 * Developer Portal: https://nec-por.ne-compass.com/DeveloperPortal/
 * 
 * Available datasets:
 * - CCTV Snapshots (traffic cameras)
 * - CCTV Camera Status
 * - DMS Messages (Dynamic Message Signs)
 * - Environmental Sensor Data (Road Weather Information Stations)
 * - Incidents
 * - Lane Closures
 * - Traffic Conditions
 * - Travel Times
 */

interface NewEngland511Config {
  apiKey?: string;
  baseUrl?: string;
}

// Default base URL for New England 511 API
const DEFAULT_BASE_URL = 'https://nec-por.ne-compass.com/api';

/**
 * Fetch incidents from New England 511
 * @param region - 'Vermont' | 'New Hampshire' | 'Maine' | 'All'
 */
export async function fetchIncidents(region: string = 'Vermont'): Promise<any[]> {
  try {
    // Note: You'll need to register at the Developer Portal to get an API key
    const apiKey = process.env.NEW_ENGLAND_511_API_KEY;
    const baseUrl = process.env.NEW_ENGLAND_511_BASE_URL || DEFAULT_BASE_URL;

    if (!apiKey) {
      console.warn('NEW_ENGLAND_511_API_KEY not set. Some features may be limited.');
      // Return empty array if no API key - you can still use the website data
      return [];
    }

    const url = `${baseUrl}/incidents`;
    const params = new URLSearchParams({
      region: region,
      // Add other parameters as needed
    });

    const response = await fetch(`${url}?${params}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`New England 511 API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.incidents || [];
  } catch (error) {
    console.error('Error fetching incidents from New England 511:', error);
    return [];
  }
}

/**
 * Fetch lane closures from New England 511
 */
export async function fetchLaneClosures(region: string = 'Vermont'): Promise<any[]> {
  try {
    const apiKey = process.env.NEW_ENGLAND_511_API_KEY;
    const baseUrl = process.env.NEW_ENGLAND_511_BASE_URL || DEFAULT_BASE_URL;

    if (!apiKey) {
      return [];
    }

    const url = `${baseUrl}/lane-closures`;
    const params = new URLSearchParams({
      region: region,
    });

    const response = await fetch(`${url}?${params}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`New England 511 API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.closures || [];
  } catch (error) {
    console.error('Error fetching lane closures:', error);
    return [];
  }
}

/**
 * Fetch environmental sensor data (road weather information)
 * This is particularly useful for road conditions
 */
export async function fetchEnvironmentalSensorData(region: string = 'Vermont'): Promise<any[]> {
  try {
    const apiKey = process.env.NEW_ENGLAND_511_API_KEY;
    const baseUrl = process.env.NEW_ENGLAND_511_BASE_URL || DEFAULT_BASE_URL;

    if (!apiKey) {
      return [];
    }

    const url = `${baseUrl}/environmental-sensors`;
    const params = new URLSearchParams({
      region: region,
    });

    const response = await fetch(`${url}?${params}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`New England 511 API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.sensors || [];
  } catch (error) {
    console.error('Error fetching environmental sensor data:', error);
    return [];
  }
}

/**
 * Fetch traffic conditions
 */
export async function fetchTrafficConditions(region: string = 'Vermont'): Promise<any[]> {
  try {
    const apiKey = process.env.NEW_ENGLAND_511_API_KEY;
    const baseUrl = process.env.NEW_ENGLAND_511_BASE_URL || DEFAULT_BASE_URL;

    if (!apiKey) {
      return [];
    }

    const url = `${baseUrl}/traffic-conditions`;
    const params = new URLSearchParams({
      region: region,
    });

    const response = await fetch(`${url}?${params}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`New England 511 API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.conditions || [];
  } catch (error) {
    console.error('Error fetching traffic conditions:', error);
    return [];
  }
}

/**
 * Format New England 511 data for AI context
 */
export function formatNewEngland511DataForAI(data: {
  incidents?: any[];
  closures?: any[];
  sensors?: any[];
  conditions?: any[];
}): string {
  let context = '';

  if (data.incidents && data.incidents.length > 0) {
    context += '\n\nCurrent Traffic Incidents:\n';
    data.incidents.slice(0, 5).forEach((incident, i) => {
      context += `${i + 1}. ${incident.description || 'Incident'} - ${incident.location || 'Location unknown'}\n`;
    });
  }

  if (data.closures && data.closures.length > 0) {
    context += '\n\nLane/Road Closures:\n';
    data.closures.slice(0, 5).forEach((closure, i) => {
      context += `${i + 1}. ${closure.description || 'Closure'} - ${closure.location || 'Location unknown'}\n`;
    });
  }

  if (data.sensors && data.sensors.length > 0) {
    context += '\n\nRoad Weather Conditions:\n';
    data.sensors.slice(0, 5).forEach((sensor, i) => {
      const temp = sensor.temperature;
      const condition = sensor.surface_condition || sensor.condition;
      context += `${i + 1}. ${sensor.location || 'Location'}: ${temp}°F, ${condition}\n`;
    });
  }

  return context;
}

