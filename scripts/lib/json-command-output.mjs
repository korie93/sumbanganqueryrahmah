function collectJsonCandidateOffsets(output) {
  const offsets = [];
  const linePattern = /^[\t ]*([\{\[])/gm;
  let match;

  while ((match = linePattern.exec(output)) !== null) {
    offsets.push(match.index + match[0].length - 1);
  }

  return offsets;
}

export function normalizeJsonCommandOutput(stdout, { label = "Command" } = {}) {
  const output = String(stdout ?? "").replace(/^\uFEFF/, "");
  const candidateOffsets = collectJsonCandidateOffsets(output);

  for (let index = candidateOffsets.length - 1; index >= 0; index -= 1) {
    const candidate = output.slice(candidateOffsets[index]).trim();
    if (!candidate) {
      continue;
    }

    try {
      const parsed = JSON.parse(candidate);
      if (parsed === null || typeof parsed !== "object") {
        continue;
      }
      return `${JSON.stringify(parsed, null, 2)}\n`;
    } catch {
      // Try an earlier line-start candidate without exposing captured command output.
    }
  }

  throw new Error(`${label} did not produce a valid JSON object or array.`);
}
