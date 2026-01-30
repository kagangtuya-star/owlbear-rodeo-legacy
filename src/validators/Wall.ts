import { Wall } from "../types/Wall";
import { Vector2Schema } from "./Vector2";

export const WallSchema: any = {
  $id: "https://www.owlbear.rodeo/schemas/wall.json",
  type: "object",
  properties: {
    id: { type: "string" },
    type: { enum: ["wall"], type: "string" },
    points: {
      type: "array",
      items: { $ref: "vector2.json" },
    },
    blocksVision: { type: "boolean" },
  },
  required: ["id", "type", "points", "blocksVision"],
};

export const isWall = (wall: any): wall is Wall => {
  return (
    wall &&
    typeof wall.id === "string" &&
    wall.type === "wall" &&
    Array.isArray(wall.points)
  );
};

export const wallSchemas = [WallSchema, Vector2Schema];
