import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseReviewDocument,
  plainReviewDocument,
  reviewDocumentText,
} from "./reviewDocument.ts";

test("rich reviews round-trip formatting, line breaks, and literal HTML safely", () => {
  const value = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "<script>alert(1)</script>",
            marks: [{ type: "bold", attrs: { onclick: "evil" } }],
          },
          { type: "hardBreak" },
          { type: "text", text: "Really good", marks: [{ type: "italic" }] },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 3, onclick: "evil" },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "A standout" }],
              },
            ],
          },
        ],
      },
      {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Worth watching",
                marks: [{ type: "strike" }],
              },
            ],
          },
        ],
      },
    ],
  };
  const result = parseReviewDocument(value);
  assert.equal(
    reviewDocumentText(result),
    "<script>alert(1)</script>\nReally good\nA standout\nWorth watching",
  );
  assert.equal(JSON.stringify(result).includes("onclick"), false);
  assert.equal(result.content?.[1].attrs?.start, 3);
  assert.deepEqual(parseReviewDocument(result), result);
  assert.equal(
    reviewDocumentText(
      plainReviewDocument("Legacy <b>text</b>\n\nNext paragraph"),
    ),
    "Legacy <b>text</b>\n\nNext paragraph",
  );
});

test("rich reviews reject unsafe, malformed, excessively nested and oversized documents", () => {
  for (const value of [
    null,
    [],
    { type: "script" },
    { type: "doc", content: "bad" },
    {
      type: "doc",
      content: [{ type: "image", attrs: { src: "javascript:alert(1)" } }],
    },
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    },
    plainReviewDocument("x".repeat(5001)),
  ]) {
    assert.throws(() => parseReviewDocument(value));
  }
  let nested = plainReviewDocument("hello").content![0];
  for (let i = 0; i < 15; i++)
    nested = { type: "blockquote", content: [nested] };
  assert.throws(() => parseReviewDocument({ type: "doc", content: [nested] }));
  assert.doesNotThrow(() =>
    parseReviewDocument(plainReviewDocument("x".repeat(5000))),
  );
});
