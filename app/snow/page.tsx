"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import SnowDayPredictionResults, {
  type SnowDayPredictionResponse,
} from "@/components/SnowDayPredictionResults";
import {
  VERMONT_HIGH_SCHOOLS,
  VERMONT_HIGH_SCHOOL_COUNTIES,
} from "@/lib/vermontHighSchools";

const VermontRoadSafetyMap = dynamic(() => import("@/components/VermontRoadSafetyMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] bg-gray-100 rounded-lg flex items-center justify-center">
      <p className="text-gray-600 font-cormorant">Loading map...</p>
    </div>
  ),
});

export default function SnowPage() {
  const [schoolName, setSchoolName] = useState("");
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<SnowDayPredictionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const schoolsByCounty = useMemo(() => {
    return VERMONT_HIGH_SCHOOL_COUNTIES.map((county) => ({
      county,
      schools: VERMONT_HIGH_SCHOOLS.filter((hs) => hs.county === county).sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    })).filter((group) => group.schools.length > 0);
  }, []);

  const selectedSchool = VERMONT_HIGH_SCHOOLS.find((hs) => hs.name === schoolName);

  const handlePredict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool) {
      setError("Select a high school.");
      return;
    }

    setLoading(true);
    setError(null);
    setPrediction(null);

    try {
      const response = await fetch("/api/snow-day/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district: selectedSchool.zip || selectedSchool.city,
          multiDay: true,
          superintendent: {
            highSchool: selectedSchool.name,
            feederTowns: selectedSchool.feederTowns,
            feederZips: selectedSchool.zip ? [selectedSchool.zip] : undefined,
            priorityCorridors: selectedSchool.approachCorridors,
          },
        }),
      });
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
            Select a high school. We check the main roads into that campus with VTrans RWIS
            pavement data and combine that with the sky forecast for a closing / delay call.
          </p>

          <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-[var(--gold)]/30">
            <form onSubmit={handlePredict} className="flex flex-col md:flex-row gap-3">
              <label className="sr-only" htmlFor="school-select">
                High school
              </label>
              <select
                id="school-select"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="flex-1 px-4 py-3 border border-gray-200 rounded focus:outline-none focus:border-[var(--gold)] bg-white text-base font-cormorant"
              >
                <option value="">Select a high school…</option>
                {schoolsByCounty.map((group) => (
                  <optgroup key={group.county} label={`${group.county} County`}>
                    {group.schools.map((hs) => (
                      <option key={hs.name} value={hs.name}>
                        {hs.name}
                        {hs.city ? ` — ${hs.city}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
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
