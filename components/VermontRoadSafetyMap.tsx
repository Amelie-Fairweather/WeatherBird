"use client";

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

// Fix for Leaflet icon issues in Next.js
// This is required because Leaflet's default icons don't work well with Next.js SSR
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L = require('leaflet');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}

// Dynamically import Leaflet components (required for Next.js SSR)
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(mod => mod.Polyline), { ssr: false });

// Import L for creating custom icons
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let L: any;
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  L = require('leaflet');
}

interface RoadSafetyData {
  districtId: number;
  districtName: string;
  city?: string;
  county?: string;
  latitude?: number;
  longitude?: number;
  zipCodes: string[];
  safetyRating: {
    rating: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
    score: number;
    conditions: string[];
    warnings: string[];
    factors?: Record<string, unknown>;
    confidence?: number;
  } | null;
  plowCoverage?: {
    plowCount: number;
    plowDensity: number;
    safetyRating: number;
    reasoning: string;
  } | null;
}

interface PlowLocation {
  id: string;
  latitude: number;
  longitude: number;
  route?: string;
  status?: string;
}

interface DangerousRoad {
  route: string;
  condition: string;
  severity: 'low' | 'moderate' | 'high' | 'extreme';
  safetyLevel: 'excellent' | 'good' | 'caution' | 'poor' | 'hazardous';
  safetyScore: number;
  description: string;
  coordinates?: Array<[number, number]>;
  warning?: string;
  routeId?: string;
}

interface MapData {
  regions: RoadSafetyData[];
  plows: PlowLocation[];
  dangerousRoads?: DangerousRoad[];
  plowDataStatus?: string;
  plowDataNote?: string;
  timestamp: string;
}

/**
 * Get color for district safety rating (ACCURATE COLOR MAPPING)
 */
function getRatingColor(rating: string | null): string {
  if (!rating) return '#9CA3AF'; // gray for unknown
  
  switch (rating.toLowerCase()) {
    case 'excellent':
      return '#10B981'; // green - 80-100 score
    case 'good':
      return '#3B82F6'; // blue - 60-79 score
    case 'caution':
      return '#DC2626'; // Red - 40-59 score - consistent with danger color scheme
    case 'poor':
      return '#DC2626'; // Pure red - 20-39 score - same color as caution for consistency
    case 'hazardous':
      return '#991B1B'; // Deep dark red - 0-19 score - darker red for most dangerous
    default:
      return '#9CA3AF';
  }
}

/**
 * Get marker size based on safety score (ACCURATE SIZING)
 * Lower scores (worse conditions) = larger markers for visibility
 * Ensures caution, poor, and hazardous ratings are clearly visible
 */
function getRatingSize(score: number | null): number {
  if (!score) return 10;
  
  // Scale from 10 (small/excellent) to 24 (large/hazardous) based on severity
  // Invert so worse conditions = bigger markers for visibility
  // Formula: base (10) + (100 - score) * scaling factor (0.14)
  const size = 10 + (100 - score) * 0.14;
  
  // Ensure minimum sizes for visibility:
  // Hazardous (0-19): at least 22px
  // Poor (20-39): at least 18px
  // Caution (40-59): at least 14px (more visible than good/excellent)
  if (score < 20) return Math.max(22, size); // Hazardous
  if (score < 40) return Math.max(18, size); // Poor
  if (score < 60) return Math.max(14, size); // Caution - ensure good visibility
  return size; // Good (60-79) and Excellent (80-100)
}

