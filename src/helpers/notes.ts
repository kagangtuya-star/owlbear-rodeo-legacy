import colors from "./colors";
import { Map } from "../types/Map";
import { Note, NoteContentFormat } from "../types/Note";

export function resolveColor(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }
  const paletteValue = (colors as Record<string, string>)[value];
  return paletteValue || value;
}

export function getNoteContent(note: Note) {
  return note.content ?? note.text ?? "";
}

export function getNoteContentFormat(note: Note): NoteContentFormat {
  return note.contentFormat || "plain";
}

export function getNoteVisibility(note: Note, map: Map | null, userId?: string) {
  const isMapOwner = !!map && !!userId && map.owner === userId;
  const isNoteOwner = !!note.ownerId && !!userId && note.ownerId === userId;
  const visibility = note.visibility || "all";

  const canViewByVisibility =
    visibility === "gm"
      ? isMapOwner
      : visibility === "owner"
        ? isMapOwner || isNoteOwner
        : true;

  const textVisible = note.textVisible !== false;
  const visibleByState = note.visible !== false || isMapOwner;
  const canView = canViewByVisibility && visibleByState && (textVisible || isMapOwner);
  const canViewText =
    canViewByVisibility && visibleByState && (textVisible || isMapOwner);

  return { canView, canViewText, isMapOwner, isNoteOwner };
}
