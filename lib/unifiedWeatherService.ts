/**
 * Unified Weather Service
 * Tries multiple weather APIs and returns the best available data
 * Priority order: NWS (government source) -> Weatherbit -> Weatherstack -> Visual Crossing -> OpenWeatherMap -> Xweather
 */

import { fetchNWSCurrentWeather } from './nwsService';
import { fetchWeatherstackWeather } from './weatherstackService';
import { fetchVisualCrossingWeather } from './visualCrossingService';
import { fetchXweatherWeather } from './xweatherService';
import { fetchWeatherData } from './weatherApi';
import { fetchWeatherbitWeather } from './weatherbitService';

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
    weatherbit: !!(process.env.WEATHERBIT_API_KEY || 'e4134d65778146a486074dd0431b0ab8'),
    weatherstack: !!process.env.WEATHERSTACK_API_KEY,
    visualCrossing: !!process.env.VISUAL_CROSSING_API_KEY,
    openWeatherMap: !!process.env.WEATHER_API_KEY,
    xweather: !!(process.env.XWEATHER_CLIENT_ID && process.env.XWEATHER_CLIENT_SECRET),
  };
  
  // Log API key configuration status (without exposing actual keys)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Weather Service] API Key Status:', {
      NWS: 'configured (no key needed)',
      Weatherbit: apiKeyStatus.weatherbit ? 'configured' : 'missing WEATHERBIT_API_KEY',
      Weatherstack: apiKeyStatus.weatherstack ? 'configured' : 'missing WEATHERSTACK_API_KEY',
      'Visual Crossing': apiKeyStatus.visualCrossing ? 'configured' : 'missing VISUAL_CROSSING_API_KEY',
      'OpenWeatherMap': apiKeyStatus.openWeatherMap ? 'configured' : 'missing WEATHER_API_KEY',
      Xweather: apiKeyStatus.xweather ? 'configured' : 'missing XWEATHER_CLIENT_ID/SECRET',
    });
  }

  const sources = [
    {
      name: 'NWS',
      fetch: () => fetchNWSCurrentWeather(location),
      priority: 1, // PRIMARY: Government source - most reliable and authoritative
    },
    {
      name: 'Weatherbit',
      fetch: () => fetchWeatherbitWeather(location),
      priority: 2, // Excellent for forecasts and snow data
    },
    {
      name: 'Weatherstack',
      fetch: () => fetchWeatherstackWeather(location),
      priority: 3, // Secondary validation/backup
    },
    {
      name: 'Visual Crossing',
      fetch: () => fetchVisualCrossingWeather(location),
      priority: 4, // Tertiary validation/backup
    },
    {
      name: 'OpenWeatherMap',
      fetch: () => fetchWeatherData(location),
      priority: 5, // Additional backup
    },
    {
      name: 'Xweather',
      fetch: () => fetchXweatherWeather(location),
      priority: 6, // Last resort
    },
  ];

  // Try sources in priority order
  // Priority: 1. NWS (government source - PRIMARY), 2. Weatherbit (excellent forecasts), 3. Weatherstack, 4. Visual Crossing, 5. OpenWeatherMap, 6. Xweather
  const errors: string[] = [];
  const attemptedSources: string[] = [];
  
  console.log(`[UnifiedWeather] Attempting to fetch weather for "${location}" from multiple sources...`);
  
  // Import validation service
  const { validateWeatherData } = await import('./weatherDataValidationService');

  for (const source of sources) {
    try {
      console.log(`[Weather Service] Attempting to fetch from ${source.name}...`);
      const data = await source.fetch();
      
      // Validate data before accepting it (CRITICAL for government accuracy)
      const validation = validateWeatherData(data);
      
      if (!validation.isValid || validation.confidence < 50) {
        console.warn(`[Weather Service] ${source.name} data validation failed (confidence: ${validation.confidence}%):`, validation.issues);
        errors.push(`${source.name}: Validation failed - ${validation.issues.join(', ')}`);
        continue; // Try next source if validation fails
      }
      
      if (validation.confidence < 80) {
        console.warn(`[Weather Service] ${source.name} data has lower confidence (${validation.confidence}%):`, validation.recommendations);
      }
      
      console.log(`[Weather Service] Successfully fetched and validated from ${source.name} (confidence: ${validation.confidence}%)`);
      
      // Log validation details if confidence is low
      if (validation.confidence < 80) {
        console.warn(`[Weather Service] ${source.name} validation warnings:`, validation.recommendations);
      }
      
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
  provider: 'nws' | 'weatherbit' | 'weatherstack' | 'visualcrossing' | 'xweather' | 'openweathermap' | 'auto' = 'auto'
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
    case 'weatherbit': {
      const weatherData = await fetchWeatherbitWeather(location);
      source = 'Weatherbit';
      data = { ...weatherData, source };
      break;
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }

  return data;
}