// Component for clickable road polylines with detailed safety assessment
function RoadSafetyPolyline({ road, color, weight, opacity }: {
  road: DangerousRoad;
  color: string;
  weight: number;
  opacity: number;
}) {
  interface RoadAssessment {
    route: string;
    rating: string;
    score: number;
    conditions: string[];
    warnings: string[];
    severity?: string;
    safetyRating?: string;
    safetyScore?: number;
    criticalWarnings?: string[];
    temperatureF?: number;
    condition?: string;
    roadCondition?: string;
    factors?: {
      temperatureRisk?: { level: string; score: number };
      precipitationRisk?: { level: string; score: number };
      roadSurfaceRisk?: { level: string; score: number };
      blackIceRisk?: { level: string; score: number; probability: number };
    };
    recommendations?: Array<{ priority: string; text: string; action?: string; reasoning?: string }>;
    travelAdvice?: { recommended: boolean; urgency: string; estimatedDifficulty: string };
    dataQuality?: { confidence: number; dataSources: string[] };
    lastUpdated?: string;
  }
  const [assessment, setAssessment] = useState<RoadAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Handle click - popup opens automatically via Leaflet, load detailed assessment on first click
  const handleClick = async () => {
    // Popup opens automatically when Polyline is clicked (Leaflet default behavior)
    // On first click, load detailed assessment
    if (!assessment && !loading && !error) {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/road/safety-assessment?route=${encodeURIComponent(road.route)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.assessment) {
            setAssessment(data.assessment);
          } else {
            setError('Unable to generate predictions - no assessment data returned');
          }
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          setError(errorData.error || errorData.details || 'Unable to generate predictions');
        }
      } catch (error) {
        console.error('Error fetching road assessment:', error);
        setError('Unable to generate predictions - network error');
      } finally {
        setLoading(false);
      }
    }
  };
  
  return (
    <Polyline
      positions={road.coordinates!}
      pathOptions={{
        color: color,
        weight: weight,
        opacity: opacity,
        dashArray: '10, 5',
      }}
      eventHandlers={{
        click: handleClick,
      }}
    >
      <Popup>
        <div className="p-4 min-w-[350px] max-w-[500px]">
          {/* Always show safety score immediately - BasicRoadInfo shows it prominently */}
          {loading ? (
            <div>
              <BasicRoadInfo road={road} />
              <div className="mt-3 pt-3 border-t border-gray-300">
                <p className="text-sm text-gray-600 font-cormorant">Loading detailed assessment...</p>
              </div>
            </div>
          ) : error ? (
            <div>
              <BasicRoadInfo road={road} />
              <div className="mt-3 pt-3 border-t border-red-300">
                <p className="text-sm text-red-600 font-cormorant font-semibold">⚠️ Error:</p>
                <p className="text-sm text-red-600 font-cormorant">{error}</p>
                <p className="text-xs text-gray-500 font-cormorant mt-2">Basic safety information is still available above.</p>
              </div>
            </div>
          ) : assessment ? (
            <DetailedRoadAssessment assessment={assessment} />
          ) : (
            <BasicRoadInfo road={road} />
          )}
        </div>
      </Popup>
    </Polyline>
  );
}

