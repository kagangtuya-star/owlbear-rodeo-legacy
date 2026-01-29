import Ajv, { JSONSchemaType } from "ajv";
import { TokenNote } from "../types/TokenNote";

export const TokenNoteSchema: JSONSchemaType<TokenNote> = {
  $id: "https://www.owlbear.rodeo/schemas/token-note.json",
  properties: {
    id: {
      type: "string",
    },
    tokenStateId: {
      type: "string",
    },
    content: {
      type: "string",
    },
    style: {
      type: "object",
      properties: {
        fontFamily: {
          enum: ["default", "handwritten", "rune"],
          type: "string",
        },
        backgroundColor: {
          type: "string",
          nullable: true,
        },
      },
      required: ["fontFamily"],
    },
    permissions: {
      type: "object",
      properties: {
        default: {
          enum: ["none", "read", "write"],
          type: "string",
        },
        owners: {
          items: {
            type: "string",
          },
          type: "array",
        },
      },
      required: ["default", "owners"],
    },
    lastEditedBy: {
      type: "string",
    },
    lastEditedAt: {
      type: "number",
    },
    editingBy: {
      type: "string",
      nullable: true,
    },
  },
  required: [
    "id",
    "tokenStateId",
    "content",
    "style",
    "permissions",
    "lastEditedBy",
    "lastEditedAt",
  ],
  type: "object",
};

const ajv = new Ajv({ schemas: [TokenNoteSchema] });

export const isTokenNote = ajv.compile<TokenNote>(TokenNoteSchema);
