"use client";

export interface StudentRoutesInfo {
  summary: string;
  passable: boolean;
  routeHazardScore: number;
  highSchools: Array<{
    name: string;
    city: string;
    approachCorridors: string[];
  }>;
  corridorSensors: Array<{
    stationName: string;
    route: string;
    distanceMiles: number;
    condition: string;
    pavementTemperature?: number;
    surfaceFriction?: number;
    onNamedCorridor: boolean;
  }>;
}

export interface ScoreLine {
  label: string;
  detail: string;
}

export interface UserScoreBreakdown {
  call: string;
  why: string;
  lines: ScoreLine[];
}

export interface DayPrediction {
  predicted_for_date: string;
  probabilities: {
    full_closing: number;
    delay: number;
    early_dismissal: number;
    p_closed?: number;
    p_delay?: number;
    p_open?: number;
  };
  categories: {
    decision?: string;
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
  primary_reason?: string;
  training_rationale?: string;
  user_breakdown?: UserScoreBreakdown;
  scoring_breakdown?: {
    weather_score: number;
    corridor_rwis_hazard: number;
    blended_final_score: number;
    guards_applied: string[];
  };
  studentRoutes?: StudentRoutesInfo;
}

export interface SnowDayPredictionResponse {
  district: string;
  multiDay?: boolean;
  predicted_for_date?: string;
  probabilities?: DayPrediction["probabilities"];
  categories?: DayPrediction["categories"];
  confidence?: number;
  forecast?: DayPrediction["forecast"];
  factors?: string[];
  primary_reason?: string;
  user_breakdown?: UserScoreBreakdown;
  studentRoutes?: StudentRoutesInfo;
  thresholds?: {
    full_closing_snowfall: number;
    delay_snowfall: number;
    ice_threshold: number;
  } | null;
  predictions?: DayPrediction[];
}

export function getProbabilityColor(probability: number): string {
  if (probability >= 75) return "text-red-600";
  if (probability >= 55) return "text-orange-600";
  if (probability > 0) return "text-yellow-600";
  return "text-green-600";
}

export function getProbabilityBg(probability: number): string {
  if (probability >= 75) return "bg-red-100";
  if (probability >= 55) return "bg-orange-100";
  if (probability > 0) return "bg-yellow-100";
  return "bg-green-100";
}

export function DecisionBreakdown({
  breakdown,
  fallbackCall,
  fallbackWhy,
}: {
  breakdown?: UserScoreBreakdown;
  fallbackCall?: string;
  fallbackWhy?: string;
}) {
  const call = breakdown?.call || fallbackCall;
  const why = breakdown?.why || fallbackWhy;
  if (!call && !why && !breakdown?.lines?.length) return null;

  return (
    <div className="mb-6 rounded-lg border border-[var(--darkBlue)]/20 bg-[var(--offWhite)] px-5 py-4">
      {call && (
        <>
          <div className="text-sm font-cormorant text-gray-600">Call</div>
          <div className="text-2xl font-bold font-cormorant text-[var(--darkBlue)] mb-2">
            {call}
          </div>
        </>
      )}
      {why && (
        <p className="text-base font-cormorant text-gray-800 leading-relaxed mb-4">{why}</p>
      )}
      {breakdown?.lines && breakdown.lines.length > 0 && (
        <dl className="space-y-2">
          {breakdown.lines.map((line) => (
            <div key={line.label} className="grid grid-cols-[7.5rem_1fr] gap-3 text-base">
              <dt className="font-semibold font-cormorant text-[var(--darkBlue)]">{line.label}</dt>
              <dd className="font-cormorant text-gray-800 leading-snug">{line.detail}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function StudentRoutesPanel({ routes }: { routes: StudentRoutesInfo }) {
  const hazardColor =
    routes.routeHazardScore >= 55
      ? "border-red-300 bg-red-50"
      : routes.routeHazardScore >= 30
        ? "border-amber-300 bg-amber-50"
        : "border-emerald-300 bg-emerald-50";

  return (
    <div className={`rounded-lg p-5 mb-4 border ${hazardColor}`}>
      <h4 className="font-bold font-cormorant text-[var(--darkBlue)] mb-2 text-lg">
        Schools &amp; main roads (VTrans RWIS)
      </h4>
      <p className="text-sm font-cormorant text-gray-600 mb-2">
        District schools → morning corridors into campus → pavement / friction from VTrans, combined
        with sky/weather APIs above.
      </p>
      <p className="text-base font-cormorant text-gray-800 mb-3 leading-relaxed">
        {routes.summary}
      </p>
      {routes.highSchools.length > 0 && (
        <div className="mb-3 space-y-2">
          {routes.highSchools.map((hs) => (
            <div key={hs.name} className="text-base font-cormorant text-gray-800">
              <span className="font-semibold">{hs.name}</span>
              <span className="text-gray-600"> ({hs.city})</span>
              <div className="text-gray-600 mt-1">
                Approach corridors: {hs.approachCorridors.slice(0, 5).join(", ")}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="text-base font-cormorant text-gray-700 mb-2">
        Route hazard: <span className="font-bold">{routes.routeHazardScore}/100</span>
        {" · "}
        {routes.passable ? "Corridors look passable" : "Corridors look unsafe for buses"}
      </div>
      {routes.corridorSensors.length > 0 && (
        <ul className="space-y-2 text-base font-cormorant text-gray-800">
          {routes.corridorSensors.slice(0, 5).map((s, idx) => (
            <li key={`${s.stationName}-${idx}`}>
              <span className="font-semibold">{s.stationName}</span>
              {" — "}
              {s.distanceMiles} mi
              {s.onNamedCorridor ? " (student corridor)" : ""}
              {" — "}
              {s.condition}
              {s.surfaceFriction !== undefined ? ` · μ=${s.surfaceFriction.toFixed(2)}` : ""}
              {s.pavementTemperature !== undefined
                ? ` · pavement ${Math.round(s.pavementTemperature)}°F`
                : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SnowDayPredictionResults({
  prediction,
  showFactors = false,
}: {
  prediction: SnowDayPredictionResponse;
  showFactors?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-[var(--gold)]/30">
      <div className="mb-6">
        <h2 className="text-2xl font-bold font-cormorant text-[var(--darkBlue)] mb-2">
          {prediction.district}
        </h2>
      </div>

      {prediction.multiDay && prediction.predictions && prediction.predictions.length > 0 ? (
        <>
          {prediction.predictions[0] && (
            <div className="mb-8 pb-8 border-b-2 border-[var(--gold)]">
              <h3 className="text-xl font-bold font-cormorant text-[var(--darkBlue)] mb-4">
                Tomorrow:{" "}
                {new Date(prediction.predictions[0].predicted_for_date).toLocaleDateString(
                  "en-US",
                  {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }
                )}
              </h3>
              <DecisionBreakdown
                breakdown={prediction.predictions[0].user_breakdown}
                fallbackCall={prediction.predictions[0].categories.decision}
                fallbackWhy={prediction.predictions[0].primary_reason}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div
                  className={`${getProbabilityBg(prediction.predictions[0].probabilities.full_closing)} rounded-lg p-5`}
                >
                  <div className="text-base font-cormorant text-gray-600 mb-1">Full Closing</div>
                  <div
                    className={`text-4xl font-bold font-cormorant ${getProbabilityColor(prediction.predictions[0].probabilities.full_closing)}`}
                  >
                    {prediction.predictions[0].probabilities.full_closing}%
                  </div>
                </div>
                <div
                  className={`${getProbabilityBg(prediction.predictions[0].probabilities.delay)} rounded-lg p-5`}
                >
                  <div className="text-base font-cormorant text-gray-600 mb-1">Delay</div>
                  <div
                    className={`text-4xl font-bold font-cormorant ${getProbabilityColor(prediction.predictions[0].probabilities.delay)}`}
                  >
                    {prediction.predictions[0].probabilities.delay}%
                  </div>
                </div>
                <div
                  className={`${getProbabilityBg(prediction.predictions[0].probabilities.early_dismissal)} rounded-lg p-5`}
                >
                  <div className="text-base font-cormorant text-gray-600 mb-1">Early Dismissal</div>
                  <div
                    className={`text-4xl font-bold font-cormorant ${getProbabilityColor(prediction.predictions[0].probabilities.early_dismissal)}`}
                  >
                    {prediction.predictions[0].probabilities.early_dismissal}%
                  </div>
                </div>
              </div>
              <div className="bg-[var(--offWhite)] rounded-lg p-5 mb-4">
                <h4 className="font-bold font-cormorant text-[var(--darkBlue)] mb-3 text-lg">
                  Forecast
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-base">
                  <div>
                    <div className="text-gray-600 font-cormorant">Temperature</div>
                    <div className="font-bold font-cormorant text-xl">
                      {prediction.predictions[0].forecast.temperature_f}°F
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600 font-cormorant">Snowfall</div>
                    <div className="font-bold font-cormorant text-xl">
                      {prediction.predictions[0].forecast.snowfall_inches}&quot;
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600 font-cormorant">Wind Speed</div>
                    <div className="font-bold font-cormorant text-xl">
                      {prediction.predictions[0].forecast.wind_speed_mph} mph
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600 font-cormorant">Conditions</div>
                    <div className="font-bold font-cormorant text-lg">
                      {prediction.predictions[0].forecast.condition}
                    </div>
                  </div>
                </div>
              </div>
              {prediction.predictions[0].studentRoutes && (
                <StudentRoutesPanel routes={prediction.predictions[0].studentRoutes} />
              )}
              {showFactors && prediction.predictions[0].factors?.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-bold font-cormorant text-[var(--darkBlue)] mb-2 text-lg">
                    Factors Considered
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-base font-cormorant text-gray-700">
                    {prediction.predictions[0].factors.slice(0, 12).map((factor, index) => (
                      <li key={index}>{factor}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="text-base font-cormorant text-gray-600">
                Confidence:{" "}
                <span className="font-bold">{prediction.predictions[0].confidence}%</span>
              </div>
            </div>
          )}

          {prediction.predictions.length > 1 && (
            <div>
              <h3 className="text-xl font-bold font-cormorant text-[var(--darkBlue)] mb-4">
                Week Ahead
              </h3>
              <div className="space-y-4">
                {prediction.predictions.slice(1).map((dayPred, index) => (
                  <div
                    key={index}
                    className="bg-[var(--offWhite)] rounded-lg p-5 border border-gray-200"
                  >
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-bold font-cormorant text-[var(--darkBlue)] text-lg">
                        {new Date(dayPred.predicted_for_date).toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "short",
                          day: "numeric",
                        })}
                      </h4>
                      <span className="text-base font-cormorant text-gray-600">
                        Confidence: {dayPred.confidence}%
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <div className="text-base font-cormorant text-gray-600">Closing</div>
                        <div
                          className={`text-2xl font-bold font-cormorant ${getProbabilityColor(dayPred.probabilities.full_closing)}`}
                        >
                          {dayPred.probabilities.full_closing}%
                        </div>
                      </div>
                      <div>
                        <div className="text-base font-cormorant text-gray-600">Delay</div>
                        <div
                          className={`text-2xl font-bold font-cormorant ${getProbabilityColor(dayPred.probabilities.delay)}`}
                        >
                          {dayPred.probabilities.delay}%
                        </div>
                      </div>
                      <div>
                        <div className="text-base font-cormorant text-gray-600">Early Out</div>
                        <div
                          className={`text-2xl font-bold font-cormorant ${getProbabilityColor(dayPred.probabilities.early_dismissal)}`}
                        >
                          {dayPred.probabilities.early_dismissal}%
                        </div>
                      </div>
                    </div>
                    {(dayPred.user_breakdown?.call || dayPred.categories.decision) && (
                      <div className="text-base font-cormorant text-[var(--darkBlue)] font-semibold mb-1">
                        {dayPred.user_breakdown?.call || dayPred.categories.decision}
                      </div>
                    )}
                    {dayPred.user_breakdown?.why && (
                      <p className="text-base font-cormorant text-gray-800 mb-2 leading-snug">
                        {dayPred.user_breakdown.why}
                      </p>
                    )}
                    <div className="text-base font-cormorant text-gray-600">
                      {dayPred.forecast.temperature_f}°F • {dayPred.forecast.snowfall_inches}&quot;
                      snow • {dayPred.forecast.condition}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-gray-600 font-cormorant mb-6">
            Prediction for{" "}
            {prediction.predicted_for_date &&
              new Date(prediction.predicted_for_date).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
          </p>
          {prediction.probabilities && (
            <>
              <DecisionBreakdown
                breakdown={prediction.user_breakdown}
                fallbackCall={prediction.categories?.decision}
                fallbackWhy={prediction.primary_reason}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div
                  className={`${getProbabilityBg(prediction.probabilities.full_closing)} rounded-lg p-5`}
                >
                  <div className="text-base font-cormorant text-gray-600 mb-1">Full Closing</div>
                  <div
                    className={`text-4xl font-bold font-cormorant ${getProbabilityColor(prediction.probabilities.full_closing)}`}
                  >
                    {prediction.probabilities.full_closing}%
                  </div>
                </div>
                <div className={`${getProbabilityBg(prediction.probabilities.delay)} rounded-lg p-5`}>
                  <div className="text-base font-cormorant text-gray-600 mb-1">Delay</div>
                  <div
                    className={`text-4xl font-bold font-cormorant ${getProbabilityColor(prediction.probabilities.delay)}`}
                  >
                    {prediction.probabilities.delay}%
                  </div>
                </div>
                <div
                  className={`${getProbabilityBg(prediction.probabilities.early_dismissal)} rounded-lg p-5`}
                >
                  <div className="text-base font-cormorant text-gray-600 mb-1">Early Dismissal</div>
                  <div
                    className={`text-4xl font-bold font-cormorant ${getProbabilityColor(prediction.probabilities.early_dismissal)}`}
                  >
                    {prediction.probabilities.early_dismissal}%
                  </div>
                </div>
              </div>
              {prediction.forecast && (
                <div className="bg-[var(--offWhite)] rounded-lg p-5 mb-6">
                  <h3 className="font-bold font-cormorant text-[var(--darkBlue)] mb-3 text-lg">
                    Current Forecast
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-base">
                    <div>
                      <div className="text-gray-600 font-cormorant">Temperature</div>
                      <div className="font-bold font-cormorant text-xl">
                        {prediction.forecast.temperature_f}°F
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 font-cormorant">Snowfall</div>
                      <div className="font-bold font-cormorant text-xl">
                        {prediction.forecast.snowfall_inches}&quot;
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 font-cormorant">Wind Speed</div>
                      <div className="font-bold font-cormorant text-xl">
                        {prediction.forecast.wind_speed_mph} mph
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 font-cormorant">Conditions</div>
                      <div className="font-bold font-cormorant text-lg">
                        {prediction.forecast.condition}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {prediction.studentRoutes && (
                <StudentRoutesPanel routes={prediction.studentRoutes} />
              )}
              {(showFactors || prediction.factors) &&
                prediction.factors &&
                prediction.factors.length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-bold font-cormorant text-[var(--darkBlue)] mb-2 text-lg">
                      Factors Considered
                    </h3>
                    <ul className="list-disc list-inside space-y-1 text-base font-cormorant text-gray-700">
                      {prediction.factors.map((factor, index) => (
                        <li key={index}>{factor}</li>
                      ))}
                    </ul>
                  </div>
                )}
              {prediction.confidence !== undefined && (
                <div className="text-base font-cormorant text-gray-600">
                  Confidence: <span className="font-bold">{prediction.confidence}%</span>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
