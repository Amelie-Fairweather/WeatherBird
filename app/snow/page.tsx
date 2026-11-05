"use client";

import Link from "next/link";
import { useState } from "react";
import dynamic from "next/dynamic";
import SnowDayPredictionResults, {
  type SnowDayPredictionResponse,
} from "@/components/SnowDayPredictionResults";

const VermontRoadSafetyMap = dynamic(() => import("@/components/VermontRoadSafetyMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] bg-gray-100 rounded-lg flex items-center justify-center">
      <p className="text-gray-600 font-cormorant">Loading map...</p>
    </div>
  ),
});

export default function SnowPage() {
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<SnowDayPredictionResponse | null>(null);
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
      const response = await fetch(
        `/api/snow-day/predict?district=${encodeURIComponent(location.trim())}`
      );
      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || data.details || "Failed to get prediction";
        throw new Error(errorMsg);
      }

      if (!data || (!data.predictions && !data.probabilities)) {
        throw new Error("Unable to generate predictions - no prediction data returned");
      }

      setPrediction(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
      console.error("Snow day prediction error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--offWhite)]">
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
            href="/superintendents"
            className="px-4 py-2 bg-[var(--neutralBlue)] text-white rounded-lg hover:bg-[var(--neutralBlueDark)] transition-colors font-cormorant font-bold"
          >
            SUPERINTENDENTS
          </Link>
        </div>
      </div>

      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-bold font-cormorant text-[var(--darkBlue)] mb-2">
            Snow Day Calculator
          </h1>
          <p className="text-lg font-cormorant text-gray-700 mb-8">
            Enter a district, city, or ZIP. We find the high school(s), check the main roads
            feeding into campus with VTrans RWIS pavement data, and combine that with sky/weather
            APIs for a closing / delay call.
          </p>

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

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 font-cormorant font-semibold mb-2">
                ⚠️ Unable to generate predictions
              </p>
              <p className="text-red-700 font-cormorant">{error}</p>
              <p className="text-red-600 font-cormorant text-sm mt-2 italic">
                Please check your input and try again. If the problem persists, the weather service
                may be temporarily unavailable.
              </p>
            </div>
          )}

          {prediction && <SnowDayPredictionResults prediction={prediction} />}

          <div className="bg-white rounded-lg shadow-md p-6 mt-8 border border-[var(--gold)]/30">
            <VermontRoadSafetyMap />
          </div>
        </div>
      </div>
    </div>
  );
}
