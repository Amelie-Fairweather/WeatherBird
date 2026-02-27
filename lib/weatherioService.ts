/**
 * Weather.io API Service
 * Provides road safety and flooding data
 * API Documentation: https://weather.io/docs
 */

export interface FloodWarning {
  id: string;
  location: string;
  severity: 'minor' | 'moderate' | 'major' | 'record';
  status: 'forecast' | 'observed' | 'past';
  waterLevel?: number;
  floodStage?: number;
  currentStage?: number;
  forecastTime?: string;
  description: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
  timestamp: string;
}

export interface RoadSafetyAlert {
  id: string;
  location: string;
  type: 'flood' | 'ice' | 'snow' | 'debris' | 'wind' | 'visibility';
  severity: 'low' | 'moderate' | 'high' | 'extreme';
  status: 'active' | 'warning' | 'advisory';
  description: string;
  affectedRoads?: string[];
  coordinates?: {
    lat: number;
    lon: number;
  };
  validUntil?: string;
  timestamp: string;
}

/**
 * Fetch flood warnings from Weather.io API
 */
export async function fetchFloodWarnings(location: string = 'Vermont'): Promise<FloodWarning[]> {
  const apiKey = process.env.WEATHERIO_API_KEY;
  
  if (!apiKey) {
    console.warn('WEATHERIO_API_KEY not set - skipping weather.io flood warnings');
    return [];
  }

  try {
    // Weather.io API endpoint for flood warnings
    // Try multiple common API endpoint patterns
    const endpoints = [
      `https://api.weather.io/v1/alerts/flood?location=${encodeURIComponent(location)}&key=${apiKey}`,
      `https://api.weather.io/v1/flood?q=${encodeURIComponent(location)}&apikey=${apiKey}`,
      `https://api.weather.io/v1/flood?location=${encodeURIComponent(location)}&api_key=${apiKey}`,
      `https://weather.io/api/v1/flood?q=${encodeURIComponent(location)}&key=${apiKey}`,
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const warnings = parseFloodWarnings(data, location);
          if (warnings.length > 0 || data) {
            return warnings;
          }
        }
      } catch (err) {
        // Try next endpoint
        continue;
      }
    }

    console.warn('Weather.io flood API: All endpoint patterns failed');
    return [];
  } catch (error) {
    console.error('Error fetching flood warnings from weather.io:', error);
    return [];
  }
}

/**
 * Parse flood warnings from Weather.io API response
 */
function parseFloodWarnings(data: any, location: string): FloodWarning[] {
  const warnings: FloodWarning[] = [];

  // Handle different possible response structures
  if (data.features && Array.isArray(data.features)) {
    // GeoJSON format
    data.features.forEach((feature: any) => {
      const props = feature.properties || {};
      warnings.push({
        id: props.id || feature.id || `flood-${Date.now()}`,
        location: props.areaDesc || props.location || location,
        severity: mapSeverity(props.severity || props.event),
        status: props.status || 'forecast',
        waterLevel: props.waterLevel,
        floodStage: props.floodStage,
        currentStage: props.currentStage,
        forecastTime: props.forecastTime || props.validUntil,
        description: props.description || props.headline || 'Flood warning in effect',
        coordinates: feature.geometry?.coordinates 
          ? { lon: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] }
          : undefined,
        timestamp: props.sent || props.updated || new Date().toISOString(),
      });
    });
  } else if (data.alerts && Array.isArray(data.alerts)) {
    // Direct alerts array
    data.alerts.forEach((alert: any) => {
      warnings.push({
        id: alert.id || `flood-${Date.now()}`,
        location: alert.location || location,
        severity: mapSeverity(alert.severity || alert.level),
        status: alert.status || 'forecast',
        waterLevel: alert.waterLevel,
        floodStage: alert.floodStage,
        currentStage: alert.currentStage,
        forecastTime: alert.forecastTime,
        description: alert.description || alert.message || 'Flood warning in effect',
        coordinates: alert.coordinates,
        timestamp: alert.timestamp || new Date().toISOString(),
      });
    });
  } else if (Array.isArray(data)) {
    // Direct array
    data.forEach((item: any) => {
      warnings.push({
        id: item.id || `flood-${Date.now()}`,
        location: item.location || location,
        severity: mapSeverity(item.severity),
        status: item.status || 'forecast',
        waterLevel: item.waterLevel,
        floodStage: item.floodStage,
        currentStage: item.currentStage,
        forecastTime: item.forecastTime,
        description: item.description || 'Flood warning in effect',
        coordinates: item.coordinates,
        timestamp: item.timestamp || new Date().toISOString(),
      });
    });
  }

  return warnings;
}

/**
 * Fetch road safety alerts from Weather.io API
 */
