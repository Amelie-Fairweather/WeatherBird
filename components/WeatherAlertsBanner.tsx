"use client";

import { useState, useEffect } from 'react';

interface WeatherAlert {
  id: string;
  name: string;
  type: string;
  severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme';
  title: string;
  body: string;
  expiresISO?: string;
  issueTimeISO?: string;
  source?: 'Xweather' | 'NWS'; // Track data source for accuracy
}

interface WeatherAlertsBannerProps {
  location?: string;
  updateInterval?: number; // milliseconds, default 1 hour (3600000)
}

export default function WeatherAlertsBanner({ 
  location = 'Vermont', 
  updateInterval = 3600000 // 1 hour default
}: WeatherAlertsBannerProps) {
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/weather/alerts?location=${encodeURIComponent(location)}&limit=10`);
      const data = await response.json();
      
      console.log('[WeatherAlertsBanner] Fetched alerts:', data); // Debug log
      
      if (response.ok && data.alerts && Array.isArray(data.alerts)) {
        // Filter out expired alerts
        const now = new Date();
        const activeAlerts = data.alerts.filter((alert: WeatherAlert) => {
          if (!alert.expiresISO) return true;
          const expiresDate = new Date(alert.expiresISO);
          return expiresDate > now;
        });
        console.log('[WeatherAlertsBanner] Active alerts after filtering:', activeAlerts.length); // Debug log
        // Only keep the most severe alert (already sorted by severity in API)
        setAlerts(activeAlerts.length > 0 ? [activeAlerts[0]] : []);
      } else {
        console.warn('[WeatherAlertsBanner] API error or no alerts:', data);
        setError(data.error || 'Failed to fetch alerts');
        setAlerts([]);
      }
    } catch (err) {
      console.error('[WeatherAlertsBanner] Error fetching alerts:', err);
      setError('Failed to load alerts');
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchAlerts();
  }, [location]);

  // Set up interval to refresh alerts hourly
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAlerts();
    }, updateInterval);

    return () => clearInterval(interval);
  }, [location, updateInterval]);

  // Show loading state briefly, then check for alerts
  // Don't render if no alerts after loading completes
  if (!loading && alerts.length === 0) {
    return null;
  }

  // While loading, show nothing (will show once loaded if alerts exist)
  if (loading && alerts.length === 0) {
    return null;
  }

  // If error and no alerts, don't show anything
  if (error && alerts.length === 0) {
    return null;
  }

  // Show only the most severe alert (first in array, already sorted by API)
  const currentAlert = alerts[0];
  if (!currentAlert) return null;

  // Determine severity styling (with opacity for backdrop blur effect)
  const getSeverityStyle = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'extreme':
        return 'bg-red-700/95 border-red-800 text-white';
      case 'severe':
        return 'bg-red-600/95 border-red-700 text-white';
      case 'moderate':
        return 'bg-orange-500/95 border-orange-600 text-white';
      case 'minor':
        return 'bg-yellow-500/95 border-yellow-600 text-gray-900';
      default:
        return 'bg-blue-600/95 border-blue-700 text-white';
    }
  };

  const severityStyle = getSeverityStyle(currentAlert.severity);

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] w-full">
      <div 
        className={`${severityStyle} border-b-2 px-4 py-3 shadow-lg relative`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Alert Icon and Title */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 mt-1">
              <svg 
                className="w-6 h-6" 
                fill="currentColor" 
                viewBox="0 0 20 20"
              >
                <path 
                  fillRule="evenodd" 
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" 
                  clipRule="evenodd" 
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="font-bold text-lg">
                  {currentAlert.title || currentAlert.name}
                </div>
                {currentAlert.source && (
                  <span className="text-xs opacity-75 font-normal">
                    ({currentAlert.source})
                  </span>
                )}
              </div>
              <div className="text-sm opacity-95 line-clamp-2">
                {currentAlert.body}
              </div>
            </div>
          </div>


          {/* Close/Dismiss Button */}
          <button
            onClick={() => setAlerts([])}
            className="flex-shrink-0 p-1 hover:bg-white/20 rounded transition-colors"
            aria-label="Dismiss alert"
          >
            <svg 
              className="w-5 h-5" 
              fill="currentColor" 
              viewBox="0 0 20 20"
            >
              <path 
                fillRule="evenodd" 
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" 
                clipRule="evenodd" 
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}





