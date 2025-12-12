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
    throw new Error('XWEATHER_CLIENT_ID and XWEATHER_CLIENT_SECRET must be set in environment variables');
  }

  // Xweather Road Weather API endpoint
  // Uses client_id and client_secret as query parameters
  const url = `https://data.api.xweather.com/roadweather/${encodeURIComponent(location)}?client_id=${clientId}&client_secret=${clientSecret}`;
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Xweather Road Weather API error: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  
  // Handle array response
  if (Array.isArray(data)) {
    return data;
  }
  
  // Handle single object response
  if (data && data.id) {
    return [data];
  }
  
  return [];
}

export async function fetchXweatherWeather(location: string): Promise<WeatherData> {
  const clientId = process.env.XWEATHER_CLIENT_ID;
  const clientSecret = process.env.XWEATHER_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('XWEATHER_CLIENT_ID and XWEATHER_CLIENT_SECRET must be set in environment variables');
  }

  // Xweather uses OAuth2 - first get access token
  const tokenResponse = await fetch('https://api.aerisapi.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Xweather OAuth error: ${tokenResponse.statusText}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  // Now fetch weather data
  const url = `https://api.aerisapi.com/observations/${encodeURIComponent(location)}?format=json&filter=allstations&limit=1`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  const data = await response.json();
  
  if (!response.ok || !data.success) {
    throw new Error(`Xweather API error: ${data.error?.description || response.statusText}`);
  }

  const obs = data.response[0]?.ob;

  return {
    temperature: obs.tempC || obs.tempF ? (obs.tempF - 32) * 5/9 : 0,
    humidity: obs.humidity || 0,
    pressure: obs.pressureMB || obs.pressureIN ? obs.pressureIN * 33.8639 : 1013,
    description: obs.weather || obs.sky || 'Unknown',
    windSpeed: obs.windSpeedKPH ? obs.windSpeedKPH / 3.6 : (obs.windSpeedMPH ? obs.windSpeedMPH * 0.44704 : 0),
    location: `${data.response[0]?.place?.name || location}`,
    timestamp: new Date().toISOString(),
  };
}




