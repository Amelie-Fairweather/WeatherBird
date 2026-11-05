/**
 * Superintendent workspace inputs for tailored snow-day predictions.
 */

export type PlowStatus = 'unknown' | 'behind' | 'on_track' | 'clear';
export type DistrictTerrain = 'urban' | 'rural' | 'mountain';

export interface SuperintendentThresholds {
  fullClosingSnow?: number;
  delaySnow?: number;
  ice?: number;
  tempF?: number;
  windMph?: number;
}

export interface SuperintendentInput {
  highSchool?: string;
  feederTowns?: string[];
  feederZips?: string[];
  priorityCorridors?: string[];
  /** Announce-by hour as decimal, e.g. 5.25 = 5:15 AM */
  announceByHour?: number;
  thresholds?: SuperintendentThresholds;
  morningNotes?: string;
  plowStatus?: PlowStatus;
  knownIceSpots?: boolean;
  parentReports?: boolean;
  terrain?: DistrictTerrain;
}

export function parseAnnounceByTime(value: string): number {
  // Accept "5:15", "05:15", "5.25"
  const trimmed = value.trim();
  if (!trimmed) return 5.25;
  if (trimmed.includes(':')) {
    const [h, m] = trimmed.split(':').map((p) => parseInt(p, 10));
    if (Number.isFinite(h) && Number.isFinite(m)) {
      return h + m / 60;
    }
  }
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : 5.25;
}

export function formatAnnounceByHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${h}:${m.toString().padStart(2, '0')} AM`;
}
