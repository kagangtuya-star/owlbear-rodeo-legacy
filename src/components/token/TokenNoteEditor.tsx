import { useEffect } from "react";
import { Box, Button, Flex } from "theme-ui";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

type TokenNoteEditorProps = {
  content: string;
  editable: boolean;
  showToolbar: boolean;
  onChange: (value: string) => void;
};

function TokenNoteEditor({
  content,
  editable,
  showToolbar,
  onChange,
}: TokenNoteEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    editable,
    onUpdate: ({ editor: activeEditor }) => {
      onChange(activeEditor.getHTML());
    },
  });
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  if (!editor) {
    return null;
  }
  return (
    <Box
      data-note-scroll="true"
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      {showToolbar && (
        <Flex sx={{ gap: 2, pb: 2 }}>
          <Button
            variant="secondary"
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().toggleBold()}
          >
            B
          </Button>
          <Button
            variant="secondary"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().toggleItalic()}
          >
            I
          </Button>
          <Button
            variant="secondary"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            disabled={!editor.can().toggleStrike()}
          >
            S
          </Button>
        </Flex>
      )}
      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflow: "hidden",
          "& .ProseMirror": {
            outline: "none",
            minHeight: "100%",
            lineHeight: 1.4,
            height: "100%",
            overflowY: "auto",
            overscrollBehavior: "contain",
            scrollbarWidth: "thin",
            "&::-webkit-scrollbar": {
              width: "2px",
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: "rgba(0, 0, 0, 0.18)",
              borderRadius: "999px",
            },
            "&::-webkit-scrollbar-track": {
              backgroundColor: "transparent",
            },
          },
        }}
      >
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
}

export default TokenNoteEditor;
