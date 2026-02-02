import { Color } from "../helpers/colors";
import { Outline } from "./Outline";
import { TokenCategory } from "./Token";

export type LightConfig = {
  enabled: boolean;
  radiusBright: number;
  radiusDim?: number;
  color?: string;
};

export type TokenAttributeVisibility = "public" | "private";

export type TokenAttributeBar = {
  id: string;
  label: string;
  current: number;
  min?: number;
  max?: number;
  color: string;
  showMinMax?: boolean;
  visibility?: TokenAttributeVisibility;
};

export type TokenAttributeValue = {
  id: string;
  label: string;
  value: number | string;
  color?: string;
  visibility?: TokenAttributeVisibility;
};

export type TokenAttributeState = {
  bars: TokenAttributeBar[];
  values: TokenAttributeValue[];
  version: number;
  updatedAt: number;
  updatedBy: string;
};

export type BaseTokenState = {
  id: string;
  tokenId: string;
  owner: string;
  size: number;
  category: TokenCategory;
  label: string;
  statuses: Color[];
  attributes?: TokenAttributeState;
  x: number;
  y: number;
  lastModifiedBy: string;
  lastModified: number;
  rotation: number;
  locked: boolean;
  visible: boolean;
  outline: Outline;
  width: number;
  height: number;
  hasVision?: boolean;
  visionRange?: number;
  visionAngle?: number;
  lightConfig?: LightConfig;
};

export type DefaultTokenState = BaseTokenState & {
  type: "default";
  key: string;
};

export type FileTokenState = BaseTokenState & {
  type: "file";
  file: string;
};

export type TokenState = DefaultTokenState | FileTokenState;

export type TokenStates = Record<string, TokenState>;
