/**
 * API endpoint to fetch and store road condition data from New England 511
 * GET /api/road-conditions/fetch?region=Vermont
 */

import { NextResponse } from 'next/server';
import { 
  fetchIncidents, 
  fetchLaneClosures, 
  fetchEnvironmentalSensorData,
  fetchTrafficConditions,
  formatNewEngland511DataForAI
} from '@/lib/newEngland511Service';
import { supabase } from '@/lib/supabaseClient';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region') || 'Vermont';

    // Fetch all data types from New England 511
    const [incidents, closures, sensors, conditions] = await Promise.all([
      fetchIncidents(region),
      fetchLaneClosures(region),
      fetchEnvironmentalSensorData(region),
      fetchTrafficConditions(region),
    ]);

    // Store incidents in Supabase
    const storedIncidents = [];
    for (const incident of incidents) {
      const { data, error } = await supabase
        .from('road_conditions')
        .upsert({
          source: 'new_england_511',
          region: region,
          route_name: incident.route || incident.road,
          location: incident.location || incident.description,
          condition_type: 'incident',
          description: incident.description,
          severity: incident.severity || 'moderate',
          status: incident.status || 'active',
          start_time: incident.start_time || incident.timestamp,
          end_time: incident.end_time,
          latitude: incident.latitude,
          longitude: incident.longitude,
          raw_data: incident,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id', // Update if exists
        })
        .select()
        .single();

      if (!error && data) {
        storedIncidents.push(data);
      }
    }

    // Store closures
    const storedClosures = [];
    for (const closure of closures) {
      const { data, error } = await supabase
        .from('road_conditions')
        .upsert({
          source: 'new_england_511',
          region: region,
          route_name: closure.route || closure.road,
          location: closure.location || closure.description,
          condition_type: 'closure',
          description: closure.description,
          severity: closure.severity || 'severe',
          status: closure.status || 'active',
          start_time: closure.start_time || closure.timestamp,
          end_time: closure.end_time,
          latitude: closure.latitude,
          longitude: closure.longitude,
          raw_data: closure,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
        })
        .select()
        .single();

      if (!error && data) {
        storedClosures.push(data);
      }
    }

    // Store sensor data
    const storedSensors = [];
    for (const sensor of sensors) {
      const { data, error } = await supabase
        .from('road_conditions')
        .upsert({
          source: 'new_england_511',
          region: region,
          location: sensor.location || sensor.station_name,
          condition_type: 'sensor',
          temperature: sensor.temperature,
          surface_condition: sensor.surface_condition || sensor.condition,
          visibility: sensor.visibility,
          wind_speed: sensor.wind_speed,
          raw_data: sensor,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
        })
        .select()
        .single();

      if (!error && data) {
        storedSensors.push(data);
      }
    }

    // Format for AI context
    const aiContext = formatNewEngland511DataForAI({
      incidents,
      closures,
      sensors,
      conditions,
    });

    return NextResponse.json({
      success: true,
      region,
      summary: {
        incidents: incidents.length,
        closures: closures.length,
        sensors: sensors.length,
        conditions: conditions.length,
      },
      stored: {
        incidents: storedIncidents.length,
        closures: storedClosures.length,
        sensors: storedSensors.length,
      },
      ai_context: aiContext,
    });
  } catch (error) {
    console.error('Error fetching road conditions:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch road conditions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}