export async function fetchRoadSafetyAlerts(location: string = 'Vermont'): Promise<RoadSafetyAlert[]> {
  const apiKey = process.env.WEATHERIO_API_KEY;
  
  if (!apiKey) {
    console.warn('WEATHERIO_API_KEY not set - skipping weather.io road safety alerts');
    return [];
  }

  try {
    // Weather.io API endpoint for road safety
    // Try multiple common API endpoint patterns
    const endpoints = [
      `https://api.weather.io/v1/alerts/roadsafety?location=${encodeURIComponent(location)}&key=${apiKey}`,
      `https://api.weather.io/v1/roadsafety?q=${encodeURIComponent(location)}&apikey=${apiKey}`,
      `https://api.weather.io/v1/roadsafety?location=${encodeURIComponent(location)}&api_key=${apiKey}`,
      `https://weather.io/api/v1/roadsafety?q=${encodeURIComponent(location)}&key=${apiKey}`,
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const alerts = parseRoadSafetyAlerts(data, location);
          if (alerts.length > 0 || data) {
            return alerts;
          }
        }
      } catch (err) {
        // Try next endpoint
        continue;
      }
    }

    console.warn('Weather.io road safety API: All endpoint patterns failed');
    return [];
  } catch (error) {
    console.error('Error fetching road safety alerts from weather.io:', error);
    return [];
  }
}

/**
 * Parse road safety alerts from Weather.io API response
 */
function parseRoadSafetyAlerts(data: any, location: string): RoadSafetyAlert[] {
  const alerts: RoadSafetyAlert[] = [];

  // Handle different possible response structures
  if (data.features && Array.isArray(data.features)) {
    data.features.forEach((feature: any) => {
      const props = feature.properties || {};
      alerts.push({
        id: props.id || feature.id || `road-${Date.now()}`,
        location: props.areaDesc || props.location || location,
        type: mapRoadType(props.eventType || props.type),
        severity: mapSeverityToRoadSafety(props.severity || props.event),
        status: props.status === 'Actual' ? 'active' : props.status?.toLowerCase() || 'active',
        description: props.description || props.headline || 'Road safety alert',
        affectedRoads: props.affectedRoads || props.roads,
        coordinates: feature.geometry?.coordinates 
          ? { lon: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] }
          : undefined,
        validUntil: props.ends || props.validUntil,
        timestamp: props.sent || props.updated || new Date().toISOString(),
      });
    });
  } else if (data.alerts && Array.isArray(data.alerts)) {
    data.alerts.forEach((alert: any) => {
      alerts.push({
        id: alert.id || `road-${Date.now()}`,
        location: alert.location || location,
        type: mapRoadType(alert.type),
        severity: mapSeverityToRoadSafety(alert.severity),
        status: alert.status || 'active',
        description: alert.description || alert.message || 'Road safety alert',
        affectedRoads: alert.affectedRoads || alert.roads,
        coordinates: alert.coordinates,
        validUntil: alert.validUntil,
        timestamp: alert.timestamp || new Date().toISOString(),
      });
    });
  } else if (Array.isArray(data)) {
    data.forEach((item: any) => {
      alerts.push({
        id: item.id || `road-${Date.now()}`,
        location: item.location || location,
        type: mapRoadType(item.type),
        severity: mapSeverityToRoadSafety(item.severity),
        status: item.status || 'active',
        description: item.description || 'Road safety alert',
        affectedRoads: item.affectedRoads,
        coordinates: item.coordinates,
        validUntil: item.validUntil,
        timestamp: item.timestamp || new Date().toISOString(),
      });
    });
  }

  return alerts;
}

/**
 * Map severity string to flood severity
 */
function mapSeverity(severity: string | undefined): FloodWarning['severity'] {
  if (!severity) return 'minor';
  const lower = severity.toLowerCase();
  if (lower.includes('record') || lower.includes('extreme')) return 'record';
  if (lower.includes('major')) return 'major';
  if (lower.includes('moderate')) return 'moderate';
  return 'minor';
}

/**
 * Map severity string to road safety severity
 */
function mapSeverityToRoadSafety(severity: string | undefined): RoadSafetyAlert['severity'] {
  if (!severity) return 'moderate';
  const lower = severity.toLowerCase();
  if (lower.includes('extreme') || lower.includes('severe')) return 'extreme';
  if (lower.includes('high') || lower.includes('major')) return 'high';
  if (lower.includes('low') || lower.includes('minor')) return 'low';
  return 'moderate';
}

/**
 * Map event type to road safety type
 */
function mapRoadType(type: string | undefined): RoadSafetyAlert['type'] {
  if (!type) return 'flood';
  const lower = type.toLowerCase();
  if (lower.includes('ice') || lower.includes('freez')) return 'ice';
  if (lower.includes('snow')) return 'snow';
  if (lower.includes('debris') || lower.includes('rock')) return 'debris';
  if (lower.includes('wind')) return 'wind';
  if (lower.includes('fog') || lower.includes('visibility')) return 'visibility';
  return 'flood';
}









