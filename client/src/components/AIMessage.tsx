import { memo, type ReactNode } from "react";
import { sanitizeAIMessageContentForDisplay } from "@/components/ai-message-sanitizer";

type AIMessageProps = {
  messageRole: "user" | "assistant";
  content: string;
};

type AIMessageMarkdownBlock =
  | { type: "code"; content: string; language?: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "paragraph"; lines: string[] };

function hashAIMessageKey(value: string) {
  let hash = 5381;
  for (const character of value) {
    hash = (hash * 33) ^ character.charCodeAt(0);
  }
  return (hash >>> 0).toString(36);
}

function createAIMessageContentKeyFactory() {
  const seenKeys = new Map<string, number>();

  return (scope: string, value: string) => {
    const baseKey = `${scope}:${hashAIMessageKey(value)}`;
    const seenCount = seenKeys.get(baseKey) ?? 0;
    seenKeys.set(baseKey, seenCount + 1);

    return seenCount === 0 ? baseKey : `${baseKey}:repeat-${seenCount}`;
  };
}

function getAIMessageBlockSeed(block: AIMessageMarkdownBlock) {
  if (block.type === "code") {
    return `${block.language ?? ""}\n${block.content}`;
  }
  if (block.type === "list") {
    return `${block.ordered ? "ordered" : "unordered"}\n${block.items.join("\n")}`;
  }
  return block.lines.join("\n");
}

function parseAIMessageMarkdownBlocks(content: string): AIMessageMarkdownBlock[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: AIMessageMarkdownBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
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
    blocks.push({ type: "list", ordered: listOrdered, items: listItems });
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
    const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const nextListOrdered = Boolean(orderedMatch);
    const listMatch = orderedMatch ?? unorderedMatch;
    if (listMatch) {
      flushParagraph();
      if (listItems.length > 0 && listOrdered !== nextListOrdered) {
        flushList();
      }
      listOrdered = nextListOrdered;
      listItems.push(listMatch[1] ?? "");
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
  getContentKey: (scope: string, value: string) => string,
) {
  let isFirstLine = true;

  return lines.map((line) => {
    const needsLineBreak = !isFirstLine;
    isFirstLine = false;

    return (
      <span key={getContentKey(`${blockKey}:line`, line)}>
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
    const blockKey = getContentKey(`block:${block.type}`, getAIMessageBlockSeed(block));

    if (block.type === "code") {
      return (
        <pre key={blockKey} className="ai-markdown-code">
          <code data-language={block.language || undefined}>{block.content}</code>
        </pre>
      );
    }

    if (block.type === "list") {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag key={blockKey} className="ai-markdown-list">
          {block.items.map((item) => (
            <li key={getContentKey(`${blockKey}:item`, item)}>{item}</li>
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

function AIMessageImpl({ messageRole, content }: AIMessageProps) {
  const messageLabel = messageRole === "user" ? "Mesej pengguna" : "Mesej pembantu AI";
  const safeContent = sanitizeAIMessageContentForDisplay(content);

  return (
    <div
      className={`ai-message-row ${messageRole === "user" ? "ai-message-row-user" : "ai-message-row-assistant"}`}
      role="article"
      aria-label={messageLabel}
    >
      <div className={`ai-bubble ${messageRole === "user" ? "ai-bubble-user" : "ai-bubble-assistant"}`}>
        {renderAIMessageMarkdown(safeContent)}
      </div>
    </div>
  );
}

const AIMessage = memo(AIMessageImpl);

export default AIMessage;
