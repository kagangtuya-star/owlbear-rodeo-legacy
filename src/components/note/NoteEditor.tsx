import { useEffect } from "react";
import { Box } from "theme-ui";

type NoteEditorProps = {
  html: string;
  editorRef: React.RefObject<HTMLDivElement>;
  autoFocus: boolean;
  fontFamily: string;
  fontSize: number;
  color: string;
  padding?: number;
  width?: number;
  onChange: (html: string) => void;
  onDone: () => void;
};

function NoteEditor({
  html,
  editorRef,
  autoFocus,
  fontFamily,
  fontSize,
  color,
  padding,
  width,
  onChange,
  onDone,
}: NoteEditorProps) {
  const widthStyle =
    typeof width === "number" ? `${width}px` : "fit-content";
  const paddingStyle =
    typeof padding === "number" ? `${padding}px` : "0px";

  useEffect(() => {
    const node = editorRef.current;
    if (!node) {
      return;
    }
    if (node.innerHTML !== html) {
      node.innerHTML = html;
    }
  }, [editorRef, html]);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const node = editorRef.current;
    if (!node) {
      return;
    }
    node.focus();
  }, [autoFocus, editorRef]);

  function handleInput(event: React.FormEvent<HTMLDivElement>) {
    onChange(event.currentTarget.innerHTML);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onDone();
    }
  }

  return (
    <Box
      as="div"
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      sx={{
        outline: "none",
        display: "inline-block",
        width: widthStyle,
        color,
        fontFamily,
        fontSize: `${fontSize}px`,
        lineHeight: 1.2,
        padding: paddingStyle,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        "& p": { margin: 0 },
        "& h1": { margin: 0, fontSize: "1.6em", fontWeight: 700 },
        "& h2": { margin: 0, fontSize: "1.2em", fontWeight: 700 },
        "& ul, & ol": { margin: 0, paddingLeft: "1.2em" },
      }}
    />
  );
}

NoteEditor.defaultProps = {
  autoFocus: false,
};

export default NoteEditor;
