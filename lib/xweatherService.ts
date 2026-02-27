/**
 * Xweather (AerisWeather) API Service
 * Documentation: https://www.xweather.com/docs/weather-api
 * Road Weather API: https://www.xweather.com/docs/weather-api/endpoints/roadweather
 * Requires API key (Client ID and Secret)
 */

interface WeatherData {
  temperature: number;
  humidity: number;
  pressure: number;
  description: string;
  windSpeed: number;
  location: string;
  timestamp: string;
}

export interface XweatherRoadCondition {
  id: string;
  road: {
    type: string;
    name: string | null;
  } | null;
  location: {
    lat: number;
    long: number;
  };
  place: {
    name: string;
    state: string;
    country: string;
  };
  periods: Array<{
    timestamp: number;
    dateTimeISO: string;
    summary: 'GREEN' | 'YELLOW' | 'RED';
    summaryIndex: 0 | 1 | 2; // 0=GREEN, 1=YELLOW, 2=RED
  }>;
}

export interface XweatherAlert {
  id: string;
  name: string;
  type: string;
  severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme';
  title: string;
  body: string;
  expiresISO?: string;
  issueTimeISO?: string;
  significance?: string;
  category?: string;
  zones?: Array<{
    state: string;
    zone: string;
    name: string;
  }>;
}

/**
 * Fetch road weather data from Xweather Road Weather API
 * Documentation: https://www.xweather.com/docs/weather-api/endpoints/roadweather
 * 
 * @param location - City name, lat/long, or postal code
 * @returns Road weather forecast data
 */
