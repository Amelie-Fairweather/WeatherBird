/**
 * Weatherbit API Service
 * Documentation: https://www.weatherbit.io/api
 * Provides current weather, forecasts, and historical data
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

interface WeatherbitCurrentResponse {
  data: Array<{
    temp: number;
    rh: number; // relative humidity
    pres: number; // pressure in mb
    wind_spd: number; // wind speed m/s
    weather: {
      description: string;
    };
    city_name: string;
    state_code: string;
    country_code: string;
    ts: number; // timestamp
    precip?: number; // precipitation rate
    snow?: number; // snowfall rate
  }>;
}

interface WeatherbitForecastResponse {
  data: Array<{
    valid_date: string;
    temp: number;
    max_temp: number;
    min_temp: number;
    rh: number;
    pres: number;
    wind_spd: number;
    weather: {
      description: string;
    };
    precip: number; // precipitation in mm
    snow: number; // snowfall in mm
    snow_depth: number; // snow depth in mm
    pop: number; // probability of precipitation
  }>;
}

/**
 * Fetch current weather from Weatherbit
 */
export async function fetchWeatherbitWeather(location: string): Promise<WeatherData> {
  // Use environment variable if set, otherwise use provided API key
  const apiKey = process.env.WEATHERBIT_API_KEY || 'e4134d65778146a486074dd0431b0ab8';

  // Weatherbit API endpoint for current weather
  const url = `https://api.weatherbit.io/v2.0/current?city=${encodeURIComponent(location)}&key=${apiKey}&units=M`;
  
  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Weatherbit API error: ${errorData.error || response.statusText}`);
    }

    const data: WeatherbitCurrentResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      throw new Error(`No weather data found for location: ${location}`);
    }

    const weather = data.data[0];

    return {
      temperature: weather.temp,
      humidity: weather.rh,
      pressure: weather.pres,
      description: weather.weather.description,
      windSpeed: weather.wind_spd, // Already in m/s
      location: `${weather.city_name}, ${weather.state_code}`,
      timestamp: new Date(weather.ts * 1000).toISOString(),
    };
  } catch (error) {
    console.error('Error fetching Weatherbit weather:', error);
    throw error;
  }
}

/**
 * Fetch 16-day forecast from Weatherbit (useful for snow day predictions)
 */
export async function fetchWeatherbitForecast(location: string, days: number = 16): Promise<WeatherbitForecastResponse['data']> {
  // Use environment variable if set, otherwise use provided API key
  const apiKey = process.env.WEATHERBIT_API_KEY || 'e4134d65778146a486074dd0431b0ab8';

  // Weatherbit API endpoint for daily forecast
  const url = `https://api.weatherbit.io/v2.0/forecast/daily?city=${encodeURIComponent(location)}&days=${Math.min(days, 16)}&key=${apiKey}&units=M`;
  
  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Weatherbit Forecast API error: ${errorData.error || response.statusText}`);
    }

    const data: WeatherbitForecastResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      throw new Error(`No forecast data found for location: ${location}`);
    }

    return data.data;
  } catch (error) {
    console.error('Error fetching Weatherbit forecast:', error);
    throw error;
  }
}

/**
 * Get snowfall forecast for tomorrow (for snow day predictions)
 */
export async function getTomorrowSnowfallForecast(location: string): Promise<{
  snowfallInches: number;
  precipitationMm: number;
  probability: number;
  temperature: number;
  date: string;
}> {
  try {
    const forecast = await fetchWeatherbitForecast(location, 2); // Get 2 days (today + tomorrow)
    
    // Get tomorrow's forecast (second day, index 1)
    if (forecast.length < 2) {
      throw new Error('Not enough forecast data');
    }

    const tomorrow = forecast[1]; // Index 1 is tomorrow
    
    // Convert snowfall from mm to inches (1mm = 0.0393701 inches)
    const snowfallInches = (tomorrow.snow || 0) * 0.0393701;
    const precipitationMm = tomorrow.precip || 0;
    
    return {
      snowfallInches: Math.round(snowfallInches * 10) / 10, // Round to 1 decimal
      precipitationMm,
      probability: tomorrow.pop || 0, // Probability of precipitation
      temperature: tomorrow.temp,
      date: tomorrow.valid_date,
    };
  } catch (error) {
    console.error('Error getting tomorrow snowfall forecast:', error);
    throw error;
  }
}









