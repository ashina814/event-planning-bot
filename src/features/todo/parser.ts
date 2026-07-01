export function extractTodoCandidates(content: string): string[] {
  const sectionMatch = content.match(/【\s*To\s*Do\s*】([\s\S]*?)(?=\n【|$)/i);
  const section = sectionMatch?.[1] ?? "";
  if (!section.trim()) {
    return [];
  }

  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-・]\s*(?:\[\s*\]\s*)?/.test(line))
    .map((line) => line.replace(/^[-・]\s*(?:\[\s*\]\s*)?/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 20);
}