function BasicRoadInfo({ road }: { road: DangerousRoad }) {
  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'excellent': return 'text-green-700';
      case 'good': return 'text-blue-700';
      case 'caution': return 'text-red-700';
      case 'poor': return 'text-red-700';
      case 'hazardous': return 'text-red-900';
      default: return 'text-gray-700';
    }
  };
  
  const getRatingBg = (rating: string) => {
    switch (rating) {
      case 'excellent': return 'bg-green-50 border-green-500';
      case 'good': return 'bg-blue-50 border-blue-500';
      case 'caution': return 'bg-red-50 border-red-500';
      case 'poor': return 'bg-red-50 border-red-500';
      case 'hazardous': return 'bg-red-100 border-red-700';
      default: return 'bg-gray-50 border-gray-500';
    }
  };
  
  // Determine safety rating description
  const getSafetyDescription = (score: number, _level: string) => {
    if (score >= 80) return 'Safe for normal travel';
    if (score >= 60) return 'Safe with normal caution';
    if (score >= 40) return 'Caution advised - moderate risk';
    if (score >= 20) return 'High risk - travel not recommended';
    return 'Extreme risk - avoid travel';
  };
  
  return (
    <>
      <h4 className="font-bold font-cormorant text-lg mb-3 text-[var(--darkBlue)]">
        {road.route}
      </h4>
      
      {/* PROMINENT SAFETY SCORE DISPLAY */}
      <div className={`inline-block px-4 py-3 rounded-lg border-3 mb-3 shadow-md w-full text-center ${getRatingBg(road.safetyLevel)}`}>
        <div className="text-center">
          <div className="text-xs font-semibold font-cormorant text-gray-600 mb-1 uppercase tracking-wide">SAFETY SCORE</div>
          <div className={`text-4xl font-bold font-cormorant ${getRatingColor(road.safetyLevel)} mb-1`}>
            {road.safetyScore}/100
          </div>
          <div className={`text-base font-bold font-cormorant ${getRatingColor(road.safetyLevel)}`}>
            {road.safetyLevel.toUpperCase()}
          </div>
        </div>
      </div>
      
      <p className="text-sm text-gray-700 font-cormorant mb-3 italic text-center">
        {getSafetyDescription(road.safetyScore, road.safetyLevel)}
      </p>
      
      <div className="mt-3 pt-3 border-t border-gray-300">
        <p className="text-sm text-gray-800 font-cormorant mb-2">
          <span className="font-semibold">Condition:</span> <span className="capitalize">{road.condition}</span>
        </p>
        <p className="text-sm text-gray-700 font-cormorant mb-2">
          {road.description}
        </p>
        {road.warning && (
          <div className="mt-2 pt-2 border-t border-gray-300">
            <p className="text-xs text-gray-700 font-cormorant font-semibold mb-1">⚠️ Warning:</p>
            <p className="text-xs text-gray-600 font-cormorant">{road.warning}</p>
          </div>
        )}
      </div>
      
      <p className="text-xs text-blue-600 font-cormorant mt-3 pt-2 border-t border-gray-200 italic text-center">
        Click again to load comprehensive safety assessment
      </p>
    </>
  );
}

