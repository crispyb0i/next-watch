/** A deliberately small, HTML-free document format shared by the editor and API. */
export interface ReviewNode {
  type: string;
  text?: string;
  content?: ReviewNode[];
  marks?: { type: string }[];
  attrs?: { start: number };
}

export const REVIEW_MAX_LENGTH = 5000;
const blocks = ["paragraph", "bulletList", "orderedList", "blockquote"];
const children: Record<string, string[]> = {
  doc: blocks,
  paragraph: ["text", "hardBreak"],
  blockquote: blocks,
  bulletList: ["listItem"],
  orderedList: ["listItem"],
  listItem: blocks,
};

/** Reject unknown nodes/marks and rebuild objects so no HTML or attributes survive. */
export function parseReviewDocument(value: unknown): ReviewNode {
  let nodes = 0;
  const visit = (
    value: unknown,
    allowed: string[],
    depth: number,
  ): ReviewNode => {
    if (++nodes > 10000 || depth > 12 || !value || typeof value !== "object")
      throw new Error("Invalid review formatting.");
    const raw = value as Record<string, unknown>;
    if (typeof raw.type !== "string" || !allowed.includes(raw.type))
      throw new Error("Unsupported review formatting.");
    const type = raw.type;
    if (raw.type === "text") {
      if (typeof raw.text !== "string" || !raw.text.length)
        throw new Error("Invalid review text.");
      const node: ReviewNode = { type: "text", text: raw.text };
      if (raw.marks !== undefined) {
        if (!Array.isArray(raw.marks) || raw.marks.length > 3)
          throw new Error("Invalid review formatting.");
        node.marks = raw.marks.map((mark) => {
          if (!mark || !["bold", "italic", "strike"].includes(mark.type))
            throw new Error("Unsupported review formatting.");
          return { type: mark.type };
        });
      }
      return node;
    }
    if (raw.type === "hardBreak") return { type: "hardBreak" };
    if (raw.content !== undefined && !Array.isArray(raw.content))
      throw new Error("Invalid review formatting.");
    const content = ((raw.content ?? []) as unknown[]).map((child) =>
      visit(child, children[type], depth + 1),
    );
    if (raw.type !== "paragraph" && content.length === 0)
      throw new Error("Invalid review formatting.");
    if (raw.type === "listItem" && content[0]?.type !== "paragraph")
      throw new Error("Lists must start with a paragraph.");
    const node: ReviewNode = { type: raw.type, content };
    if (raw.type === "orderedList") {
      const start = (raw.attrs as { start?: unknown } | undefined)?.start ?? 1;
      if (
        !Number.isInteger(start) ||
        (start as number) < 1 ||
        (start as number) > 100000
      )
        throw new Error("Invalid list numbering.");
      node.attrs = { start: start as number };
    }
    return node;
  };
  const document = visit(value, ["doc"], 0);
  if (reviewDocumentText(document).length > REVIEW_MAX_LENGTH)
    throw new Error("Reviews must be 5,000 characters or fewer.");
  return document;
}

export function reviewDocumentText(node: ReviewNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? [])
    .map(reviewDocumentText)
    .join(node.type === "paragraph" ? "" : "\n");
}

export function plainReviewDocument(text: string): ReviewNode {
  return {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}
