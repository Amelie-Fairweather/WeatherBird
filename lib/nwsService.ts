/**
 * National Weather Service (NWS) API Service
 * Free, no API key required (just User-Agent header)
 * Documentation: https://www.weather.gov/documentation/services-web-api
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

/**
 * Get grid point for a location (required for NWS forecasts)
 */
async function getGridPoint(latitude: number, longitude: number): Promise<{
  office: string;
  gridX: number;
  gridY: number;
  forecastUrl: string;
}> {
  const response = await fetch(
    `https://api.weather.gov/points/${latitude},${longitude}`,
    {
      headers: {
        'User-Agent': 'WEATHERbird/1.0 (weather safety app, contact@weatherbird.app)',
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`NWS API error: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    office: data.properties.gridId,
    gridX: data.properties.gridX,
    gridY: data.properties.gridY,
    forecastUrl: data.properties.forecast,
  };
}

/**
 * Fetch current weather from NWS
 * Note: NWS doesn't have a direct "current weather" endpoint
 * This uses the latest observation from the nearest station
 */
export async function fetchNWSCurrentWeather(location: string): Promise<WeatherData> {
  try {
    // For Vermont, use Burlington coordinates as default
    // In production, you'd geocode the location first
    const lat = 44.4759;
    const lon = -73.2121;

    const gridPoint = await getGridPoint(lat, lon);
    
    // Get forecast (includes current conditions)
    const forecastResponse = await fetch(gridPoint.forecastUrl, {
      headers: {
        'User-Agent': 'WEATHERbird/1.0 (weather safety app, contact@weatherbird.app)',
        'Accept': 'application/json',
      },
    });

    if (!forecastResponse.ok) {
      throw new Error(`NWS forecast error: ${forecastResponse.statusText}`);
    }

    const forecastData = await forecastResponse.json();
    const currentPeriod = forecastData.properties.periods[0];

    // Get observation from nearest station
    const stationsUrl = `https://api.weather.gov/gridpoints/${gridPoint.office}/${gridPoint.gridX},${gridPoint.gridY}/stations`;
    const stationsResponse = await fetch(stationsUrl, {
      headers: {
        'User-Agent': 'WEATHERbird/1.0 (weather safety app, contact@weatherbird.app)',
        'Accept': 'application/json',
      },
    });

    let observation = null;
    if (stationsResponse.ok) {
      const stationsData = await stationsResponse.json();
      const stationId = stationsData.features[0]?.properties?.stationIdentifier;
      
      if (stationId) {
        const obsResponse = await fetch(
          `https://api.weather.gov/stations/${stationId}/observations/latest`,
          {
            headers: {
              'User-Agent': 'WEATHERbird/1.0 (weather safety app, contact@weatherbird.app)',
              'Accept': 'application/json',
            },
          }
        );
        
        if (obsResponse.ok) {
          observation = await obsResponse.json();
        }
      }
    }

    // Use observation if available, otherwise use forecast
    const temp = observation?.properties?.temperature?.value 
      ? (observation.properties.temperature.value * 9/5 + 32) // Convert C to F, then to C
      : currentPeriod.temperature;
    
    const humidity = observation?.properties?.relativeHumidity?.value || null;
    const pressure = observation?.properties?.seaLevelPressure?.value 
      ? observation.properties.seaLevelPressure.value / 100 // Convert Pa to hPa
      : null;
    const windSpeed = observation?.properties?.windSpeed?.value 
      ? observation.properties.windSpeed.value * 0.514444 // Convert knots to m/s
      : (currentPeriod.windSpeed?.split(' ')[0] || 0);

    return {
      temperature: temp ? (temp - 32) * 5/9 : 0, // Convert F to C
      humidity: humidity || 0,
      pressure: pressure || 1013,
      description: currentPeriod.shortForecast || currentPeriod.detailedForecast,
      windSpeed: typeof windSpeed === 'number' ? windSpeed : 0,
      location: location,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error fetching NWS weather:', error);
    throw error;
  }
}

/**
 * Fetch NWS alerts for a location
 */
export async function fetchNWSAlerts(state: string = 'VT'): Promise<any[]> {
  try {
    const response = await fetch(
      `https://api.weather.gov/alerts/active?area=${state}`,
      {
        headers: {
          'User-Agent': 'WEATHERbird/1.0 (weather safety app, contact@weatherbird.app)',
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`NWS alerts error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.features || [];
  } catch (error) {
    console.error('Error fetching NWS alerts:', error);
    return [];
  }
}

/**
 * Fetch NWS multi-day forecast and return forecast for a specific date
 */
export async function fetchNWSForecast(location: string, targetDateStr: string): Promise<{
  temperature: number;
  windSpeed: number;
  description: string;
  precipitation?: number;
} | null> {
  try {
    // For Vermont, use Burlington coordinates as default
    // In production, you'd geocode the location first
    const lat = 44.4759;
    const lon = -73.2121;

    const gridPoint = await getGridPoint(lat, lon);
    
    // Get daily forecast (7 days, 12-hour periods)
    const forecastResponse = await fetch(gridPoint.forecastUrl, {
      headers: {
        'User-Agent': 'WEATHERbird/1.0 (weather safety app, contact@weatherbird.app)',
        'Accept': 'application/json',
      },
    });

    if (!forecastResponse.ok) {
      throw new Error(`NWS forecast error: ${forecastResponse.statusText}`);
    }

    const forecastData = await forecastResponse.json();
    const periods = forecastData.properties?.periods || [];
    
    // Find periods that match the target date
    const targetDate = new Date(targetDateStr + 'T00:00:00');
    const targetDateOnly = targetDateStr;
    
    // NWS periods are 12-hour periods, we need to find the day period
    // Day periods typically start around 6-8 AM
    const matchingPeriods = periods.filter((period: any) => {
      const periodDate = new Date(period.startTime);
      const periodDateStr = periodDate.toISOString().split('T')[0];
      return periodDateStr === targetDateOnly && period.isDaytime === true;
    });
    
    if (matchingPeriods.length > 0) {
      const dayPeriod = matchingPeriods[0];
      // Convert temperature from F to C
      const tempC = (dayPeriod.temperature - 32) * 5/9;
      
      // Parse wind speed (format: "15 to 20 mph" or "15 mph")
      let windSpeed = 0;
      const windMatch = dayPeriod.windSpeed?.match(/(\d+)/);
      if (windMatch) {
        const windMph = parseInt(windMatch[1]);
        windSpeed = windMph * 0.44704; // Convert mph to m/s
      }
      
      return {
        temperature: tempC,
        windSpeed: windSpeed,
        description: dayPeriod.shortForecast || dayPeriod.detailedForecast || '',
        precipitation: dayPeriod.probabilityOfPrecipitation?.value || 0, // Percentage, not mm
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching NWS forecast for ${targetDateStr}:`, error);
    return null;
  }
}

















