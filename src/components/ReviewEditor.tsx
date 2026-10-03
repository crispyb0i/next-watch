import { useEffect, useId, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  plainReviewDocument,
  reviewDocumentText,
  REVIEW_MAX_LENGTH,
  type ReviewNode,
} from "../lib/reviewDocument";

export default function ReviewEditor({
  initialDocument,
  text,
  disabled,
  onChange,
}: {
  initialDocument?: ReviewNode | null;
  text: string;
  disabled: boolean;
  onChange: (document: ReviewNode) => void;
}) {
  const id = useId();
  const [length, setLength] = useState(
    initialDocument ? reviewDocumentText(initialDocument).length : text.length,
  );
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
        underline: false,
      }),
    ],
    content: initialDocument ?? plainReviewDocument(text),
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-label": "Your review",
        "aria-multiline": "true",
        "aria-describedby": `${id}-count`,
        class:
          "review-content min-h-40 max-h-[40vh] overflow-y-auto px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-accent rounded-b-xl",
      },
    },
    onUpdate: ({ editor }) => {
      const document = editor.getJSON() as ReviewNode;
      setLength(reviewDocumentText(document).length);
      onChange(document);
    },
  });
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  const actions = [
    {
      label: "Bold",
      text: "B",
      active: editor?.isActive("bold"),
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      text: "I",
      active: editor?.isActive("italic"),
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      label: "Strikethrough",
      text: "S̶",
      active: editor?.isActive("strike"),
      run: () => editor?.chain().focus().toggleStrike().run(),
    },
    {
      label: "Bullet list",
      text: "• List",
      active: editor?.isActive("bulletList"),
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      text: "1. List",
      active: editor?.isActive("orderedList"),
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Quote",
      text: "“ Quote",
      active: editor?.isActive("blockquote"),
      run: () => editor?.chain().focus().toggleBlockquote().run(),
    },
  ];
  return (
    <div>
      <label htmlFor={id} className="text-text-muted text-xs font-semibold">
        Your review
      </label>
      <div className="border-border/60 bg-surface-muted/40 mt-2 rounded-xl border">
        <div
          role="group"
          aria-label="Review formatting"
          className="border-border/60 flex flex-wrap gap-1 border-b p-2"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              aria-label={action.label}
              title={action.label}
              aria-pressed={Boolean(action.active)}
              disabled={!editor || disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={action.run}
              className={`focus-visible:outline-accent min-h-9 min-w-9 rounded-lg px-2 text-xs font-semibold focus-visible:outline-2 disabled:opacity-50 ${action.active ? "bg-accent/20 text-accent-hover" : "hover:bg-surface-muted text-text-primary"}`}
            >
              {action.text}
            </button>
          ))}
        </div>
        <EditorContent editor={editor} />
      </div>
      <p
        id={`${id}-count`}
        role={length > REVIEW_MAX_LENGTH ? "alert" : undefined}
        className={`mt-2 text-right text-xs ${length > REVIEW_MAX_LENGTH ? "text-danger" : "text-text-muted"}`}
      >
        {length.toLocaleString()} / 5,000 characters
        {length > REVIEW_MAX_LENGTH ? " — shorten your review to save." : ""}
      </p>
    </div>
  );
}
