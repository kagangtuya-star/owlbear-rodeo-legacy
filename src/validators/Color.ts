import Ajv from "ajv";
import { Color } from "../helpers/colors";

const ajv = new Ajv();

export type ColorString = Color | string;

export const ColorSchema = {
  $id: "https://www.owlbear.rodeo/schemas/color.json",
  anyOf: [
    {
      enum: [
        "black",
        "blue",
        "darkGray",
        "green",
        "lightGray",
        "orange",
        "pink",
        "primary",
        "purple",
        "red",
        "teal",
        "white",
        "yellow",
      ],
      type: "string",
    },
    {
      type: "string",
      pattern: "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$",
    },
  ],
};

export const isColor = ajv.compile<ColorString>(ColorSchema);