interface DetailedAssessment {
  route: string;
  rating: string;
  score: number;
  conditions: string[];
  warnings: string[];
  severity?: string;
  safetyRating?: string;
  safetyScore?: number;
  criticalWarnings?: string[];
  temperatureF?: number;
  condition?: string;
  roadCondition?: string;
  factors?: {
    temperatureRisk?: { level: string; score: number };
    precipitationRisk?: { level: string; score: number };
    roadSurfaceRisk?: { level: string; score: number };
    blackIceRisk?: { level: string; score: number; probability: number };
  };
  recommendations?: Array<{ priority: string; text: string; action?: string; reasoning?: string }>;
  travelAdvice?: { recommended: boolean; urgency: string; estimatedDifficulty: string };
  dataQuality?: { confidence: number; dataSources: string[] };
  lastUpdated?: string;
}
function DetailedRoadAssessment({ assessment }: { assessment: DetailedAssessment }) {
  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'excellent': return 'text-green-700';
      case 'good': return 'text-blue-700';
      case 'caution': return 'text-red-700';
      case 'poor': return 'text-red-700';
      case 'hazardous': return 'text-red-900';
      default: return 'text-gray-700';
    }
  };
  
  const getSeverityBg = (severity: string) => {
    switch (severity) {
      case 'extreme': return 'bg-red-100 border-red-500';
      case 'high': return 'bg-red-100 border-red-500';
      case 'moderate': return 'bg-yellow-100 border-yellow-500';
      default: return 'bg-blue-100 border-blue-500';
    }
  };
  
  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <h4 className="font-bold font-cormorant text-xl mb-3 text-[var(--darkBlue)]">
          {assessment.route}
        </h4>
        {/* PROMINENT SAFETY SCORE DISPLAY */}
        <div className={`inline-block px-4 py-3 rounded-lg border-3 mb-3 shadow-md w-full text-center ${getSeverityBg(assessment.severity || assessment.rating || 'moderate')}`}>
          <div className="text-center">
            <div className="text-xs font-semibold font-cormorant text-gray-600 mb-1 uppercase tracking-wide">SAFETY SCORE</div>
            <div className={`text-4xl font-bold font-cormorant ${getRatingColor(assessment.safetyRating || assessment.rating || 'good')} mb-1`}>
              {assessment.safetyScore || assessment.score}/100
            </div>
            <div className={`text-base font-bold font-cormorant ${getRatingColor(assessment.safetyRating || assessment.rating || 'good')}`}>
              {(assessment.safetyRating || assessment.rating || 'good').toUpperCase()}
            </div>
          </div>
        </div>
      </div>
      
      {/* Critical Warnings */}
      {assessment.criticalWarnings && assessment.criticalWarnings.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-3">
          <p className="font-bold font-cormorant text-red-800 mb-2">⚠️ CRITICAL WARNINGS:</p>
          <ul className="space-y-1">
            {assessment.criticalWarnings.map((warning: string, idx: number) => (
              <li key={idx} className="text-sm text-red-700 font-cormorant">• {warning}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Current Conditions */}
      <div className="border-t pt-2">
        <p className="text-sm font-semibold font-cormorant text-gray-700 mb-1">Current Conditions:</p>
        <p className="text-sm text-gray-800 font-cormorant">
          {assessment.temperatureF && <>Temperature: <span className="font-bold">{assessment.temperatureF}°F</span> | </>}
          {assessment.condition && <>Condition: <span className="font-bold">{assessment.condition}</span> | </>}
          {assessment.roadCondition && <>Road: <span className="font-bold">{assessment.roadCondition}</span></>}
        </p>
      </div>
      
      {/* Risk Factors */}
      <div className="border-t pt-2">
        <p className="text-sm font-semibold font-cormorant text-gray-700 mb-2">Risk Factors:</p>
        <div className="space-y-2 text-xs">
          {assessment.factors?.temperatureRisk && (
            <div className="flex justify-between">
              <span className="font-cormorant">Temperature Risk:</span>
              <span className={`font-semibold font-cormorant ${assessment.factors.temperatureRisk.level === 'extreme' || assessment.factors.temperatureRisk.level === 'high' ? 'text-red-700' : 'text-gray-700'}`}>
                {assessment.factors.temperatureRisk.level.toUpperCase()} (-{assessment.factors.temperatureRisk.score}pts)
              </span>
            </div>
          )}
          {assessment.factors?.precipitationRisk && (
            <div className="flex justify-between">
              <span className="font-cormorant">Precipitation:</span>
              <span className={`font-semibold font-cormorant ${assessment.factors.precipitationRisk.level === 'extreme' || assessment.factors.precipitationRisk.level === 'high' ? 'text-red-700' : 'text-gray-700'}`}>
                {assessment.factors.precipitationRisk.level.toUpperCase()} (-{assessment.factors.precipitationRisk.score}pts)
              </span>
            </div>
          )}
          {assessment.factors?.roadSurfaceRisk && (
            <div className="flex justify-between">
              <span className="font-cormorant">Road Surface:</span>
              <span className={`font-semibold font-cormorant ${assessment.factors.roadSurfaceRisk.level === 'extreme' || assessment.factors.roadSurfaceRisk.level === 'high' ? 'text-red-700' : 'text-gray-700'}`}>
                {assessment.factors.roadSurfaceRisk.level.toUpperCase()} (-{assessment.factors.roadSurfaceRisk.score}pts)
              </span>
            </div>
          )}
          {assessment.factors?.blackIceRisk && (
            <div className="flex justify-between">
              <span className="font-cormorant">Black Ice Risk:</span>
              <span className={`font-semibold font-cormorant ${assessment.factors.blackIceRisk.level === 'extreme' || assessment.factors.blackIceRisk.level === 'high' ? 'text-red-700' : 'text-gray-700'}`}>
                {assessment.factors.blackIceRisk.probability}% - {assessment.factors.blackIceRisk.level.toUpperCase()} (-{assessment.factors.blackIceRisk.score}pts)
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Recommendations */}
      {assessment.recommendations && assessment.recommendations.length > 0 && (
        <div className="border-t pt-2">
          <p className="text-sm font-semibold font-cormorant text-gray-700 mb-2">Recommendations:</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {assessment.recommendations
              .sort((a: { priority: string }, b: { priority: string }) => {
                const priorityOrder: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
                return priorityOrder[a.priority] - priorityOrder[b.priority];
              })
              .map((rec: { priority: string; text?: string; action?: string; reasoning?: string }, idx: number) => (
                <div key={idx} className={`p-2 rounded text-xs ${rec.priority === 'critical' ? 'bg-red-50 border-l-2 border-red-500' : rec.priority === 'high' ? 'bg-red-50 border-l-2 border-red-500' : 'bg-gray-50'}`}>
                  {rec.action && <p className="font-semibold font-cormorant text-gray-800">{rec.action}</p>}
                  {rec.reasoning && <p className="text-gray-600 font-cormorant mt-1">{rec.reasoning}</p>}
                  {rec.text && <p className="text-gray-600 font-cormorant mt-1">{rec.text}</p>}
                </div>
              ))}
          </div>
        </div>
      )}
      
      {/* Travel Advice */}
      {assessment.travelAdvice && (
        <div className={`border-t pt-2 ${assessment.travelAdvice.recommended ? 'bg-green-50' : 'bg-red-50'} p-2 rounded`}>
          <p className="text-sm font-semibold font-cormorant mb-1">
            Travel Recommendation: {assessment.travelAdvice.recommended ? '✅ RECOMMENDED' : '❌ NOT RECOMMENDED'}
          </p>
          <p className="text-xs text-gray-700 font-cormorant">
            Urgency: {assessment.travelAdvice.urgency.replace('_', ' ').toUpperCase()} | 
            Difficulty: {assessment.travelAdvice.estimatedDifficulty}
          </p>
        </div>
      )}
      
      {/* Data Quality */}
      {assessment.dataQuality && (
        <div className="border-t pt-2 text-xs text-gray-500 font-cormorant">
          <p>Data Confidence: {assessment.dataQuality.confidence}%</p>
          <p>Sources: {assessment.dataQuality.dataSources.join(', ')}</p>
          {assessment.lastUpdated && <p>Last Updated: {new Date(assessment.lastUpdated).toLocaleString()}</p>}
        </div>
      )}
    </div>
  );
}

export default function VermontRoadSafetyMap() {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Center on Vermont (approximately central point)
  const vermontCenter: [number, number] = [44.2664, -72.5805];
  
  useEffect(() => {
    async function fetchMapData() {
      try {
        setLoading(true);
        // Include plow data in the request
        const response = await fetch('/api/map/road-safety?includePlows=true');
        
        if (!response.ok) {
          throw new Error('Failed to fetch road safety data');
        }
        
        const data = await response.json();
        setMapData(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching map data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load map data');
      } finally {
        setLoading(false);
      }
    }
    
    fetchMapData();
    
    // Refresh data every 5 minutes
    // Update map data every 10 minutes for responsive, real-time updates
    const interval = setInterval(fetchMapData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="w-full h-[600px] bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-gray-600 font-cormorant">Loading road safety map...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-[600px] bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-red-600 font-cormorant">Error loading map: {error}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-xl font-bold font-cormorant text-[var(--darkBlue)] mb-2">
              Vermont Road Safety Conditions
            </h3>
            <p className="text-sm text-gray-600 font-cormorant">
              Zoom in to view highlighted roads.
            </p>
          </div>
        </div>
        <div className="bg-white p-3 rounded-lg border border-gray-200 mb-3">
          <p className="text-xs font-semibold font-cormorant text-gray-700 mb-2">Safety Level Legend:</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs font-cormorant">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span>Excellent (80-100)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span>Good (60-79)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full border-3 shadow-lg" style={{ backgroundColor: '#DC2626', borderColor: '#DC2626', borderWidth: '3px' }}></div>
              <span className="font-bold text-red-700">⚠️ Caution (40-59) - Red = Moderate Risk Roads</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#DC2626' }}></div>
              <span>Poor (20-39) - Red = High Risk Roads</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#991B1B' }}></div>
              <span>Hazardous (0-19) - Deep Red = Extreme Risk Roads</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="w-full h-[600px] rounded-lg overflow-hidden border border-gray-300">
        <MapContainer
          center={vermontCenter}
          zoom={8}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {mapData?.regions.map((region) => {
            if (!region.latitude || !region.longitude) return null;
            
            const color = getRatingColor(region.safetyRating?.rating || null);
            const radius = getRatingSize(region.safetyRating?.score || null);
            const rating = region.safetyRating?.rating || 'unknown';
            const score = region.safetyRating?.score || 0;
            
            // Ensure caution, poor, and hazardous ratings are HIGHLY VISIBLE
            const isCautionOrWorse = score < 60; // Caution (40-59), Poor (20-39), Hazardous (0-19)
            const isPoorOrWorse = score < 40; // Poor and Hazardous only
            const isCaution = score >= 40 && score < 60; // Specifically caution zones
            
            // Caution areas get thicker border (3.5) and higher opacity to stand out in bright orange
            // Poor/Hazardous get even thicker (4) and highest opacity
            const borderWeight = isPoorOrWorse ? 4 : isCaution ? 3.5 : isCautionOrWorse ? 3 : 2;
            // Higher opacity for caution zones (bright orange) - ensure they're clearly visible
            const fillOpacity = isPoorOrWorse ? 0.85 : isCaution ? 0.8 : isCautionOrWorse ? 0.75 : 0.7;
            
            // For caution zones, use red border to match fill color (consistent red)
            const borderColor = isCaution ? '#DC2626' : '#ffffff'; // Red border for caution zones - matches fill
            
            return (
              <CircleMarker
                key={region.districtId}
                center={[region.latitude, region.longitude]}
                radius={radius}
                pathOptions={{
                  fillColor: color,
                  color: borderColor, // Red border for caution zones, white for others
                  weight: borderWeight,
                  opacity: 1,
                  fillOpacity: fillOpacity,
                }}
              >
                <Popup>
                  <div className="p-2 min-w-[250px]">
                    <h4 className="font-bold font-cormorant text-lg mb-2">{region.districtName}</h4>
                    {region.city && (
                      <p className="text-sm text-gray-600 font-cormorant mb-1">{region.city}</p>
                    )}
                    {region.county && (
                      <p className="text-sm text-gray-600 font-cormorant mb-2">{region.county} County</p>
                    )}
                    
                    {region.safetyRating ? (
                      <>
                        <div className="mb-2">
                          {/* Highlight caution zones with red styling and warning icon */}
                          <span className={`inline-block px-2 py-1 rounded text-sm font-semibold font-cormorant`}
                            style={{ 
                              backgroundColor: color,
                              color: rating === 'caution' ? '#1F2937' : 'white', // Dark text for red background
                            }}>
                            {rating === 'caution' && '⚠️ '}
                            {rating.toUpperCase()} ({score}/100)
                            {rating === 'caution' && ' - CAUTION ZONE'}
                          </span>
                        </div>
                        
                        {region.safetyRating.conditions.length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs font-semibold font-cormorant text-gray-700 mb-1">Conditions:</p>
                            <ul className="text-xs text-gray-600 font-cormorant list-disc list-inside">
                              {region.safetyRating.conditions.slice(0, 2).map((condition, idx) => (
                                <li key={idx}>{condition}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {region.safetyRating.warnings.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold font-cormorant text-red-700 mb-1">⚠️ Warnings:</p>
                            <ul className="text-xs text-red-600 font-cormorant list-disc list-inside">
                              {region.safetyRating.warnings.slice(0, 2).map((warning, idx) => (
                                <li key={idx}>{warning}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-gray-500 font-cormorant">Road safety data not available</p>
                    )}
                    
                    {region.plowCoverage && (
                      <div className="mt-3 pt-3 border-t border-gray-300">
                        <p className="text-xs font-semibold font-cormorant text-blue-700 mb-1">🚛 Plow Coverage:</p>
                        <p className="text-xs text-gray-700 font-cormorant mb-1">
                          {region.plowCoverage.plowCount} active plow{region.plowCoverage.plowCount !== 1 ? 's' : ''} 
                          {' '}({region.plowCoverage.plowDensity.toFixed(3)} plows/mile)
                        </p>
                        <p className="text-xs text-gray-600 font-cormorant">
                          Safety Rating: {region.plowCoverage.safetyRating}/10
                        </p>
                      </div>
                    )}
                    
                    {region.safetyRating && (
                      <div className="mt-3 pt-3 border-t border-gray-300">
                        <p className="text-xs font-semibold font-cormorant text-gray-700 mb-1">Detailed Assessment:</p>
                        {region.safetyRating.factors && typeof region.safetyRating.factors === 'object' && (
                          <>
                            {region.safetyRating.factors.temperature && (
                              <p className="text-xs text-gray-600 font-cormorant mb-1">
                                Temperature Impact: -{(region.safetyRating.factors.temperature as { impact?: number }).impact || 0}pts
                              </p>
                            )}
                            {region.safetyRating.factors.roadConditions && (
                              <p className="text-xs text-gray-600 font-cormorant mb-1">
                                Road Conditions Impact: -{(region.safetyRating.factors.roadConditions as { impact?: number }).impact || 0}pts
                              </p>
                            )}
                          </>
                        )}
                        <p className="text-xs text-gray-600 font-cormorant">
                          Confidence: {region.safetyRating.confidence || 85}%
                        </p>
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
          
          {/* Add plow truck markers */}
          {mapData?.plows && mapData.plows.length > 0 && mapData.plows.map((plow) => {
            // Use default marker for plows (or create custom icon if needed)
            return (
              <Marker
                key={plow.id}
                position={[plow.latitude, plow.longitude]}
              >
                <Popup>
                  <div className="p-2 min-w-[200px]">
                    <h4 className="font-bold font-cormorant text-lg mb-1">🚛 Plow Truck</h4>
                    {plow.route && (
                      <p className="text-sm text-gray-700 font-cormorant mb-1">Route: {plow.route}</p>
                    )}
                    <p className="text-xs text-gray-600 font-cormorant">
                      Status: <span className="font-semibold">{plow.status || 'Active'}</span>
                    </p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
          
          {/* Highlight ONLY caution, poor, and hazardous roads - all others are not shown */}
          {mapData?.dangerousRoads && mapData.dangerousRoads
            .filter(road => {
              // Only show roads with caution, poor, or hazardous ratings
              return road.safetyLevel === 'caution' || 
                     road.safetyLevel === 'poor' || 
                     road.safetyLevel === 'hazardous';
            })
            .map((road, index) => {
            if (!road.coordinates || road.coordinates.length < 2) return null;
            
            // Color code by safety level (ONLY caution, poor, hazardous shown)
            let color = '#DC2626'; // Default to red
            let weight = 6;
            let opacity = 0.9;
            
            switch (road.safetyLevel) {
              case 'caution':
                // CAUTION ZONES: Districts/roads with scores 40-59 - use red for consistency
                color = '#DC2626'; // Red - consistent with danger color scheme
                weight = 6; // Thicker line (6px) for maximum visibility - stands out on map
                opacity = 0.9; // High opacity (0.9) to ensure caution zones are clearly visible
                break;
              case 'poor':
                color = '#DC2626'; // Red - same as caution for consistency
                weight = 5;
                opacity = 0.85;
                break;
              case 'hazardous':
                color = '#991B1B'; // Deep dark red - darker red for most dangerous
                weight = 6;
                opacity = 0.9;
                break;
            }
            
            return (
              <RoadSafetyPolyline
                key={`road-${road.routeId || index}`}
                road={road}
                color={color}
                weight={weight}
                opacity={opacity}
              />
            );
          })}
        </MapContainer>
      </div>
      
      {mapData && (
        <p className="text-xs text-gray-500 mt-2 font-cormorant text-right">
          Last updated: {new Date(mapData.timestamp).toLocaleString()}
        </p>
      )}
    </div>
  );
}









