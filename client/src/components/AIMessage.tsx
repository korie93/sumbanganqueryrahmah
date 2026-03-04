import { memo } from "react";

type AIMessageProps = {
  role: "user" | "assistant";
  content: string;
};

function AIMessageImpl({ role, content }: AIMessageProps) {
  return (
    <div className={`ai-message-row ${role === "user" ? "ai-message-row-user" : "ai-message-row-assistant"}`}>
      <div className={`ai-bubble ${role === "user" ? "ai-bubble-user" : "ai-bubble-assistant"}`}>
        {content}
      </div>
    </div>
  );
}

const AIMessage = memo(AIMessageImpl);

export default AIMessage;
