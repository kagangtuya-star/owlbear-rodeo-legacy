import { DrawingState } from "./Drawing";
import { FogState } from "./Fog";
import { Notes } from "./Note";
import { TokenNotes } from "./TokenNote";
import { TokenStates } from "./TokenState";

export type EditFlag = "drawing" | "tokens" | "notes" | "fog";

export type MapState = {
  tokens: TokenStates;
  drawings: DrawingState;
  fogs: FogState;
  templates?: Record<string, any>;
  editFlags: Array<EditFlag>;
  notes: Notes;
  tokenNotes: TokenNotes;
  walls?: Record<string, any>;
  explored?: number[][][][];
  fogEnabled?: boolean;
  showExplored?: boolean;
  mapId: string;
};
