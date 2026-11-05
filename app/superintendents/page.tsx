"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import SnowDayPredictionResults, {
  type SnowDayPredictionResponse,
} from "@/components/SnowDayPredictionResults";
import {
  VERMONT_HIGH_SCHOOLS,
  VERMONT_HIGH_SCHOOL_COUNTIES,
} from "@/lib/vermontHighSchools";
import { parseAnnounceByTime } from "@/lib/superintendentInput";

const VermontRoadSafetyMap = dynamic(() => import("@/components/VermontRoadSafetyMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] bg-gray-100 rounded-lg flex items-center justify-center">
      <p className="text-gray-600 font-cormorant">Loading map...</p>
    </div>
  ),
});

function ChipList({
  items,
  onRemove,
}: {
  items: string[];
  onRemove: (value: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onRemove(item)}
          className="px-3 py-1 bg-[var(--darkBlue)]/10 text-[var(--darkBlue)] font-cormorant text-base rounded border border-[var(--darkBlue)]/20 hover:bg-[var(--darkBlue)]/20"
        >
          {item} ×
        </button>
      ))}
    </div>
  );
}

function addUnique(list: string[], value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return list;
  if (list.some((x) => x.toLowerCase() === trimmed.toLowerCase())) return list;
  return [...list, trimmed];
}

const inputClass =
  "w-full px-4 py-3 border border-gray-200 rounded focus:outline-none focus:border-[var(--gold)] bg-white text-base font-caveat placeholder-gray-400";

