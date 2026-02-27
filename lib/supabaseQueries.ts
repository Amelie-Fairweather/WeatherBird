import { supabase } from './supabaseClient';

export interface WeatherDataPoint {
  location: string;
  temperature: number;
  humidity: number;
  pressure: number;
  description: string;
  windSpeed: number;
  timestamp: string;
}

export async function getHistoricalWeatherData(
  location: string,
  days: number = 7
): Promise<WeatherDataPoint[]> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from('weather_data')
      .select('*')
      .ilike('location', `%${location}%`)
      .gte('timestamp', cutoffDate.toISOString())
      .order('timestamp', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching historical data:', error);
      return [];
    }

    return (data || []).map((row) => ({
      location: row.location,
      temperature: parseFloat(row.temperature),
      humidity: row.humidity,
      pressure: parseFloat(row.pressure),
      description: row.description,
      windSpeed: parseFloat(row.wind_speed),
      timestamp: row.timestamp,
    }));
  } catch (error) {
    console.error('Error in getHistoricalWeatherData:', error);
    return [];
  }
}

















