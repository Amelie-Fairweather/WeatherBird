// Weather API service
// This works with OpenWeatherMap by default, but can be adapted for other APIs

interface WeatherData {
  temperature: number;
  humidity: number;
  pressure: number;
  description: string;
  windSpeed: number;
  location: string;
  timestamp: string;
}

export async function fetchWeatherData(location: string): Promise<WeatherData> {
  const apiKey = process.env.WEATHER_API_KEY;
  
  if (!apiKey) {
    throw new Error('WEATHER_API_KEY is not set in environment variables');
  }

  // OpenWeatherMap API endpoint
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      // OpenWeatherMap specific error handling
      if (data.cod === '401') {
        throw new Error('Invalid OpenWeatherMap API key. Please check your WEATHER_API_KEY.');
      }
      if (data.cod === '404') {
        throw new Error(`Location "${location}" not found. Please check the location name.`);
      }
      throw new Error(`Weather API error: ${data.message || response.statusText}`);
    }

    return {
      temperature: data.main.temp,
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      description: data.weather[0].description,
      windSpeed: data.wind?.speed || 0,
      location: `${data.name}, ${data.sys.country}`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error fetching weather data:', error);
    throw error;
  }
}

// Alternative: If you're using WeatherAPI.com instead
export async function fetchWeatherDataFromWeatherAPI(location: string): Promise<WeatherData> {
  const apiKey = process.env.WEATHER_API_KEY;
  
  if (!apiKey) {
    throw new Error('WEATHER_API_KEY is not set in environment variables');
  }

  const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(location)}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      temperature: data.current.temp_c,
      humidity: data.current.humidity,
      pressure: data.current.pressure_mb,
      description: data.current.condition.text,
      windSpeed: data.current.wind_kph / 3.6, // Convert km/h to m/s
      location: `${data.location.name}, ${data.location.country}`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error fetching weather data:', error);
    throw error;
  }
}

