"use client";

import Link from "next/link";
import { useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import the map component (requires client-side rendering)
const VermontRoadSafetyMap = dynamic(() => import("@/components/VermontRoadSafetyMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] bg-gray-100 rounded-lg flex items-center justify-center">
      <p className="text-gray-600 font-cormorant">Loading map...</p>
    </div>
  ),
});

interface DayPrediction {
  predicted_for_date: string;
  probabilities: {
    full_closing: number;
    delay: number;
    early_dismissal: number;
  };
  categories: {
    full_closing: string;
    delay: string;
    early_dismissal: string;
  };
  confidence: number;
  forecast: {
    temperature_f: number;
    snowfall_inches: string;
    wind_speed_mph: number;
    condition: string;
  };
  factors: string[];
}

interface PredictionResponse {
  district: string;
  multiDay?: boolean;
  // Single-day format (backward compatibility)
  predicted_for_date?: string;
  probabilities?: {
    full_closing: number;
    delay: number;
    early_dismissal: number;
  };
  categories?: {
    full_closing: string;
    delay: string;
    early_dismissal: string;
  };
  confidence?: number;
  forecast?: {
    temperature_f: number;
    snowfall_inches: string;
    wind_speed_mph: number;
    condition: string;
  };
  factors?: string[];
  thresholds?: {
    full_closing_snowfall: number;
    delay_snowfall: number;
    ice_threshold: number;
  } | null;
  // Multi-day format
  predictions?: DayPrediction[];
}

