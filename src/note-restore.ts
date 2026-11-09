import { validateMapState } from './notes';
import type { NoteMapState, Result } from './notes';

export interface ViewportLimits {
  west: number; east: number; south: number; north: number; minZoom: number; maxZoom: number;
}
// Complete validation precedes replacement: missing fields never inherit current values.
export function restoredMapState(saved: unknown, current: NoteMapState, limits: ViewportLimits): Result<{ state: NoteMapState; adjusted: boolean }> {
  const checked = validateMapState(saved);
  if (!checked.ok) return checked;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const original = checked.value.viewport;
  const viewport = {
    longitude: clamp(original.longitude, limits.west, limits.east),
    latitude: clamp(original.latitude, limits.south, limits.north),
    zoom: clamp(original.zoom, limits.minZoom, limits.maxZoom),
  };
  return { ok: true, value: {
    state: { ...current, ...checked.value, viewport },
    adjusted: Object.keys(viewport).some(key => viewport[key as keyof typeof viewport] !== original[key as keyof typeof original]),
  } };
}
