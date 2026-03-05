"use client";

import { useState } from 'react';

export default function TestSupabasePage() {
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testSupabase = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/test/supabase');
      const data = await response.json();
      setResults(data);
    } catch (error) {
      setResults({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Supabase Connection Test</h1>
        
        <button
          onClick={testSupabase}
          disabled={loading}
          className="mb-6 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Testing...' : 'Test Supabase Connection'}
        </button>

        {results && (
          <div className="space-y-4">
            {/* Environment Variables */}
            <div className="bg-white p-4 rounded-lg border">
              <h2 className="text-xl font-bold mb-2">Environment Variables</h2>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${results.environmentVariables?.supabaseUrl ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span>NEXT_PUBLIC_SUPABASE_URL: {results.environmentVariables?.supabaseUrl ? '✅ Set' : '❌ NOT SET'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${results.environmentVariables?.supabaseKey ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span>NEXT_PUBLIC_SUPABASE_ANON_KEY: {results.environmentVariables?.supabaseKey ? '✅ Set' : '❌ NOT SET'}</span>
                </div>
                {results.environmentVariables?.supabaseUrlValue && (
                  <p className="text-gray-600 text-xs mt-2">
                    URL: {results.environmentVariables.supabaseUrlValue}
                  </p>
                )}
              </div>
            </div>

            {/* Test Results */}
            <div className="bg-white p-4 rounded-lg border">
              <h2 className="text-xl font-bold mb-2">Test Results</h2>
              <div className="space-y-3">
                {Object.entries(results.tests || {}).map(([testName, testResult]: [string, any]) => (
                  <div key={testName} className="border-l-4 pl-3" style={{ borderColor: testResult.success ? '#10B981' : '#EF4444' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold capitalize">{testName.replace(/([A-Z])/g, ' $1').trim()}:</span>
                      {testResult.success ? (
                        <span className="text-green-600 font-bold">✅ PASSED</span>
                      ) : (
                        <span className="text-red-600 font-bold">❌ FAILED</span>
                      )}
                    </div>
                    {testResult.error && (
                      <p className="text-red-600 text-sm mt-1">Error: {testResult.error}</p>
                    )}
                    {testResult.data && (
                      <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-auto">
                        {JSON.stringify(testResult.data, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            {results.summary && (
              <div className={`p-4 rounded-lg border-2 ${
                results.summary.overallStatus === 'ALL TESTS PASSED' 
                  ? 'bg-green-50 border-green-500' 
                  : results.summary.overallStatus === 'PARTIAL SUCCESS'
                  ? 'bg-yellow-50 border-yellow-500'
                  : 'bg-red-50 border-red-500'
              }`}>
                <h2 className="text-xl font-bold mb-2">Summary</h2>
                <div className="space-y-1">
                  <p><strong>Status:</strong> {results.summary.overallStatus}</p>
                  <p><strong>Tests Passed:</strong> {results.summary.passedTests} / {results.summary.totalTests}</p>
                  <p><strong>Tests Failed:</strong> {results.summary.failedTests}</p>
                </div>
              </div>
            )}

            {/* What This Means */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="font-bold mb-2">What This Means:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>If <strong>ALL TESTS PASSED</strong>: Supabase is working correctly! ✅</li>
                <li>If <strong>PARTIAL SUCCESS</strong>: Some tables might not exist yet, but connection works.</li>
                <li>If <strong>ALL TESTS FAILED</strong>: 
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>Check your environment variables in Vercel</li>
                    <li>Verify your Supabase project is active</li>
                    <li>Check that your Supabase URL and API key are correct</li>
                  </ul>
                </li>
                <li className="mt-2"><strong>Note:</strong> Your app will still work even if Supabase fails - it just won't have historical data or school districts.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
