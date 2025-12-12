/**
 * Unified Weather Service
 * Tries multiple weather APIs and returns the best available data
 * Priority order: Weatherstack -> Visual Crossing -> OpenWeatherMap -> NWS (free) -> Xweather
 */

import { fetchNWSCurrentWeather } from './nwsService';
import { fetchWeatherstackWeather } from './weatherstackService';
import { fetchVisualCrossingWeather } from './visualCrossingService';
import { fetchXweatherWeather } from './xweatherService';
import { fetchWeatherData } from './weatherApi';

interface WeatherData {
  temperature: number;
  humidity: number;
  pressure: number;
  description: string;
  windSpeed: number;
  location: string;
  timestamp: string;
  source: string; // Which API was used
}

/**
 * Fetch weather from multiple sources and return the first successful result
 */
export async function fetchWeatherFromMultipleSources(location: string): Promise<WeatherData> {
  // Verify API keys are configured (for logging/debugging)
  const apiKeyStatus = {
    weatherstack: !!process.env.WEATHERSTACK_API_KEY,
    visualCrossing: !!process.env.VISUAL_CROSSING_API_KEY,
    openWeatherMap: !!process.env.WEATHER_API_KEY,
    xweather: !!(process.env.XWEATHER_CLIENT_ID && process.env.XWEATHER_CLIENT_SECRET),
  };
  
  // Log API key configuration status (without exposing actual keys)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Weather Service] API Key Status:', {
      NWS: 'configured (no key needed)',
      Weatherstack: apiKeyStatus.weatherstack ? 'configured' : 'missing WEATHERSTACK_API_KEY',
      'Visual Crossing': apiKeyStatus.visualCrossing ? 'configured' : 'missing VISUAL_CROSSING_API_KEY',
      'OpenWeatherMap': apiKeyStatus.openWeatherMap ? 'configured' : 'missing WEATHER_API_KEY',
      Xweather: apiKeyStatus.xweather ? 'configured' : 'missing XWEATHER_CLIENT_ID/SECRET',
    });
  }

  const sources = [
    {
      name: 'Weatherstack',
      fetch: () => fetchWeatherstackWeather(location),
      priority: 1, // Primary API - reliable paid service
    },
    {
      name: 'Visual Crossing',
      fetch: () => fetchVisualCrossingWeather(location),
      priority: 2, // Secondary API - reliable paid service
    },
    {
      name: 'OpenWeatherMap',
      fetch: () => fetchWeatherData(location),
      priority: 3, // Tertiary API - reliable paid service
    },
    {
      name: 'NWS',
      fetch: () => fetchNWSCurrentWeather(location),
      priority: 4, // Free fallback, no API key needed
    },
    {
      name: 'Xweather',
      fetch: () => fetchXweatherWeather(location),
      priority: 5, // Last resort
    },
  ];

  // Try sources in priority order
  // Priority: 1. Weatherstack, 2. Visual Crossing, 3. OpenWeatherMap, 4. NWS (free), 5. Xweather
  const errors: string[] = [];
  
  for (const source of sources) {
    try {
      console.log(`[Weather Service] Attempting to fetch from ${source.name}...`);
      const data = await source.fetch();
      console.log(`[Weather Service] Successfully fetched from ${source.name}`);
      return {
        ...data,
        source: source.name,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`${source.name}: ${errorMsg}`);
      console.log(`[Weather Service] Failed to fetch from ${source.name}: ${errorMsg} - trying next source...`);
      continue;
    }
  }

  // If we get here, all sources failed
  console.error('[Weather Service] All weather API sources failed:', errors);
  throw new Error(`All weather API sources failed. Errors: ${errors.join('; ')}`);
}

/**
 * Fetch weather from a specific provider
 */
export async function fetchWeatherFromProvider(
  location: string,
  provider: 'nws' | 'weatherstack' | 'visualcrossing' | 'xweather' | 'openweathermap' | 'auto' = 'auto'
): Promise<WeatherData> {
  if (provider === 'auto') {
    return fetchWeatherFromMultipleSources(location);
  }

  let data: WeatherData;
  let source: string;

  switch (provider) {
    case 'nws': {
      const weatherData = await fetchNWSCurrentWeather(location);
      source = 'NWS';
      data = { ...weatherData, source };
      break;
    }
    case 'weatherstack': {
      const weatherData = await fetchWeatherstackWeather(location);
      source = 'Weatherstack';
      data = { ...weatherData, source };
      break;
    }
    case 'visualcrossing': {
      const weatherData = await fetchVisualCrossingWeather(location);
      source = 'Visual Crossing';
      data = { ...weatherData, source };
      break;
    }
    case 'xweather': {
      const weatherData = await fetchXweatherWeather(location);
      source = 'Xweather';
      data = { ...weatherData, source };
      break;
    }
    case 'openweathermap': {
      const weatherData = await fetchWeatherData(location);
      source = 'OpenWeatherMap';
      data = { ...weatherData, source };
      break;
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }

  return data;
}





