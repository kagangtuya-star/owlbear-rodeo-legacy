import Ajv from "ajv";
import { TokenState } from "../types/TokenState";

import { ColorSchema } from "./Color";
import { OutlineSchema } from "./Outline";

export const TokenStateSchema = {
  $id: "https://www.owlbear.rodeo/schemas/token-state.json",
  anyOf: [
    {
      $ref: "#/definitions/DefaultTokenState",
    },
    {
      $ref: "#/definitions/FileTokenState",
    },
  ],
  definitions: {
    TokenCategory: {
      enum: ["character", "prop", "vehicle", "attachment"],
      type: "string",
    },
    LightConfig: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        radiusBright: { type: "number" },
        radiusDim: { type: "number" },
        color: { type: "string" },
      },
      required: ["enabled", "radiusBright"],
    },
    BaseTokenState: {
      properties: {
        category: {
          $ref: "#/definitions/TokenCategory",
        },
        height: {
          type: "number",
        },
        id: {
          type: "string",
        },
        label: {
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
        outline: {
          $ref: "outline.json",
        },
        owner: {
          type: "string",
        },
        rotation: {
          type: "number",
        },
        size: {
          type: "number",
        },
        statuses: {
          items: {
            $ref: "color.json",
          },
          type: "array",
        },
        tokenId: {
          type: "string",
        },
        visible: {
          type: "boolean",
        },
        hasVision: {
          type: "boolean",
        },
        visionRange: {
          type: "number",
        },
        visionAngle: {
          type: "number",
        },
        lightConfig: {
          $ref: "#/definitions/LightConfig",
        },
        width: {
          type: "number",
        },
        x: {
          type: "number",
        },
        y: {
          type: "number",
        },
      },
      required: [
        "category",
        "height",
        "id",
        "label",
        "lastModified",
        "lastModifiedBy",
        "locked",
        "outline",
        "owner",
        "rotation",
        "size",
        "statuses",
        "tokenId",
        "visible",
        "width",
        "x",
        "y",
      ],
      type: "object",
    },
    DefaultTokenState: {
      allOf: [
        {
          $ref: "#/definitions/BaseTokenState",
        },
        {
          properties: {
            key: {
              type: "string",
            },
            type: {
              enum: ["default"],
              type: "string",
            },
          },
          required: ["key", "type"],
          type: "object",
        },
      ],
    },
    FileTokenState: {
      allOf: [
        {
          $ref: "#/definitions/BaseTokenState",
        },
        {
          properties: {
            file: {
              type: "string",
            },
            type: {
              enum: ["file"],
              type: "string",
            },
          },
          required: ["file", "type"],
          type: "object",
        },
      ],
    },
  },
};

export const ajv = new Ajv({
  schemas: [TokenStateSchema, ColorSchema, OutlineSchema],
});

export const isTokenState = ajv.compile<TokenState>(TokenStateSchema);
