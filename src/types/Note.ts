import Konva from "konva";
import { Color } from "../helpers/colors";

export type NoteBackgroundMode = "none" | "scrim" | "frame";
export type NoteFontFamily = "rounded" | "serif" | "handwritten" | "runic";
export type NoteFontScale = "xs" | "sm" | "md" | "lg" | "xl" | "huge";
export type NoteVisibility = "all" | "gm" | "owner";
export type NoteContentFormat = "plain" | "html";

export type NoteStyle = {
  textColor: string;
  backgroundMode: NoteBackgroundMode;
  fontFamily: NoteFontFamily;
  fontScale: NoteFontScale;
  fontSize?: number;
};

export type Note = {
  id: string;
  color: Color;
  lastModified: number;
  lastModifiedBy: string;
  locked: boolean;
  size: number;
  text: string;
  textOnly: boolean;
  visible: boolean;
  content?: string;
  contentFormat?: NoteContentFormat;
  style?: NoteStyle;
  ownerId?: string;
  visibility?: NoteVisibility;
  textVisible?: boolean;
  attachedToTokenId?: string;
  x: number;
  y: number;
  rotation: number;
};

export type NoteMenuOptions = {
  noteId: string;
  noteNode: Konva.Node;
  focus: boolean;
};

export type NoteDraggingOptions = {
  dragging: boolean;
  noteId: string;
};

export type Notes = Record<string, Note>;
