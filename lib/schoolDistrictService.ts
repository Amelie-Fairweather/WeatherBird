/**
 * School District Service
 * Manages Vermont school district data, historical closings, and thresholds
 */

import { supabase } from './supabaseClient';

export interface SchoolDistrict {
  id: number;
  district_name: string;
  district_code?: string;
  county?: string;
  zip_codes: string[];
  city?: string;
  latitude?: number;
  longitude?: number;
  district_type?: string;
  enrollment?: number;
}

export interface SchoolClosing {
  id: number;
  district_id: number;
  closing_date: string;
  closure_type: 'full_closing' | 'delay' | 'early_dismissal' | 'no_school';
  temperature_c?: number;
  precipitation_amount?: number;
  snowfall_amount?: number;
  ice_amount?: number;
  wind_speed?: number;
  visibility?: number;
  forecast_temperature?: number;
  forecast_precipitation?: number;
  forecast_snowfall?: number;
  forecast_wind_speed?: number;
  announced_at?: string;
  source?: string;
  notes?: string;
}

export interface DistrictThresholds {
  id: number;
  district_id: number;
  full_closing_snowfall_threshold?: number;
  delay_snowfall_threshold?: number;
  ice_threshold?: number;
  temperature_threshold?: number;
  wind_speed_threshold?: number;
  morning_storm_multiplier?: number;
  afternoon_storm_multiplier?: number;
  prediction_accuracy?: number;
  total_predictions?: number;
  correct_predictions?: number;
  auto_calculate: boolean;
  manual_override: boolean;
}

/**
 * Get district by zip code
 */
export async function getDistrictByZipCode(zipCode: string): Promise<SchoolDistrict | null> {
  try {
    // Get all districts and filter by zip code
    // Supabase's contains doesn't work well with array fields in some cases
    const { data, error } = await supabase
      .from('school_districts')
      .select('*');

    if (error) {
      console.error('Error fetching districts:', error);
      return null;
    }

    // Find district that contains this zip code
    const district = data?.find(d => 
      d.zip_codes && Array.isArray(d.zip_codes) && d.zip_codes.includes(zipCode)
    );

    return district || null;
  } catch (error) {
    console.error('Error in getDistrictByZipCode:', error);
    return null;
  }
}

/**
 * Get district by name
 */
export async function getDistrictByName(name: string): Promise<SchoolDistrict | null> {
  try {
    const { data, error } = await supabase
      .from('school_districts')
      .select('*')
      .ilike('district_name', `%${name}%`)
      .single();

    if (error) {
      console.error('Error fetching district by name:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getDistrictByName:', error);
    return null;
  }
}

/**
 * Get all districts
 */
export async function getAllDistricts(): Promise<SchoolDistrict[]> {
  try {
    const { data, error } = await supabase
      .from('school_districts')
      .select('*')
      .order('district_name');

    if (error) {
      console.error('Error fetching districts:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getAllDistricts:', error);
    return [];
  }
}

/**
 * Get historical closings for a district
 */
export async function getHistoricalClosings(
  districtId: number,
  days: number = 365
): Promise<SchoolClosing[]> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from('school_closings_history')
      .select('*')
      .eq('district_id', districtId)
      .gte('closing_date', cutoffDate.toISOString().split('T')[0])
      .order('closing_date', { ascending: false });

    if (error) {
      console.error('Error fetching historical closings:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getHistoricalClosings:', error);
    return [];
  }
}

/**
 * Add a historical closing record
 */
export async function addHistoricalClosing(closing: Omit<SchoolClosing, 'id'>): Promise<SchoolClosing | null> {
  try {
    const { data, error } = await supabase
      .from('school_closings_history')
      .insert(closing)
      .select()
      .single();

    if (error) {
      console.error('Error adding historical closing:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in addHistoricalClosing:', error);
    return null;
  }
}

/**
 * Get thresholds for a district
 */
export async function getDistrictThresholds(districtId: number): Promise<DistrictThresholds | null> {
  try {
    const { data, error } = await supabase
      .from('district_thresholds')
      .select('*')
      .eq('district_id', districtId)
      .single();

    if (error) {
      // If no thresholds exist, create default ones
      if (error.code === 'PGRST116') {
        return await createDefaultThresholds(districtId);
      }
      console.error('Error fetching district thresholds:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getDistrictThresholds:', error);
    return null;
  }
}

/**
 * Create default thresholds for a district
 */
async function createDefaultThresholds(districtId: number): Promise<DistrictThresholds | null> {
  try {
    const { data, error } = await supabase
      .from('district_thresholds')
      .insert({
        district_id: districtId,
        full_closing_snowfall_threshold: 6.0, // Default: 6 inches for full closing
        delay_snowfall_threshold: 3.0, // Default: 3 inches for delay
        ice_threshold: 0.25, // Default: 0.25 inches of ice
        temperature_threshold: 10.0, // Default: Below 10°F increases closure likelihood
        wind_speed_threshold: 30.0, // Default: Above 30 mph increases closure likelihood
        auto_calculate: true,
        manual_override: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating default thresholds:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createDefaultThresholds:', error);
    return null;
  }
}

/**
 * Update district thresholds
 */
export async function updateDistrictThresholds(
  districtId: number,
  thresholds: Partial<DistrictThresholds>
): Promise<DistrictThresholds | null> {
  try {
    const { data, error } = await supabase
      .from('district_thresholds')
      .update({
        ...thresholds,
        last_updated: new Date().toISOString(),
      })
      .eq('district_id', districtId)
      .select()
      .single();

    if (error) {
      console.error('Error updating district thresholds:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in updateDistrictThresholds:', error);
    return null;
  }
}

/**
 * Learn thresholds from historical data
 * Analyzes past closings to calculate optimal thresholds for a district
 */
export async function learnThresholdsFromHistory(districtId: number): Promise<DistrictThresholds | null> {
  try {
    const closings = await getHistoricalClosings(districtId, 365 * 3); // 3 years of data

    if (closings.length < 5) {
      console.log(`Not enough historical data (${closings.length} records) to learn thresholds`);
      return await getDistrictThresholds(districtId); // Return current/default thresholds
    }

    // Analyze full closings
    const fullClosings = closings.filter(c => c.closure_type === 'full_closing');
    const snowfallForFullClosing = fullClosings
      .map(c => c.snowfall_amount || c.forecast_snowfall)
      .filter((v): v is number => v !== undefined && v !== null)
      .sort((a, b) => a - b);

    // Use median snowfall amount for full closing threshold
    const fullClosingThreshold = snowfallForFullClosing.length > 0
      ? snowfallForFullClosing[Math.floor(snowfallForFullClosing.length / 2)]
      : 6.0; // Default fallback

    // Analyze delays
    const delays = closings.filter(c => c.closure_type === 'delay');
    const snowfallForDelay = delays
      .map(c => c.snowfall_amount || c.forecast_snowfall)
      .filter((v): v is number => v !== undefined && v !== null)
      .sort((a, b) => a - b);

    const delayThreshold = snowfallForDelay.length > 0
      ? snowfallForDelay[Math.floor(snowfallForDelay.length / 2)]
      : 3.0; // Default fallback

    // Update thresholds
    return await updateDistrictThresholds(districtId, {
      full_closing_snowfall_threshold: fullClosingThreshold,
      delay_snowfall_threshold: delayThreshold,
      auto_calculate: true,
    });
  } catch (error) {
    console.error('Error in learnThresholdsFromHistory:', error);
    return null;
  }
}










