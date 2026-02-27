"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface FloodWarning {
  id: string;
  location: string;
  severity: 'minor' | 'moderate' | 'major' | 'record';
  status: string;
  description: string;
  waterLevel?: number;
  floodStage?: number;
  timestamp: string;
}

interface RoadSafetyAlert {
  id: string;
  location: string;
  type: string;
  severity: string;
  status: string;
  description: string;
  affectedRoads?: string[];
  timestamp: string;
}

interface FloodingData {
  location: string;
  floodWarnings: FloodWarning[];
  roadSafetyAlerts: RoadSafetyAlert[];
  timestamp: string;
}

function getSeverityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'record':
    case 'extreme':
      return 'bg-red-600';
    case 'major':
    case 'high':
      return 'bg-orange-500';
    case 'moderate':
      return 'bg-yellow-500';
    case 'minor':
    case 'low':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500';
  }
}

function getSeverityText(severity: string): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export default function RainPage() {
  const [floodingData, setFloodingData] = useState<FloodingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFloodingData() {
      try {
        setLoading(true);
        const response = await fetch('/api/rain/flooding?location=Vermont');
        
        if (!response.ok) {
          throw new Error('Failed to fetch flooding data');
        }
        
        const data = await response.json();
        setFloodingData(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching flooding data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load flooding data');
      } finally {
        setLoading(false);
      }
    }

    fetchFloodingData();
  }, []);

  return (
    <div className="min-h-screen bg-[var(--offWhite)]">
      {/* Navigation Header */}
      <div className="bg-[var(--darkBlue)] text-white p-4 flex items-center justify-between">
        <Link 
          href="/"
          className="text-xl font-cormorant font-bold hover:opacity-80 transition-opacity"
        >
          ← Back to WEATHERbird
        </Link>
        <div className="flex gap-4">
          <Link 
            href="/snow"
            className="px-4 py-2 bg-[var(--neutralBlue)] text-white rounded-lg hover:bg-[var(--neutralBlueDark)] transition-colors font-cormorant font-bold"
          >
            SNOW
          </Link>
          <Link 
            href="/rain"
            className="px-4 py-2 bg-[var(--neutralBlueLight)] text-white rounded-lg hover:bg-[var(--neutralBlue)] transition-colors font-cormorant font-bold"
          >
            RAIN
          </Link>
          <Link 
            href="/emergency"
            className="px-4 py-2 bg-[var(--neutralBlue)] text-white rounded-lg hover:bg-[var(--neutralBlueDark)] transition-colors font-cormorant font-bold"
          >
            EMERGENCY
          </Link>
        </div>
      </div>
      
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-bold font-cormorant text-[var(--darkBlue)] mb-2">
            Rain & Flood Safety Information
          </h1>
          <p className="text-lg font-cormorant text-gray-700 mb-8">
            Current flood warnings and road safety alerts for Vermont
          </p>

          {loading && (
            <div className="text-center py-12">
              <p className="text-xl font-cormorant text-gray-600">Loading flood and road safety data...</p>
            </div>
          )}

          {error && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-yellow-800 font-cormorant">
                ⚠️ {error}. This may be normal if the Weather.io API is still being configured.
              </p>
            </div>
          )}

          {floodingData && (
            <div className="space-y-8">
              {/* Flood Warnings Section */}
              <div>
                <h2 className="text-3xl font-bold font-cormorant text-[var(--darkBlue)] mb-4">
                  Flood Warnings
                </h2>
                {floodingData.floodWarnings.length === 0 ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <p className="text-green-800 font-cormorant text-lg">
                      ✅ No active flood warnings at this time.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {floodingData.floodWarnings.map((warning) => (
                      <div
                        key={warning.id}
                        className="border-l-4 border-[var(--darkBlue)] bg-white rounded-lg shadow-md p-6"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <span
                                className={`px-3 py-1 rounded-full text-white text-sm font-semibold ${getSeverityColor(
                                  warning.severity
                                )}`}
                              >
                                {getSeverityText(warning.severity)} Flood
                              </span>
                              <span className="text-sm text-gray-600 font-cormorant">
                                {warning.location}
                              </span>
                            </div>
                            <p className="text-gray-800 font-cormorant text-lg">
                              {warning.description}
                            </p>
                          </div>
                        </div>
                        {(warning.floodStage || warning.waterLevel) && (
                          <div className="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600 font-cormorant">
                            {warning.floodStage && (
                              <p>Flood Stage: {warning.floodStage} ft</p>
                            )}
                            {warning.waterLevel && (
                              <p>Current Water Level: {warning.waterLevel} ft</p>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-gray-500 mt-2 font-cormorant">
                          Updated: {new Date(warning.timestamp).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Road Safety Alerts Section */}
              <div>
                <h2 className="text-3xl font-bold font-cormorant text-[var(--darkBlue)] mb-4">
                  Road Safety Alerts
                </h2>
                {floodingData.roadSafetyAlerts.length === 0 ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <p className="text-green-800 font-cormorant text-lg">
                      ✅ No active road safety alerts at this time.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {floodingData.roadSafetyAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="border-l-4 border-orange-500 bg-white rounded-lg shadow-md p-6"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <span
                                className={`px-3 py-1 rounded-full text-white text-sm font-semibold ${getSeverityColor(
                                  alert.severity
                                )}`}
                              >
                                {getSeverityText(alert.severity)} {alert.type}
                              </span>
                              <span className="text-sm text-gray-600 font-cormorant">
                                {alert.location}
                              </span>
                              <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">
                                {alert.status}
                              </span>
                            </div>
                            <p className="text-gray-800 font-cormorant text-lg">
                              {alert.description}
                            </p>
                            {alert.affectedRoads && alert.affectedRoads.length > 0 && (
                              <div className="mt-2">
                                <p className="text-sm font-semibold text-gray-700 font-cormorant mb-1">
                                  Affected Roads:
                                </p>
                                <ul className="list-disc list-inside text-sm text-gray-600 font-cormorant">
                                  {alert.affectedRoads.map((road, idx) => (
                                    <li key={idx}>{road}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 font-cormorant">
                          Updated: {new Date(alert.timestamp).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Safety Tips Section */}
          <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-2xl font-bold font-cormorant text-[var(--darkBlue)] mb-4">
              Flood Safety Tips
            </h2>
            <ul className="space-y-2 text-gray-800 font-cormorant">
              <li>• Never drive through flooded areas - turn around, don't drown</li>
              <li>• Avoid walking or driving near rivers, streams, or drainage ditches during heavy rain</li>
              <li>• Be aware of flash flood risks, especially in low-lying areas</li>
              <li>• Monitor local weather alerts and road conditions before traveling</li>
              <li>• If you see water over the road, find an alternate route</li>
              <li>• Keep emergency supplies in your vehicle during flood season</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

