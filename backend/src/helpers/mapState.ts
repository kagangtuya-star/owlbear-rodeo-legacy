import { MapState } from "../types/MapState";

type MapStateWithExplored = MapState & { explored?: unknown };

export function normalizeMapState(
  state: MapStateWithExplored | undefined | null
): MapStateWithExplored | undefined | null {
  if (!state) {
    return state;
  }
  if (!Array.isArray(state.explored)) {
    state.explored = [];
  }
  return state;
}