export default function SnowPage() {
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePredict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim()) {
      setError("Please enter a zip code, district name, or location (e.g., 'Vermont', 'Burlington')");
      return;
    }

    setLoading(true);
    setError(null);
    setPrediction(null);

    try {
      const response = await fetch(`/api/snow-day/predict?district=${encodeURIComponent(location.trim())}`);
      const data = await response.json();

      if (!response.ok) {
        // Provide more detailed error messages
        const errorMsg = data.error || data.details || "Failed to get prediction";
        throw new Error(errorMsg);
      }

      // Validate that we got prediction data
      if (!data || (!data.predictions && !data.probabilities)) {
        throw new Error("Unable to generate predictions - no prediction data returned");
      }

      setPrediction(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
      console.error('Snow day prediction error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getProbabilityColor = (probability: number) => {
    if (probability >= 75) return "text-red-600";
    if (probability >= 55) return "text-orange-600";
    if (probability > 0) return "text-yellow-600";
    return "text-green-600";
  };

  const getProbabilityBg = (probability: number) => {
    if (probability >= 75) return "bg-red-100";
    if (probability >= 55) return "bg-orange-100";
    if (probability > 0) return "bg-yellow-100";
    return "bg-green-100";
  };

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
          <h1 className="text-4xl font-bold font-cormorant text-[var(--darkBlue)] mb-2">Snow Day Calculator</h1>
          <p className="text-lg font-cormorant text-gray-700 mb-8">
            Maple will predict the likelihood of a snow day!
          </p>

          {/* Input Form */}

          {/* Input Form */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-[var(--gold)]/30">
            <form onSubmit={handlePredict} className="flex gap-3">
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Enter zip code, district, or location (e.g., 05401, Vermont, Burlington)"
                className="flex-1 px-4 py-3 border border-gray-200 rounded focus:outline-none focus:border-[var(--gold)] bg-white text-base font-caveat placeholder-gray-400"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-[var(--gold)] text-[var(--darkBlue)] font-caveat rounded hover:bg-[var(--goldDark)] disabled:opacity-50 disabled:cursor-not-allowed font-medium text-base transition-colors"
              >
                {loading ? "Calculating..." : "Check Prediction"}
              </button>
            </form>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 font-cormorant font-semibold mb-2">⚠️ Unable to generate predictions</p>
              <p className="text-red-700 font-cormorant">{error}</p>
              <p className="text-red-600 font-cormorant text-sm mt-2 italic">
                Please check your input and try again. If the problem persists, the weather service may be temporarily unavailable.
              </p>
            </div>
          )}

          {/* Prediction Results */}
          {prediction && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-[var(--gold)]/30">
              <div className="mb-6">
                <h2 className="text-2xl font-bold font-cormorant text-[var(--darkBlue)] mb-2">
                  {prediction.district}
                </h2>
              </div>

              {/* Multi-day predictions (tomorrow + week) */}
              {prediction.multiDay && prediction.predictions && prediction.predictions.length > 0 ? (
                <>
                  {/* Tomorrow's prediction (first day) - highlighted */}
                  {prediction.predictions[0] && (
                    <div className="mb-8 pb-8 border-b-2 border-[var(--gold)]">
                      <h3 className="text-xl font-bold font-cormorant text-[var(--darkBlue)] mb-4">
                        Tomorrow: {new Date(prediction.predictions[0].predicted_for_date).toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className={`${getProbabilityBg(prediction.predictions[0].probabilities.full_closing)} rounded-lg p-4`}>
                          <div className="text-sm font-cormorant text-gray-600 mb-1">Full Closing</div>
                          <div className={`text-3xl font-bold font-cormorant ${getProbabilityColor(prediction.predictions[0].probabilities.full_closing)}`}>
                            {prediction.predictions[0].probabilities.full_closing}%
                          </div>
                          <div className="text-xs font-cormorant text-gray-600 mt-2">
                            {prediction.predictions[0].categories.full_closing}
                          </div>
                        </div>
                        <div className={`${getProbabilityBg(prediction.predictions[0].probabilities.delay)} rounded-lg p-4`}>
                          <div className="text-sm font-cormorant text-gray-600 mb-1">Delay</div>
                          <div className={`text-3xl font-bold font-cormorant ${getProbabilityColor(prediction.predictions[0].probabilities.delay)}`}>
                            {prediction.predictions[0].probabilities.delay}%
                          </div>
                          <div className="text-xs font-cormorant text-gray-600 mt-2">
                            {prediction.predictions[0].categories.delay}
                          </div>
                        </div>
                        <div className={`${getProbabilityBg(prediction.predictions[0].probabilities.early_dismissal)} rounded-lg p-4`}>
                          <div className="text-sm font-cormorant text-gray-600 mb-1">Early Dismissal</div>
                          <div className={`text-3xl font-bold font-cormorant ${getProbabilityColor(prediction.predictions[0].probabilities.early_dismissal)}`}>
                            {prediction.predictions[0].probabilities.early_dismissal}%
                          </div>
                          <div className="text-xs font-cormorant text-gray-600 mt-2">
                            {prediction.predictions[0].categories.early_dismissal}
                          </div>
                        </div>
                      </div>
                      <div className="bg-[var(--offWhite)] rounded-lg p-4 mb-4">
                        <h4 className="font-bold font-cormorant text-[var(--darkBlue)] mb-3">Forecast</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-gray-600 font-cormorant">Temperature</div>
                            <div className="font-bold font-cormorant">{prediction.predictions[0].forecast.temperature_f}°F</div>
                          </div>
                          <div>
                            <div className="text-gray-600 font-cormorant">Snowfall</div>
                            <div className="font-bold font-cormorant">{prediction.predictions[0].forecast.snowfall_inches}"</div>
                          </div>
                          <div>
                            <div className="text-gray-600 font-cormorant">Wind Speed</div>
                            <div className="font-bold font-cormorant">{prediction.predictions[0].forecast.wind_speed_mph} mph</div>
                          </div>
                          <div>
                            <div className="text-gray-600 font-cormorant">Conditions</div>
                            <div className="font-bold font-cormorant">{prediction.predictions[0].forecast.condition}</div>
                          </div>
                        </div>
                      </div>
                      <div className="text-sm font-cormorant text-gray-600">
                        Confidence: <span className="font-bold">{prediction.predictions[0].confidence}%</span>
                      </div>
                    </div>
                  )}

                  {/* Week ahead predictions (days 2-8) */}
                  {prediction.predictions.length > 1 && (
                    <div>
                      <h3 className="text-xl font-bold font-cormorant text-[var(--darkBlue)] mb-4">
                        Week Ahead
                      </h3>
                      <div className="space-y-4">
                        {prediction.predictions.slice(1).map((dayPred, index) => (
                          <div key={index} className="bg-[var(--offWhite)] rounded-lg p-4 border border-gray-200">
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="font-bold font-cormorant text-[var(--darkBlue)]">
                                {new Date(dayPred.predicted_for_date).toLocaleDateString('en-US', { 
                                  weekday: 'long', 
                                  month: 'short', 
                                  day: 'numeric' 
                                })}
                              </h4>
                              <span className="text-xs font-cormorant text-gray-600">
                                Confidence: {dayPred.confidence}%
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-3 mb-3">
                              <div>
                                <div className="text-xs font-cormorant text-gray-600">Closing</div>
                                <div className={`text-lg font-bold font-cormorant ${getProbabilityColor(dayPred.probabilities.full_closing)}`}>
                                  {dayPred.probabilities.full_closing}%
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-cormorant text-gray-600">Delay</div>
                                <div className={`text-lg font-bold font-cormorant ${getProbabilityColor(dayPred.probabilities.delay)}`}>
                                  {dayPred.probabilities.delay}%
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-cormorant text-gray-600">Early Out</div>
                                <div className={`text-lg font-bold font-cormorant ${getProbabilityColor(dayPred.probabilities.early_dismissal)}`}>
                                  {dayPred.probabilities.early_dismissal}%
                                </div>
                              </div>
                            </div>
                            <div className="text-xs font-cormorant text-gray-600">
                              {dayPred.forecast.temperature_f}°F • {dayPred.forecast.snowfall_inches}" snow • {dayPred.forecast.condition}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Single-day prediction (backward compatibility) */
                <>
                  <p className="text-gray-600 font-cormorant mb-6">
                    Prediction for {prediction.predicted_for_date && new Date(prediction.predicted_for_date).toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                  {prediction.probabilities && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className={`${getProbabilityBg(prediction.probabilities.full_closing)} rounded-lg p-4`}>
                          <div className="text-sm font-cormorant text-gray-600 mb-1">Full Closing</div>
                          <div className={`text-3xl font-bold font-cormorant ${getProbabilityColor(prediction.probabilities.full_closing)}`}>
                            {prediction.probabilities.full_closing}%
                          </div>
                          <div className="text-xs font-cormorant text-gray-600 mt-2">
                            {prediction.categories?.full_closing}
                          </div>
                        </div>
                        <div className={`${getProbabilityBg(prediction.probabilities.delay)} rounded-lg p-4`}>
                          <div className="text-sm font-cormorant text-gray-600 mb-1">Delay</div>
                          <div className={`text-3xl font-bold font-cormorant ${getProbabilityColor(prediction.probabilities.delay)}`}>
                            {prediction.probabilities.delay}%
                          </div>
                          <div className="text-xs font-cormorant text-gray-600 mt-2">
                            {prediction.categories?.delay}
                          </div>
                        </div>
                        <div className={`${getProbabilityBg(prediction.probabilities.early_dismissal)} rounded-lg p-4`}>
                          <div className="text-sm font-cormorant text-gray-600 mb-1">Early Dismissal</div>
                          <div className={`text-3xl font-bold font-cormorant ${getProbabilityColor(prediction.probabilities.early_dismissal)}`}>
                            {prediction.probabilities.early_dismissal}%
                          </div>
                          <div className="text-xs font-cormorant text-gray-600 mt-2">
                            {prediction.categories?.early_dismissal}
                          </div>
                        </div>
                      </div>
                      {prediction.forecast && (
                        <div className="bg-[var(--offWhite)] rounded-lg p-4 mb-6">
                          <h3 className="font-bold font-cormorant text-[var(--darkBlue)] mb-3">Current Forecast</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <div className="text-gray-600 font-cormorant">Temperature</div>
                              <div className="font-bold font-cormorant">{prediction.forecast.temperature_f}°F</div>
                            </div>
                            <div>
                              <div className="text-gray-600 font-cormorant">Snowfall</div>
                              <div className="font-bold font-cormorant">{prediction.forecast.snowfall_inches}"</div>
                            </div>
                            <div>
                              <div className="text-gray-600 font-cormorant">Wind Speed</div>
                              <div className="font-bold font-cormorant">{prediction.forecast.wind_speed_mph} mph</div>
                            </div>
                            <div>
                              <div className="text-gray-600 font-cormorant">Conditions</div>
                              <div className="font-bold font-cormorant">{prediction.forecast.condition}</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {prediction.factors && prediction.factors.length > 0 && (
                        <div className="mb-4">
                          <h3 className="font-bold font-cormorant text-[var(--darkBlue)] mb-2">Factors Considered</h3>
                          <ul className="list-disc list-inside space-y-1 text-sm font-cormorant text-gray-700">
                            {prediction.factors.map((factor, index) => (
                              <li key={index}>{factor}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {prediction.confidence !== undefined && (
                        <div className="text-sm font-cormorant text-gray-600">
                          Confidence: <span className="font-bold">{prediction.confidence}%</span>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Road Safety Map */}
          <div className="bg-white rounded-lg shadow-md p-6 mt-8 border border-[var(--gold)]/30">
            <VermontRoadSafetyMap />
          </div>
        </div>
      </div>
    </div>
  );
}

