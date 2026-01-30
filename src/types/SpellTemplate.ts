import Vector2 from "../helpers/Vector2";

export type SpellTemplateType =
  | "circle"
  | "rectangle"
  | "cone"
  | "line"
  | "ring"
  | "path";

export type SpellTemplateToolType = SpellTemplateType | "drag";

export type SpellTemplateRule =
  | "center"
  | "area_50"
  | "touch"
  | "ruleset_dnd5e"
  | "ruleset_pf";

export type SpellTemplateStyle = {
  color: string;
  opacity: number;
  strokeWidth: number;
};

export type SpellTemplateParams = {
  radius?: number;
  innerRadius?: number;
  width?: number;
  height?: number;
  length?: number;
  angle?: number;
  points?: Vector2[];
};

export type SpellTemplate = {
  id: string;
  type: SpellTemplateType;
  origin: Vector2;
  rotation: number;
  params: SpellTemplateParams;
  style: SpellTemplateStyle;
};

export type SpellTemplateState = Record<string, SpellTemplate>;

export type SpellTemplateToolSettings = {
  type: SpellTemplateToolType;
  rule: SpellTemplateRule;
  color: string;
  opacity: number;
  strokeWidth: number;
  lineWidth: number;
  coneAngle: number;
  ringInnerRatio: number;
  previewOnRotate: boolean;
};
