import { memo, type ReactNode } from "react";
import { sanitizeAIMessageContentForDisplay } from "@/components/ai-message-sanitizer";

type AIMessageProps = {
  messageRole: "user" | "assistant";
  content: string;
};

type AIMessageMarkdownBlock =
  | { type: "code"; content: string; language?: string }
  | { type: "list"; ordered: boolean; start: number; items: string[] }
  | { type: "paragraph"; lines: string[] };

function createAIMessageContentKeyFactory() {
  const occurrences = new Map<string, number>();

  // A message grows by appending text. Its structural slots must retain their
  // DOM identity while a paragraph, line or list item is still being revealed.
  // Counts are local to each parent scope, so repeated content stays distinct.
  return (scope: string) => {
    const occurrence = occurrences.get(scope) ?? 0;
    occurrences.set(scope, occurrence + 1);
    return `${scope}:${occurrence}`;
  };
}

function parseAIMessageMarkdownBlocks(content: string): AIMessageMarkdownBlock[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: AIMessageMarkdownBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  let listStart = 1;
  let codeLines: string[] = [];
  let codeLanguage = "";
  let inCodeBlock = false;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    blocks.push({ type: "paragraph", lines: paragraphLines });
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    blocks.push({ type: "list", ordered: listOrdered, start: listStart, items: listItems });
    listItems = [];
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^```([A-Za-z0-9_-]{0,32})\s*$/);
    if (fenceMatch) {
      if (inCodeBlock) {
        blocks.push({
          type: "code",
          content: codeLines.join("\n"),
          ...(codeLanguage ? { language: codeLanguage } : {}),
        });
        codeLines = [];
        codeLanguage = "";
        inCodeBlock = false;
        continue;
      }

      flushParagraph();
      flushList();
      codeLanguage = fenceMatch[1] ?? "";
      inCodeBlock = true;
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*]\s+(.+)$/);
    // Leading-zero references and account-length identifiers are plain text.
    const orderedMatch = line.match(/^\s*(0|[1-9]\d{0,8})[.)]\s+(.+)$/);
    const nextListOrdered = Boolean(orderedMatch);
    const listMatch = orderedMatch ?? unorderedMatch;
    if (listMatch) {
      flushParagraph();
      if (listItems.length > 0 && listOrdered !== nextListOrdered) {
        flushList();
      }
      listOrdered = nextListOrdered;
      if (listItems.length === 0) {
        listStart = orderedMatch ? Number(orderedMatch[1]) : 1;
      }
      listItems.push(orderedMatch ? orderedMatch[2] ?? "" : listMatch[1] ?? "");
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  if (inCodeBlock) {
    blocks.push({
      type: "code",
      content: codeLines.join("\n"),
      ...(codeLanguage ? { language: codeLanguage } : {}),
    });
  }
  flushParagraph();
  flushList();

  return blocks;
}

function renderParagraphLines(
  lines: string[],
  blockKey: string,
  getContentKey: (scope: string) => string,
) {
  let isFirstLine = true;

  return lines.map((line) => {
    const needsLineBreak = !isFirstLine;
    isFirstLine = false;

    return (
      <span key={getContentKey(`${blockKey}:line`)}>
        {needsLineBreak ? <br /> : null}
      {line}
      </span>
    );
  });
}

function renderAIMessageMarkdown(content: string): ReactNode {
  const blocks = parseAIMessageMarkdownBlocks(content);
  if (blocks.length === 0) {
    return null;
  }

  const getContentKey = createAIMessageContentKeyFactory();

  return blocks.map((block) => {
    const blockKey = getContentKey(`block:${block.type}`);

    if (block.type === "code") {
      return (
        <pre key={blockKey} className="ai-markdown-code" tabIndex={0} role="region" aria-label="Kod dalam jawapan AI">
          <code data-language={block.language || undefined}>{block.content}</code>
        </pre>
      );
    }

    if (block.type === "list") {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag key={blockKey} className="ai-markdown-list" start={block.ordered && block.start !== 1 ? block.start : undefined}>
          {block.items.map((item) => (
            <li key={getContentKey(`${blockKey}:item`)}>{item}</li>
          ))}
        </ListTag>
      );
    }

    return (
      <p key={blockKey} className="ai-markdown-paragraph">
        {renderParagraphLines(block.lines, blockKey, getContentKey)}
      </p>
    );
  });
}

/** Renders sanitized AI message text with the shared Markdown formatting. */
export const AIMessageContent = memo(function AIMessageContent({ content }: { content: string }) {
  const safeContent = sanitizeAIMessageContentForDisplay(content);
  return <>{renderAIMessageMarkdown(safeContent)}</>;
});

function AIMessageImpl({ messageRole, content }: AIMessageProps) {
  const messageLabel = messageRole === "user" ? "Mesej pengguna" : "Mesej pembantu AI";

  return (
    <div
      className={`ai-message-row ${messageRole === "user" ? "ai-message-row-user" : "ai-message-row-assistant"}`}
      role="article"
      aria-label={messageLabel}
    >
      <div className={`ai-bubble ${messageRole === "user" ? "ai-bubble-user" : "ai-bubble-assistant"}`}>
        <AIMessageContent content={content} />
      </div>
    </div>
  );
}

const AIMessage = memo(AIMessageImpl);

export default AIMessage;