function optionalThreshold(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

export default function SuperintendentsPage() {
  const highSchoolsByCounty = useMemo(() => {
    return VERMONT_HIGH_SCHOOL_COUNTIES.map((county) => ({
      county,
      schools: VERMONT_HIGH_SCHOOLS.filter((hs) => hs.county === county).sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    })).filter((g) => g.schools.length > 0);
  }, []);

  const [district, setDistrict] = useState("");
  const [highSchool, setHighSchool] = useState("");
  const [customHighSchool, setCustomHighSchool] = useState("");
  const [feederTowns, setFeederTowns] = useState<string[]>([]);
  const [feederTownDraft, setFeederTownDraft] = useState("");
  const [feederZips, setFeederZips] = useState<string[]>([]);
  const [feederZipDraft, setFeederZipDraft] = useState("");
  const [corridors, setCorridors] = useState<string[]>([]);
  const [corridorDraft, setCorridorDraft] = useState("");
  const [announceBy, setAnnounceBy] = useState("5:15");
  const [fullClosingSnow, setFullClosingSnow] = useState("");
  const [delaySnow, setDelaySnow] = useState("");
  const [iceThreshold, setIceThreshold] = useState("");
  const [tempThreshold, setTempThreshold] = useState("");
  const [windThreshold, setWindThreshold] = useState("");
  const [plowStatus, setPlowStatus] = useState<
    "unknown" | "behind" | "on_track" | "clear"
  >("unknown");
  const [knownIceSpots, setKnownIceSpots] = useState(false);
  const [parentReports, setParentReports] = useState(false);
  const [terrain, setTerrain] = useState<"urban" | "rural" | "mountain">("rural");
  const [morningNotes, setMorningNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<SnowDayPredictionResponse | null>(null);

  const selectedCampus = VERMONT_HIGH_SCHOOLS.find((h) => h.name === highSchool);

  const applyCampusDefaults = (name: string) => {
    setHighSchool(name);
    const campus = VERMONT_HIGH_SCHOOLS.find((h) => h.name === name);
    if (!campus) return;
    setDistrict(campus.city);
    // Main morning corridors into this high school (superintendent can still add more)
    setCorridors([...campus.approachCorridors]);
    setFeederZips(campus.zip ? [campus.zip] : []);
    if (campus.feederTowns?.length) {
      setFeederTowns([...campus.feederTowns]);
    } else {
      setFeederTowns([campus.city]);
    }
  };

  const handlePredict = async (e: FormEvent) => {
    e.preventDefault();
    const districtValue =
      district.trim() || selectedCampus?.city || customHighSchool.trim();
    if (!districtValue) {
      setError("Enter a district name, city, or ZIP — or pick a high school.");
      return;
    }

    setLoading(true);
    setError(null);
    setPrediction(null);

    const resolvedHighSchool = customHighSchool.trim() || highSchool || undefined;

    try {
      // Same /api/snow-day/predict service as the snow page — POST with superintendent overrides
      const response = await fetch("/api/snow-day/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district: districtValue,
          multiDay: true,
          superintendent: {
            highSchool: resolvedHighSchool,
            feederTowns,
            feederZips,
            priorityCorridors: corridors,
            announceByHour: parseAnnounceByTime(announceBy),
            thresholds: {
              fullClosingSnow: optionalThreshold(fullClosingSnow),
              delaySnow: optionalThreshold(delaySnow),
              ice: optionalThreshold(iceThreshold),
              tempF: optionalThreshold(tempThreshold),
              windMph: optionalThreshold(windThreshold),
            },
            morningNotes: morningNotes.trim() || undefined,
            plowStatus,
            knownIceSpots,
            parentReports,
            terrain,
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
      console.error("Superintendent snow day prediction error:", err);
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
            Superintendents Snow Day
          </h1>
          <p className="text-lg font-cormorant text-gray-700 mb-8">
            Same engine as the student/teacher calculator: district high school(s) → main morning
            corridors → VTrans RWIS pavement quality + sky/weather APIs. Add your thresholds and
            morning notes to refine the call.
          </p>

          <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-[var(--gold)]/30">
            <form onSubmit={handlePredict} className="space-y-8">
              <section className="space-y-4">
                <h2 className="text-2xl font-bold font-cormorant text-[var(--darkBlue)]">
                  District & high school
                </h2>
                <div>
                  <label className="block font-cormorant text-base text-gray-700 mb-1">
                    District / city / ZIP
                  </label>
                  <input
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="e.g. Champlain Valley, Burlington, 05401"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block font-cormorant text-base text-gray-700 mb-1">
                    High school (by county)
                  </label>
                  <select
                    value={highSchool}
                    onChange={(e) => applyCampusDefaults(e.target.value)}
                    className={`${inputClass} font-cormorant`}
                  >
                    <option value="">Select a Vermont high school…</option>
                    {highSchoolsByCounty.map((group) => (
                      <optgroup key={group.county} label={`${group.county} County`}>
                        {group.schools.map((hs) => (
                          <option key={hs.name} value={hs.name}>
                            {hs.name} ({hs.zip})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {selectedCampus && (
                    <p className="mt-2 text-base font-cormorant text-gray-600">
                      Prefills main morning corridors for {selectedCampus.name}. You can add
                      more roads below.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block font-cormorant text-base text-gray-700 mb-1">
                    Or type high school name
                  </label>
                  <input
                    type="text"
                    value={customHighSchool}
                    onChange={(e) => setCustomHighSchool(e.target.value)}
                    placeholder="If not in the list"
                    className={inputClass}
                  />
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold font-cormorant text-[var(--darkBlue)]">
                  Feeder towns & ZIPs
                </h2>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={feederTownDraft}
                    onChange={(e) => setFeederTownDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setFeederTowns(addUnique(feederTowns, feederTownDraft));
                        setFeederTownDraft("");
                      }
                    }}
                    placeholder="Add feeder town"
                    className={`flex-1 ${inputClass}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setFeederTowns(addUnique(feederTowns, feederTownDraft));
                      setFeederTownDraft("");
                    }}
                    className="px-6 py-3 bg-[var(--gold)] text-[var(--darkBlue)] font-caveat rounded hover:bg-[var(--goldDark)] font-medium text-base transition-colors"
                  >
                    Add
                  </button>
                </div>
                <ChipList
                  items={feederTowns}
                  onRemove={(v) => setFeederTowns(feederTowns.filter((t) => t !== v))}
                />
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={feederZipDraft}
                    onChange={(e) => setFeederZipDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setFeederZips(addUnique(feederZips, feederZipDraft));
                        setFeederZipDraft("");
                      }
                    }}
                    placeholder="Add feeder ZIP"
                    className={`flex-1 ${inputClass}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setFeederZips(addUnique(feederZips, feederZipDraft));
                      setFeederZipDraft("");
                    }}
                    className="px-6 py-3 bg-[var(--gold)] text-[var(--darkBlue)] font-caveat rounded hover:bg-[var(--goldDark)] font-medium text-base transition-colors"
                  >
                    Add
                  </button>
                </div>
                <ChipList
                  items={feederZips}
                  onRemove={(v) => setFeederZips(feederZips.filter((z) => z !== v))}
                />
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold font-cormorant text-[var(--darkBlue)]">
                  Main morning corridors into school
                </h2>
                <p className="text-base font-cormorant text-gray-600">
                  Default roads students travel into this high school for snow-day scoring. Matched
                  first against live VTrans pavement sensors. Add any extra local / side roads your
                  buses use.
                </p>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={corridorDraft}
                    onChange={(e) => setCorridorDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setCorridors(addUnique(corridors, corridorDraft));
                        setCorridorDraft("");
                      }
                    }}
                    placeholder="e.g. VT-116, US-7, Shelburne Road"
                    className={`flex-1 ${inputClass}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCorridors(addUnique(corridors, corridorDraft));
                      setCorridorDraft("");
                    }}
                    className="px-6 py-3 bg-[var(--gold)] text-[var(--darkBlue)] font-caveat rounded hover:bg-[var(--goldDark)] font-medium text-base transition-colors"
                  >
                    Add
                  </button>
                </div>
                <ChipList
                  items={corridors}
                  onRemove={(v) => setCorridors(corridors.filter((c) => c !== v))}
                />
              </section>

              <section className="grid md:grid-cols-2 gap-6">
                <div>
                  <h2 className="text-2xl font-bold font-cormorant text-[var(--darkBlue)] mb-3">
                    Decision window
                  </h2>
                  <label className="block font-cormorant text-base text-gray-700 mb-1">
                    Announce-by time (morning)
                  </label>
                  <input
                    type="text"
                    value={announceBy}
                    onChange={(e) => setAnnounceBy(e.target.value)}
                    placeholder="5:15"
                    className={inputClass}
                  />
                </div>
                <div>
                  <h2 className="text-2xl font-bold font-cormorant text-[var(--darkBlue)] mb-3">
                    District character
                  </h2>
                  <div className="flex flex-col gap-2 font-cormorant text-lg">
                    {(
                      [
                        ["urban", "Urban — city plows, shorter routes"],
                        ["rural", "Rural — long bus routes, drifting"],
                        ["mountain", "Mountain — elevation / ice sensitive"],
                      ] as const
                    ).map(([value, label]) => (
                      <label key={value} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="terrain"
                          checked={terrain === value}
                          onChange={() => setTerrain(value)}
                          className="w-4 h-4"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold font-cormorant text-[var(--darkBlue)]">
                      Adjust closing thresholds
                    </h2>
                    <p className="font-cormorant text-base text-gray-600 mt-1">
                      Optional. Leave a field blank and it uses the system baseline: 6&quot; full close, 3&quot; delay, 0.25&quot; ice, 10°F, 30 mph.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFullClosingSnow("");
                      setDelaySnow("");
                      setIceThreshold("");
                      setTempThreshold("");
                      setWindThreshold("");
                    }}
                    className="font-cormorant text-base text-[var(--darkBlue)] underline underline-offset-2 hover:text-[var(--neutralBlue)]"
                  >
                    Use system baselines
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <label className="block font-cormorant text-sm text-gray-600 mb-1">
                      Full close snow (in)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={fullClosingSnow}
                      placeholder="6"
                      onChange={(e) => setFullClosingSnow(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block font-cormorant text-sm text-gray-600 mb-1">
                      Delay snow (in)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={delaySnow}
                      placeholder="3"
                      onChange={(e) => setDelaySnow(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block font-cormorant text-sm text-gray-600 mb-1">
                      Ice (in)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      value={iceThreshold}
                      placeholder="0.25"
                      onChange={(e) => setIceThreshold(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block font-cormorant text-sm text-gray-600 mb-1">
                      Temp (°F)
                    </label>
                    <input
                      type="number"
                      value={tempThreshold}
                      placeholder="10"
                      onChange={(e) => setTempThreshold(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block font-cormorant text-sm text-gray-600 mb-1">
                      Wind (mph)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={windThreshold}
                      placeholder="30"
                      onChange={(e) => setWindThreshold(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold font-cormorant text-[var(--darkBlue)]">
                  This morning&apos;s notes
                </h2>
                <div>
                  <label className="block font-cormorant text-base text-gray-700 mb-2">
                    Plow status
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-cormorant text-base">
                    {(
                      [
                        ["unknown", "Unknown"],
                        ["behind", "Behind"],
                        ["on_track", "On track"],
                        ["clear", "Clear"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPlowStatus(value)}
                        className={`px-3 py-3 rounded border ${
                          plowStatus === value
                            ? "bg-[var(--gold)] text-[var(--darkBlue)] border-[var(--gold)] font-semibold"
                            : "bg-white text-gray-800 border-gray-200 hover:border-[var(--gold)]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 font-cormorant text-lg">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={knownIceSpots}
                      onChange={(e) => setKnownIceSpots(e.target.checked)}
                      className="w-5 h-5"
                    />
                    Known ice spots on bus routes
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={parentReports}
                      onChange={(e) => setParentReports(e.target.checked)}
                      className="w-5 h-5"
                    />
                    Parent / community hazard reports
                  </label>
                </div>
                <div>
                  <label className="block font-cormorant text-base text-gray-700 mb-1">
                    Freeform notes (road crew, principals, parents)
                  </label>
                  <textarea
                    value={morningNotes}
                    onChange={(e) => setMorningNotes(e.target.value)}
                    rows={4}
                    placeholder="e.g. VT-116 still drifting north of Hinesburg; crew says secondary roads won't be clear until 7:30."
                    className={`${inputClass} font-cormorant`}
                  />
                </div>
              </section>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 bg-[var(--gold)] text-[var(--darkBlue)] font-caveat rounded hover:bg-[var(--goldDark)] disabled:opacity-50 disabled:cursor-not-allowed font-medium text-xl transition-colors"
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

          {prediction && (
            <SnowDayPredictionResults prediction={prediction} showFactors />
          )}

          <div className="bg-white rounded-lg shadow-md p-6 mt-8 border border-[var(--gold)]/30">
            <VermontRoadSafetyMap />
          </div>
        </div>
      </div>
    </div>
  );
}
