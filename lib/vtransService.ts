/**
 * Service for Vermont Agency of Transportation (VTrans) data
 * 
 * Note: VTrans doesn't have a public API, but this service provides:
 * 1. Structure for when/if API access is obtained
 * 2. Manual data entry functions
 * 3. Integration with existing NWS data
 */

import { supabase } from './supabaseClient';

export interface VTransRoadCondition {
  route: string;
  location: string;
  condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'hazardous';
  description: string;
  severity: 'minor' | 'moderate' | 'severe';
  plow_status?: 'active' | 'completed' | 'not_started';
  timestamp: string;
}

/**
 * Add a manual road condition report
 * Use this when you have VTrans data or user reports
 */
export async function addManualRoadCondition(
  condition: VTransRoadCondition
): Promise<any> {
  try {
    const { data, error } = await supabase
      .from('road_conditions')
      .insert({
        source: 'vtrans_manual',
        region: 'Vermont',
        route_name: condition.route,
        location: condition.location,
        condition_type: 'incident',
        description: condition.description,
        severity: condition.severity,
        status: 'active',
        surface_condition: condition.condition,
        created_at: condition.timestamp || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error adding manual road condition:', error);
    throw error;
  }
}

/**
 * Get active road conditions for a specific route
 */
export async function getRoadConditionsForRoute(
  route: string
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('road_conditions')
      .select('*')
      .eq('region', 'Vermont')
      .ilike('route_name', `%${route}%`)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching road conditions:', error);
    return [];
  }
}

/**
 * Get all active road conditions in Vermont
 */
export async function getAllActiveRoadConditions(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('road_conditions')
      .select('*')
      .eq('region', 'Vermont')
      .eq('status', 'active')
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching road conditions:', error);
    return [];
  }
}

/**
 * Format road conditions for AI context
 */
export function formatRoadConditionsForAI(conditions: any[]): string {
  if (conditions.length === 0) {
    return 'No active road condition reports at this time.';
  }

  let context = '\n\nActive Road Conditions in Vermont:\n';
  
  conditions.slice(0, 10).forEach((condition, i) => {
    context += `${i + 1}. ${condition.route_name || 'Route'}: ${condition.description || condition.condition_type}\n`;
    context += `   Location: ${condition.location || 'Unknown'}\n`;
    context += `   Severity: ${condition.severity || 'moderate'}\n`;
    if (condition.surface_condition) {
      context += `   Surface: ${condition.surface_condition}\n`;
    }
    context += '\n';
  });

  return context;
}

/**
 * Placeholder for future VTrans API integration
 * When/if you get API access, implement this function
 */
export async function fetchVTransAPIData(): Promise<VTransRoadCondition[]> {
  // TODO: Implement when VTrans API access is obtained
  // This would fetch real-time data from VTrans API
  
  console.log('VTrans API integration not yet available. Contact VTrans for API access.');
  return [];
}

















