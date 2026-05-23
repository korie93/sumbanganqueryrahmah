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

function renderParagraphLines(lines: string[], blockIndex: number) {
  return lines.map((line, index) => (
    <span key={`paragraph:${blockIndex}:line:${index}`}>
      {index > 0 ? <br /> : null}
      {line}
    </span>
  ));
}

function renderAIMessageMarkdown(content: string): ReactNode {
  const blocks = parseAIMessageMarkdownBlocks(content);
  if (blocks.length === 0) {
    return null;
  }

  return blocks.map((block, index) => {
    if (block.type === "code") {
      return (
        <pre key={`code:${index}`} className="ai-markdown-code">
          <code data-language={block.language || undefined}>{block.content}</code>
        </pre>
      );
    }

    if (block.type === "list") {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag key={`list:${index}`} className="ai-markdown-list">
          {block.items.map((item, itemIndex) => (
            <li key={`list:${index}:item:${itemIndex}`}>{item}</li>
          ))}
        </ListTag>
      );
    }

    return (
      <p key={`paragraph:${index}`} className="ai-markdown-paragraph">
        {renderParagraphLines(block.lines, index)}
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
