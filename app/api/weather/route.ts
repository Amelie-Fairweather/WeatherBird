import { NextResponse } from 'next/server';
import { fetchWeatherFromProvider } from '@/lib/unifiedWeatherService';
import { supabase } from '@/lib/supabaseClient';

// GET endpoint to fetch weather data from multiple sources
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const location = searchParams.get('location') || 'Vermont';
  const provider = searchParams.get('provider') as 'nws' | 'weatherbit' | 'weatherstack' | 'visualcrossing' | 'xweather' | 'openweathermap' | 'auto' | null;

  try {
    // Fetch weather data from specified provider or auto-select
    const weatherData = await fetchWeatherFromProvider(location, provider || 'auto');

    // Store in Supabase (don't fail if this errors, just log it)
    try {
      const { error } = await supabase
        .from('weather_data')
        .insert({
          location: weatherData.location,
          temperature: weatherData.temperature,
          humidity: weatherData.humidity,
          pressure: weatherData.pressure,
          description: weatherData.description,
          wind_speed: weatherData.windSpeed,
          timestamp: weatherData.timestamp,
        });

      if (error) {
        console.error('Error storing in Supabase:', error);
        // Still return the weather data even if storage fails
      }
    } catch (dbError) {
      console.error('Database error (non-fatal):', dbError);
      // Continue even if database fails
    }

    return NextResponse.json({
      ...weatherData,
      source: weatherData.source || 'unknown',
    });
  } catch (error) {
    console.error('Error fetching weather:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { 
        error: 'Failed to fetch weather data',
        details: errorMessage 
      },
      { status: 500 }
    );
  }
}

