import Ajv from "ajv";
import { SpellTemplate } from "../types/SpellTemplate";

import { Vector2Schema } from "./Vector2";

export const SpellTemplateSchema = {
  $id: "https://www.owlbear.rodeo/schemas/spell-template.json",
  type: "object",
  properties: {
    id: { type: "string" },
    type: {
      enum: ["circle", "rectangle", "cone", "line", "ring", "path"],
      type: "string",
    },
    origin: {
      $ref: "vector2.json",
    },
    rotation: { type: "number" },
    params: {
      type: "object",
      properties: {
        radius: { type: "number" },
        innerRadius: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        length: { type: "number" },
        angle: { type: "number" },
        points: {
          type: "array",
          items: { $ref: "vector2.json" },
        },
      },
      required: [],
    },
    style: {
      type: "object",
      properties: {
        color: { type: "string" },
        opacity: { type: "number" },
        strokeWidth: { type: "number" },
      },
      required: ["color", "opacity", "strokeWidth"],
    },
  },
  required: ["id", "type", "origin", "rotation", "params", "style"],
};

export const ajv = new Ajv({ schemas: [SpellTemplateSchema, Vector2Schema] });

export const isSpellTemplate = ajv.compile<SpellTemplate>(SpellTemplateSchema);
