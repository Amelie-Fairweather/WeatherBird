/**
 * Test endpoint to check if Supabase is working
 * GET /api/test/supabase
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    environmentVariables: {
      supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabaseUrlValue: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...' || 'NOT SET',
    },
    tests: {} as Record<string, { success: boolean; error?: string; data?: unknown }>,
  };

  // Test 1: Check if we can connect to Supabase
  try {
    const { data, error } = await supabase.from('weather_data').select('count').limit(1);
    results.tests.connection = {
      success: !error,
      error: error?.message,
      data: error ? null : `Connected successfully. Found ${data?.length || 0} records.`,
    };
  } catch (error) {
    results.tests.connection = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Test 2: Try to read from weather_data table
  try {
    const { data, error, count } = await supabase
      .from('weather_data')
      .select('*', { count: 'exact' })
      .limit(5);
    
    results.tests.weatherDataRead = {
      success: !error,
      error: error?.message,
      data: {
        recordCount: count || 0,
        sampleRecords: data?.length || 0,
        firstRecord: data && data.length > 0 ? {
          location: data[0].location,
          timestamp: data[0].timestamp,
        } : null,
      },
    };
  } catch (error) {
    results.tests.weatherDataRead = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Test 3: Try to write to weather_data table (test insert)
  try {
    const testData = {
      location: 'TEST_LOCATION',
      temperature: 32.5,
      humidity: 50,
      pressure: 1013.25,
      description: 'Test data - can be deleted',
      wind_speed: 5.0,
      timestamp: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('weather_data')
      .insert(testData)
      .select();

    results.tests.weatherDataWrite = {
      success: !error,
      error: error?.message,
      data: error ? null : `Successfully inserted test record. ID: ${data?.[0]?.id || 'unknown'}`,
    };

    // Clean up: Delete the test record
    if (!error && data && data[0]?.id) {
      await supabase.from('weather_data').delete().eq('id', data[0].id);
    }
  } catch (error) {
    results.tests.weatherDataWrite = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Test 4: Check school_districts table
  try {
    const { data, error, count } = await supabase
      .from('school_districts')
      .select('*', { count: 'exact' })
      .limit(5);
    
    results.tests.schoolDistrictsRead = {
      success: !error,
      error: error?.message,
      data: {
        recordCount: count || 0,
        sampleRecords: data?.length || 0,
      },
    };
  } catch (error) {
    results.tests.schoolDistrictsRead = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Test 5: Check knowledge_documents table (if exists)
  try {
    const { data, error, count } = await supabase
      .from('knowledge_documents')
      .select('*', { count: 'exact' })
      .limit(5);
    
    results.tests.knowledgeDocumentsRead = {
      success: !error,
      error: error?.message,
      data: {
        recordCount: count || 0,
      },
    };
  } catch (error) {
    results.tests.knowledgeDocumentsRead = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: 'Table may not exist - this is OK',
    };
  }

  // Summary
  const allTests = Object.values(results.tests);
  const passedTests = allTests.filter(t => t.success).length;
  const totalTests = allTests.length;

  results.summary = {
    totalTests,
    passedTests,
    failedTests: totalTests - passedTests,
    overallStatus: passedTests === totalTests ? 'ALL TESTS PASSED' : 
                   passedTests > 0 ? 'PARTIAL SUCCESS' : 'ALL TESTS FAILED',
  };

  return NextResponse.json(results, {
    status: passedTests === totalTests ? 200 : 503,
  });
}
