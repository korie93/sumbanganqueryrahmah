export type AIMessageScrollPosition = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

export function isNearAIMessageBottom(position: AIMessageScrollPosition): boolean {
  return position.scrollHeight - position.scrollTop - position.clientHeight <= 48;
}

export function isReadingEarlierAIMessages(position: AIMessageScrollPosition, previousTop: number): boolean {
  return !isNearAIMessageBottom(position) && position.scrollTop < previousTop - 1;
}