export async function fetchXweatherRoadWeather(location: string): Promise<XweatherRoadCondition[]> {
  const clientId = process.env.XWEATHER_CLIENT_ID;
  const clientSecret = process.env.XWEATHER_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    // Return empty array instead of throwing - allows other sources to work
    // This is expected behavior when Xweather credentials are not configured
    console.log('[Xweather] Credentials not configured - skipping Xweather road conditions');
    return [];
  }

  // Xweather Road Weather API endpoint
  // Format: /roadweather/:auto?filter=&client_id=&client_secret=
  // OR /roadweather/{lat},{lon}?filter=&client_id=&client_secret=
  // OR /roadweather/{city},{state}?filter=&client_id=&client_secret=
  // 
  // Best practice: Use coordinates when available (most accurate), then city names, then :auto
  let locationParam = ':auto'; // Default to auto-detection
  
  // Check if location is coordinates (format: "44.4759,-73.2121")
  if (location.match(/^-?\d+\.?\d*,-?\d+\.?\d*$/)) {
    // Already coordinates - use directly (most accurate)
    locationParam = location;
  } else if (location && location !== 'Vermont' && location.toLowerCase() !== 'vermont') {
    // For specific locations, try using the location as-is (city names work better than :auto)
    // Xweather supports city names like "Burlington,VT" or just "Burlington"
    // If it fails, the API will return an error and we'll get empty results (handled gracefully)
    locationParam = encodeURIComponent(location);
  }
  // Otherwise use :auto for "Vermont" or generic locations
  
  const url = `https://data.api.xweather.com/roadweather/${locationParam}?filter=&client_id=${clientId}&client_secret=${clientSecret}`;
  
  console.log(`[Xweather] Fetching road weather for: ${location}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    console.error(`[Xweather] API error ${response.status} ${response.statusText}: ${errorText.substring(0, 200)}`);
    // Return empty array on error - allow other sources to continue working
    return [];
  }

  const data = await response.json();
  
  // Xweather API returns: {success: boolean, error?: object, response: array}
  if (data.success && data.response && Array.isArray(data.response)) {
    console.log(`[Xweather] Successfully fetched ${data.response.length} road weather forecasts`);
    return data.response;
  }
  
  // If response is empty or error, log and return empty array
  if (data.error) {
    console.log(`[Xweather] API response: ${data.error.description || data.error.code || 'No data available'}`);
  }
  
  // Handle legacy format (direct array or single object) for backward compatibility
  if (Array.isArray(data)) {
    return data;
  }
  
  if (data && data.id) {
    return [data];
  }
  
  return [];
}

/**
 * Fetch current weather conditions from Xweather Conditions API
 * Documentation: https://www.xweather.com/docs/weather-api/endpoints/conditions
 * 
 * @param location - City name, lat/long, postal code, or ':auto' for automatic detection
 * @returns Current weather data
 */
export async function fetchXweatherWeather(location: string): Promise<WeatherData> {
  const clientId = process.env.XWEATHER_CLIENT_ID;
  const clientSecret = process.env.XWEATHER_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    // Throw error - unifiedWeatherService will catch and try next source
    throw new Error('XWEATHER_CLIENT_ID and XWEATHER_CLIENT_SECRET must be set in environment variables');
  }

  // Xweather Conditions API endpoint
  // Format: /conditions/:auto?format=json&plimit=1&filter=1min&client_id=&client_secret=
  // OR /conditions/{lat},{lon}?format=json&plimit=1&filter=1min&client_id=&client_secret=
  // OR /conditions/{city},{state}?format=json&plimit=1&filter=1min&client_id=&client_secret=
  //
  // Best practice: Use coordinates when available (most accurate), then city names, then :auto
  let locationParam = ':auto'; // Default to auto-detection
  
  // Check if location is coordinates (format: "44.4759,-73.2121")
  if (location.match(/^-?\d+\.?\d*,-?\d+\.?\d*$/)) {
    // Already coordinates - use directly (most accurate)
    locationParam = location;
  } else if (location && location !== 'Vermont' && location.toLowerCase() !== 'vermont') {
    // For specific locations, use the location as-is (city names work for conditions API)
    locationParam = encodeURIComponent(location);
  }
  // Otherwise use :auto for "Vermont" or generic locations
  
  const url = `https://data.api.xweather.com/conditions/${locationParam}?format=json&plimit=1&filter=1min&client_id=${clientId}&client_secret=${clientSecret}`;
  
  console.log(`[Xweather] Fetching current weather conditions for: ${location}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    console.error(`[Xweather] API error ${response.status} ${response.statusText}: ${errorText.substring(0, 200)}`);
    throw new Error(`Xweather API error: ${response.statusText} - ${errorText.substring(0, 100)}`);
  }

  const data = await response.json();
  
  // Xweather API returns: {success: boolean, error?: object, response: array}
  if (!data.success || !data.response || !Array.isArray(data.response) || data.response.length === 0) {
    const errorMsg = data.error?.description || data.error?.code || 'No weather data available';
    console.error(`[Xweather] API response error: ${errorMsg}`);
    throw new Error(`Xweather API error: ${errorMsg}`);
  }

  const obs = data.response[0]?.ob;
  const place = data.response[0]?.place;

  if (!obs) {
    throw new Error('Xweather API error: No observation data in response');
  }

  // Convert temperature from Fahrenheit to Celsius (if needed)
  // Xweather typically returns tempF (Fahrenheit) or tempC (Celsius)
  let tempC = 0;
  if (obs.tempC !== undefined && obs.tempC !== null) {
    tempC = obs.tempC;
  } else if (obs.tempF !== undefined && obs.tempF !== null) {
    tempC = (obs.tempF - 32) * 5/9;
  }

  // Convert wind speed to m/s
  let windSpeed = 0;
  if (obs.windSpeedKPH !== undefined && obs.windSpeedKPH !== null) {
    windSpeed = obs.windSpeedKPH / 3.6; // km/h to m/s
  } else if (obs.windSpeedMPH !== undefined && obs.windSpeedMPH !== null) {
    windSpeed = obs.windSpeedMPH * 0.44704; // mph to m/s
  } else if (obs.windSpeed !== undefined && obs.windSpeed !== null) {
    // Assume m/s if units unclear
    windSpeed = obs.windSpeed;
  }

  // Convert pressure to hPa
  let pressure = 1013; // Default sea level pressure
  if (obs.pressureMB !== undefined && obs.pressureMB !== null) {
    pressure = obs.pressureMB;
  } else if (obs.pressureIN !== undefined && obs.pressureIN !== null) {
    pressure = obs.pressureIN * 33.8639; // inches to hPa
  }

  return {
    temperature: tempC,
    humidity: obs.humidity || 0,
    pressure: pressure,
    description: obs.weather || obs.sky || obs.weatherPrimary || 'Unknown',
    windSpeed: windSpeed,
    location: place?.name ? `${place.name}${place.state ? `, ${place.state}` : ''}` : location,
    timestamp: obs.dateTimeISO ? new Date(obs.dateTimeISO).toISOString() : new Date().toISOString(),
  };
}

/**
 * Fetch Xweather forecast for a specific date
 * Documentation: https://www.xweather.com/docs/weather-api/endpoints/forecasts
 * 
 * @param location - City name, lat/long, postal code, or ':auto' for automatic detection
 * @param targetDateStr - Target date in YYYY-MM-DD format
 * @returns Forecast data for the target date, or null if not found
 */
export async function fetchXweatherForecast(location: string, targetDateStr: string): Promise<{
  temperature: number;
  windSpeed: number;
  description: string;
  precipitation?: number;
} | null> {
  const clientId = process.env.XWEATHER_CLIENT_ID;
  const clientSecret = process.env.XWEATHER_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return null;
  }

  // Xweather Forecasts API endpoint
  // Format: /forecasts/:auto?format=json&plimit=1&filter=1min&client_id=&client_secret=
  let locationParam = ':auto';
  
  if (location.match(/^-?\d+\.?\d*,-?\d+\.?\d*$/)) {
    locationParam = location;
  } else if (location && location !== 'Vermont' && location.toLowerCase() !== 'vermont') {
    locationParam = encodeURIComponent(location);
  }
  
  const url = `https://data.api.xweather.com/forecasts/${locationParam}?format=json&plimit=7&filter=1min&client_id=${clientId}&client_secret=${clientSecret}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    if (!data.success || !data.response || !Array.isArray(data.response)) {
      return null;
    }

    // Find forecast period matching target date
    const targetDate = new Date(targetDateStr + 'T00:00:00');
    const targetDateOnly = targetDateStr;
    
    for (const period of data.response) {
      if (period.periods && Array.isArray(period.periods)) {
        for (const p of period.periods) {
          const periodDate = p.dateTimeISO ? new Date(p.dateTimeISO) : null;
          if (periodDate) {
            const periodDateStr = periodDate.toISOString().split('T')[0];
            if (periodDateStr === targetDateOnly) {
              // Convert temperature from F to C if needed
              let tempC = 0;
              if (p.tempC !== undefined && p.tempC !== null) {
                tempC = p.tempC;
              } else if (p.tempF !== undefined && p.tempF !== null) {
                tempC = (p.tempF - 32) * 5/9;
              }
              
              // Convert wind speed to m/s
              let windSpeed = 0;
              if (p.windSpeedKPH !== undefined && p.windSpeedKPH !== null) {
                windSpeed = p.windSpeedKPH / 3.6;
              } else if (p.windSpeedMPH !== undefined && p.windSpeedMPH !== null) {
                windSpeed = p.windSpeedMPH * 0.44704;
              }
              
              return {
                temperature: tempC,
                windSpeed: windSpeed,
                description: p.weather || p.sky || p.weatherPrimary || '',
                precipitation: p.precipMM || 0,
              };
            }
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching Xweather forecast for ${targetDateStr}:`, error);
    return null;
  }
}

/**
 * Fetch weather alerts from Xweather Alerts API
 * Documentation: https://www.xweather.com/docs/weather-api/endpoints/alerts
 * 
 * @param location - City name, lat/long, postal code, or ':auto' for automatic detection
 * @returns Array of weather alerts
 */
export async function fetchXweatherAlerts(location: string = ':auto', limit: number = 10): Promise<XweatherAlert[]> {
  const clientId = process.env.XWEATHER_CLIENT_ID;
  const clientSecret = process.env.XWEATHER_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.log('[Xweather] Credentials not configured - skipping Xweather alerts');
    return [];
  }

  // Xweather Alerts API endpoint
  // Format: /alerts/:auto?format=json&limit=10&client_id=&client_secret=
  const locationParam = location === 'Vermont' || location.toLowerCase() === 'vermont' ? ':auto' : encodeURIComponent(location);
  const url = `https://data.api.xweather.com/alerts/${locationParam}?format=json&limit=${limit}&client_id=${clientId}&client_secret=${clientSecret}`;
  
  console.log(`[Xweather] Fetching weather alerts for: ${location}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[Xweather] Alerts API error ${response.status} ${response.statusText}: ${errorText.substring(0, 200)}`);
      return [];
    }

    const data = await response.json();
    
    // Xweather API returns: {success: boolean, error?: object, response: array}
    if (data.success && data.response && Array.isArray(data.response)) {
      const alerts: XweatherAlert[] = data.response.map((alert: any) => ({
        id: alert.id || alert.type || `alert-${Date.now()}-${Math.random()}`,
        name: alert.name || alert.title || 'Weather Alert',
        type: alert.type || alert.name || 'Unknown',
        severity: alert.severity || (alert.significance === 'W' ? 'Severe' : 'Moderate'),
        title: alert.title || alert.name || 'Weather Alert',
        body: alert.body || alert.description || alert.summary || '',
        expiresISO: alert.expiresISO || alert.expires,
        issueTimeISO: alert.issueTimeISO || alert.issued,
        significance: alert.significance,
        category: alert.category,
        zones: alert.zones || (alert.zone ? [{ state: alert.zone.state || '', zone: alert.zone.zone || '', name: alert.zone.name || '' }] : []),
      }));
      
      console.log(`[Xweather] Successfully fetched ${alerts.length} weather alerts`);
      return alerts;
    }
    
    // Handle error response
    if (data.error) {
      console.log(`[Xweather] Alerts API response: ${data.error.description || data.error.code || 'No alerts available'}`);
    }
    
    return [];
  } catch (error) {
    console.error('[Xweather] Error fetching alerts:', error);
    return [];
  }
}

