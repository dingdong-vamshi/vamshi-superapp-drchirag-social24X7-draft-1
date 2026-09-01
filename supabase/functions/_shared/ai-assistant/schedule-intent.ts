export type ParsedScheduleIntent = {
  recipientQuery: string;
  draft: string;
  timeExpression: string;
};

const stripPairedQuotes = (value: string) => {
  const trimmed = value.trim();
  const pairs: Array<[string, string]> = [["\"", "\""], ["'", "'"], ["“", "”"]];
  const pair = pairs.find(([start, end]) => trimmed.startsWith(start) && trimmed.endsWith(end));
  return pair ? trimmed.slice(pair[0].length, -pair[1].length).trim() : trimmed;
};

export const parseDeterministicScheduleIntent = (
  request: string,
): ParsedScheduleIntent | null => {
  const action = request.match(
    /\b(?:message|tell|send(?:\s+(?:a\s+)?message\s+to)?)\s+@?([\p{L}\p{N}._-]+)\s+([\s\S]+)$/iu,
  );
  if (!action?.[1] || !action[2]) return null;
  const remainder = action[2].trim();
  const timed = remainder.match(
    /^([\s\S]+?)\s+at\s+((?:\d{1,2})(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*$/i,
  );
  if (!timed?.[1] || !timed[2]) return null;
  const draft = stripPairedQuotes(timed[1]);
  if (!draft || draft.length > 2_000) return null;
  return {
    recipientQuery: action[1],
    draft,
    timeExpression: timed[2].trim(),
  };
};

export const mergePendingTimeReply = (
  pendingTimeExpression: string,
  reply: string,
) => {
  const cleaned = reply.trim();
  const meridiem = cleaned.match(/^(a\.?m\.?|p\.?m\.?)$/i)?.[1];
  if (meridiem) return `${pendingTimeExpression.replace(/\s*(?:a\.?m\.?|p\.?m\.?)$/i, "")} ${meridiem}`;
  const explicit = cleaned.match(
    /\b(?:tomorrow\s+)?(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/i,
  )?.[0];
  return explicit?.trim() ?? null;
};
