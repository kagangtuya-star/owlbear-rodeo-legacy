export type TokenNotePermission = "none" | "read" | "write";
export type TokenNoteFont = "default" | "handwritten" | "rune";

export type TokenNoteStyle = {
  fontFamily: TokenNoteFont;
  backgroundColor?: string;
};

export type TokenNote = {
  id: string;
  tokenStateId: string;
  content: string;
  style: TokenNoteStyle;
  permissions: {
    default: TokenNotePermission;
    owners: string[];
  };
  lastEditedBy: string;
  lastEditedAt: number;
  editingBy?: string;
};

export type TokenNotes = Record<string, TokenNote>;
