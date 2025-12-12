/**
 * Visual Crossing Weather API Service
 * Documentation: https://www.visualcrossing.com/weather-query-builder/
 * Requires API key
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

export async function fetchVisualCrossingWeather(location: string): Promise<WeatherData> {
  const apiKey = process.env.VISUAL_CROSSING_API_KEY;
  
  if (!apiKey) {
    throw new Error('VISUAL_CROSSING_API_KEY is not set in environment variables');
  }

  const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(location)}/today?unitGroup=metric&key=${apiKey}&include=current`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Visual Crossing API error: ${data.message || response.statusText}`);
    }

    const current = data.currentConditions;

    return {
      temperature: current.temp,
      humidity: current.humidity,
      pressure: current.pressure,
      description: current.conditions,
      windSpeed: current.windspeed / 3.6, // Convert km/h to m/s
      location: `${data.resolvedAddress || location}`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error fetching Visual Crossing weather:', error);
    throw error;
  }
}

/**
 * Fetch historical weather data from Visual Crossing
 */
export async function fetchVisualCrossingHistorical(
  location: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const apiKey = process.env.VISUAL_CROSSING_API_KEY;
  
  if (!apiKey) {
    throw new Error('VISUAL_CROSSING_API_KEY is not set');
  }

  const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(location)}/${startDate}/${endDate}?unitGroup=metric&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Visual Crossing API error: ${data.message || response.statusText}`);
    }

    return data.days || [];
  } catch (error) {
    console.error('Error fetching Visual Crossing historical data:', error);
    throw error;
  }
}







