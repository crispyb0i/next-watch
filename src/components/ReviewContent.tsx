import { createElement, type ReactNode } from "react";
import { parseReviewDocument, type ReviewNode } from "../lib/reviewDocument";

function renderNode(node: ReviewNode, key: number): ReactNode {
  if (node.type === "text") {
    let text: ReactNode = node.text;
    for (const mark of node.marks ?? []) {
      text = createElement(
        { bold: "strong", italic: "em", strike: "s" }[mark.type]!,
        null,
        text,
      );
    }
    return <span key={key}>{text}</span>;
  }
  if (node.type === "hardBreak") return <br key={key} />;
  const tag = {
    doc: "div",
    paragraph: "p",
    bulletList: "ul",
    orderedList: "ol",
    listItem: "li",
    blockquote: "blockquote",
  }[node.type]!;
  return createElement(
    tag,
    {
      key,
      ...(node.type === "orderedList" ? { start: node.attrs?.start } : {}),
    },
    node.content?.map(renderNode),
  );
}

export default function ReviewContent({
  review,
}: {
  review: { review?: string | null; document?: ReviewNode | null };
}) {
  let document: ReviewNode | null = null;
  try {
    if (review.document) document = parseReviewDocument(review.document);
  } catch {
    /* Legacy or malformed content falls back to escaped plain text. */
  }
  return (
    <div className="review-content break-words">
      {document ? (
        renderNode(document, 0)
      ) : (
        <p className="whitespace-pre-wrap">{review.review}</p>
      )}
    </div>
  );
}
