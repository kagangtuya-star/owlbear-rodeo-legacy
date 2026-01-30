import { DrawingState } from "./Drawing";
import { FogState } from "./Fog";
import { Notes } from "./Note";
import { TokenNotes } from "./TokenNote";
import { SpellTemplateState } from "./SpellTemplate";
import { TokenStates } from "./TokenState";
import { WallState } from "./Wall";

export type EditFlag = "drawing" | "tokens" | "notes" | "fog";

export type ExploredState = number[][][][];

export type MapState = {
  tokens: TokenStates;
  drawings: DrawingState;
  fogs: FogState;
  templates: SpellTemplateState;
  editFlags: Array<EditFlag>;
  notes: Notes;
  tokenNotes: TokenNotes;
  walls?: WallState;
  explored?: ExploredState;
  fogEnabled?: boolean;
  mapId: string;
};
