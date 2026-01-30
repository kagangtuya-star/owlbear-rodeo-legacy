import Ajv, { JSONSchemaType } from "ajv";
import { Note } from "../types/Note";

import { Vector2Schema } from "./Vector2";
import { ColorSchema } from "./Color";

export const NoteSchema: JSONSchemaType<Note> = {
  $id: "https://www.owlbear.rodeo/schemas/note.json",
  properties: {
    color: {
      $ref: "color.json",
    },
    id: {
      type: "string",
    },
    lastModified: {
      type: "number",
    },
    lastModifiedBy: {
      type: "string",
    },
    locked: {
      type: "boolean",
    },
    size: {
      type: "number",
    },
    text: {
      type: "string",
    },
    textOnly: {
      type: "boolean",
    },
    visible: {
      type: "boolean",
    },
    content: {
      type: "string",
      nullable: true,
    },
    contentFormat: {
      type: "string",
      enum: ["plain", "html"],
      nullable: true,
    },
    style: {
      type: "object",
      nullable: true,
      properties: {
        textColor: {
          type: "string",
        },
        backgroundMode: {
          type: "string",
          enum: ["none", "scrim", "frame"],
        },
        fontFamily: {
          type: "string",
          enum: ["rounded", "serif", "handwritten", "runic"],
        },
        fontScale: {
          type: "string",
          enum: ["xs", "sm", "md", "lg", "xl", "huge"],
        },
        fontSize: {
          type: "number",
          nullable: true,
        },
      },
      required: ["textColor", "backgroundMode", "fontFamily", "fontScale"],
    },
    ownerId: {
      type: "string",
      nullable: true,
    },
    visibility: {
      type: "string",
      enum: ["all", "gm", "owner"],
      nullable: true,
    },
    textVisible: {
      type: "boolean",
      nullable: true,
    },
    attachedToTokenId: {
      type: "string",
      nullable: true,
    },
    x: {
      type: "number",
    },
    y: {
      type: "number",
    },
    rotation: {
      type: "number",
    },
  },
  required: [
    "color",
    "id",
    "lastModified",
    "lastModifiedBy",
    "locked",
    "size",
    "text",
    "textOnly",
    "visible",
    "x",
    "y",
    "rotation",
  ],
  type: "object",
};

const ajv = new Ajv({ schemas: [NoteSchema, ColorSchema, Vector2Schema] });

export const isNote = ajv.compile<Note>(NoteSchema);
