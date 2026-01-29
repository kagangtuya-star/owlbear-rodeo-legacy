import { DrawingState } from "./Drawing";
import { FogState } from "./Fog";
import { Notes } from "./Note";
import { SpellTemplateState } from "./SpellTemplate";
import { TokenStates } from "./TokenState";

export type EditFlag = "drawing" | "tokens" | "notes" | "fog";

export type MapState = {
  tokens: TokenStates;
  drawings: DrawingState;
  fogs: FogState;
  templates: SpellTemplateState;
  editFlags: Array<EditFlag>;
  notes: Notes;
  mapId: string;
};
