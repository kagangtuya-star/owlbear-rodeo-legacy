import Vector2 from "../helpers/Vector2";

export type Wall = {
  id: string;
  type: "wall";
  points: Vector2[];
  blocksVision: boolean;
};

export type WallState = Record<string, Wall>;
