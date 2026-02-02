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
    TokenAttributeVisibility: {
      enum: ["public", "private"],
      type: "string",
    },
    TokenAttributeBar: {
      type: "object",
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        current: { type: "number" },
        min: { type: "number" },
        max: { type: "number" },
        color: { type: "string" },
        showMinMax: { type: "boolean" },
        visibility: { $ref: "#/definitions/TokenAttributeVisibility" },
      },
      required: ["id", "label", "current", "color"],
    },
    TokenAttributeValue: {
      type: "object",
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        value: {
          anyOf: [{ type: "number" }, { type: "string" }],
        },
        color: { type: "string" },
        visibility: { $ref: "#/definitions/TokenAttributeVisibility" },
      },
      required: ["id", "label", "value"],
    },
    TokenAttributeState: {
      type: "object",
      properties: {
        bars: {
          type: "array",
          items: { $ref: "#/definitions/TokenAttributeBar" },
        },
        values: {
          type: "array",
          items: { $ref: "#/definitions/TokenAttributeValue" },
        },
        version: { type: "number" },
        updatedAt: { type: "number" },
        updatedBy: { type: "string" },
      },
      required: ["bars", "values", "version", "updatedAt", "updatedBy"],
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
        attributes: {
          $ref: "#/definitions/TokenAttributeState",
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
