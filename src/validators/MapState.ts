import Ajv from "ajv";
import { MapState } from "../types/MapState";

import { DrawingSchema } from "./Drawing";
import { FogSchema } from "./Fog";
import { NoteSchema } from "./Note";
import { TokenNoteSchema } from "./TokenNote";
import { SpellTemplateSchema } from "./SpellTemplate";
import { TokenStateSchema } from "./TokenState";
import { Vector2Schema } from "./Vector2";
import { ColorSchema } from "./Color";
import { OutlineSchema } from "./Outline";
import { WallSchema } from "./Wall";

export const MapStateSchema: any = {
  $id: "https://www.owlbear.rodeo/schemas/map-state.json",
  properties: {
    tokens: {
      $ref: "#/definitions/TokenStates",
    },
    drawings: {
      $ref: "#/definitions/DrawingState",
    },
    fogs: {
      $ref: "#/definitions/FogState",
    },
    templates: {
      $ref: "#/definitions/SpellTemplateState",
    },
    walls: {
      $ref: "#/definitions/WallState",
    },
    explored: {
      $ref: "#/definitions/ExploredState",
    },
    fogEnabled: {
      type: "boolean",
    },
    showExplored: {
      type: "boolean",
    },
    editFlags: {
      items: {
        enum: ["drawing", "fog", "notes", "tokens"],
        type: "string",
      },
      type: "array",
    },
    notes: {
      $ref: "#/definitions/Notes",
    },
    tokenNotes: {
      $ref: "#/definitions/TokenNotes",
    },
    mapId: {
      type: "string",
    },
  },
  required: [
    "drawings",
    "editFlags",
    "fogs",
    "templates",
    "mapId",
    "notes",
    "tokenNotes",
    "tokens",
  ],
  type: "object",
  definitions: {
    TokenStates: {
      propertyNames: {
        type: "string",
      },
      additionalProperties: {
        $ref: "token-state.json",
      },
      required: [],
      type: "object",
    },
    DrawingState: {
      propertyNames: {
        type: "string",
      },
      additionalProperties: {
        $ref: "drawing.json",
      },
      required: [],
      type: "object",
    },
    FogState: {
      propertyNames: {
        type: "string",
      },
      additionalProperties: {
        $ref: "fog.json",
      },
      required: [],
      type: "object",
    },
    SpellTemplateState: {
      propertyNames: {
        type: "string",
      },
      additionalProperties: {
        $ref: "spell-template.json",
      },
      required: [],
      type: "object",
    },
    Notes: {
      propertyNames: {
        type: "string",
      },
      additionalProperties: {
        $ref: "note.json",
      },
      required: [],
      type: "object",
    },
    TokenNotes: {
      propertyNames: {
        type: "string",
      },
      additionalProperties: {
        $ref: "token-note.json",
      },
      required: [],
      type: "object",
    },
    WallState: {
      propertyNames: {
        type: "string",
      },
      additionalProperties: {
        $ref: "wall.json",
      },
      required: [],
      type: "object",
    },
    ExploredState: {
      type: "array",
      items: {
        type: "array",
        items: {
          type: "array",
          items: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            items: {
              type: "number",
            },
          },
        },
      },
    },
  },
};

export const ajv = new Ajv({
  schemas: [
    MapStateSchema,
    DrawingSchema,
    FogSchema,
    SpellTemplateSchema,
    NoteSchema,
    TokenNoteSchema,
    TokenStateSchema,
    Vector2Schema,
    ColorSchema,
    OutlineSchema,
    WallSchema,
  ],
});

export const isMapState = ajv.compile<MapState>(MapStateSchema);
