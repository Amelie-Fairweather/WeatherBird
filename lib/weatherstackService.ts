/**
 * Weatherstack API Service
 * Documentation: https://weatherstack.com/dashboard
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

export async function fetchWeatherstackWeather(location: string): Promise<WeatherData> {
  const apiKey = process.env.WEATHERSTACK_API_KEY;
  
  if (!apiKey) {
    throw new Error('WEATHERSTACK_API_KEY is not set in environment variables');
  }

  const url = `http://api.weatherstack.com/current?access_key=${apiKey}&query=${encodeURIComponent(location)}&units=m`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok || data.error) {
      throw new Error(`Weatherstack API error: ${data.error?.info || response.statusText}`);
    }

    return {
      temperature: data.current.temperature,
      humidity: data.current.humidity,
      pressure: data.current.pressure,
      description: data.current.weather_descriptions[0] || 'Unknown',
      windSpeed: data.current.wind_speed / 3.6, // Convert km/h to m/s
      location: `${data.location.name}, ${data.location.country}`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error fetching Weatherstack weather:', error);
    throw error;
  }
}







