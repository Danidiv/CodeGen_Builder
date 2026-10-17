import { normalizePath, removeHidden } from "./parseFiles";

type Files = Record<string, string>;

/**
 * Small, targeted changes ("change the title", "make the button green") are
 * much more reliable as find-and-replace edits than as a full rewrite of the
 * file: the model only has to write a few lines, and we can check that the
 * text it wants to replace really exists.
 *
 * Format the model may use:
 *
 *   <edit path="/App.tsx">
 *   <find>
 *   exact text from the current file
 *   </find>
 *   <replace>
 *   new text
 *   </replace>
 *   </edit>
 */
export type Edit = { path: string; find: string; replace: string };
export type EditFailure = { path: string; reason: string };

export type ParsedEdits = {
  edits: Edit[];
  /** An <edit> or <find> block was opened but not finished (answer cut off or malformed). */
  incomplete: boolean;
};

/** Removes the newline after an opening tag / before a closing tag and stray code fences. */
function trimBody(s: string): string {
  let out = s.replace(/^\r?\n/, "").replace(/\r?\n[ \t]*$/, "");
  out = out.replace(/^```[a-zA-Z]*\r?\n/, "").replace(/\r?\n```\s*$/, "");
  return out;
}

export function parseEdits(raw: string): ParsedEdits {
  const text = removeHidden(raw);
  const edits: Edit[] = [];
  let incomplete = false;

  const opened = (text.match(/<edit\s/g) ?? []).length;
  const closed = (text.match(/<\/edit>/g) ?? []).length;
  if (opened !== closed) incomplete = true;

  for (const block of text.matchAll(/<edit\s+path="([^"]+)"\s*>([\s\S]*?)<\/edit>/g)) {
    const path = normalizePath(block[1]);
    const body = block[2];
    let pairs = 0;
    for (const pair of body.matchAll(/<find>([\s\S]*?)<\/find>\s*<replace>([\s\S]*?)<\/replace>/g)) {
      edits.push({ path, find: trimBody(pair[1]), replace: trimBody(pair[2]) });
      pairs += 1;
    }
    const finds = (body.match(/<find>/g) ?? []).length;
    if (finds !== pairs || pairs === 0) incomplete = true;
  }
  return { edits, incomplete };
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

function preview(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return JSON.stringify(one.length > 70 ? one.slice(0, 70) + "..." : one);
}

function indentOf(line: string): string {
  return line.match(/^[ \t]*/)![0];
}

/** Shifts the indentation of `text` from `from` to `to` (only lines that start with `from`). */
function reindent(text: string, from: string, to: string): string {
  if (from === to) return text;
  return text
    .split("\n")
    .map((line) => (line.trim() !== "" && line.startsWith(from) ? to + line.slice(from.length) : line))
    .join("\n");
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) return count;
    count += 1;
    from = i + needle.length;
  }
}

/**
 * Replaces exactly one place in `code`. First an exact match is tried; if that
 * fails, whole lines are compared ignoring indentation and trailing spaces,
 * because small models often get the spaces wrong.
 */
export function replaceOnce(
  code: string,
  find: string,
  replace: string
): { code: string } | { error: string } {
  const text = code.replace(/\r\n/g, "\n");
  const needle = find.replace(/\r\n/g, "\n");
  if (needle.trim() === "") return { error: "an <edit> has an empty <find>." };

  const exact = countOccurrences(text, needle);
  if (exact === 1) {
    const i = text.indexOf(needle);
    // slice() instead of String.replace so "$&" etc. in the new text stay literal
    return { code: text.slice(0, i) + replace + text.slice(i + needle.length) };
  }
  if (exact > 1) {
    return {
      error: `the text ${preview(find)} appears ${exact} times. Include more surrounding lines so it matches only one place.`,
    };
  }

  // Fallback: compare complete lines, ignoring leading/trailing spaces.
  const lines = text.split("\n");
  const findLines = needle.split("\n");
  while (findLines.length > 0 && findLines[0].trim() === "") findLines.shift();
  while (findLines.length > 0 && findLines[findLines.length - 1].trim() === "") findLines.pop();
  const wanted = findLines.map((l) => l.trim());

  const hits: number[] = [];
  for (let i = 0; i + wanted.length <= lines.length; i++) {
    if (wanted.every((w, j) => lines[i + j].trim() === w)) hits.push(i);
  }

  if (hits.length === 1) {
    const start = hits[0];
    const adjusted = reindent(replace, indentOf(findLines[0]), indentOf(lines[start]));
    const out = [...lines.slice(0, start), ...adjusted.split("\n"), ...lines.slice(start + wanted.length)];
    return { code: out.join("\n") };
  }
  if (hits.length > 1) {
    return { error: `the text ${preview(find)} matches ${hits.length} places. Include more surrounding lines.` };
  }
  return {
    error: `the text ${preview(find)} was not found in the file. <find> must be copied exactly from the current file.`,
  };
}

/**
 * Applies the edits to a copy of `base`. All-or-nothing per file: if any edit
 * of a file fails, nothing of that file is returned.
 */
export function applyEdits(base: Files, edits: Edit[]): { files: Files; failures: EditFailure[] } {
  const working: Files = { ...base };
  const touched = new Set<string>();
  const failures: EditFailure[] = [];

  for (const e of edits) {
    const code = working[e.path];
    if (code === undefined) {
      failures.push({
        path: e.path,
        reason: `${e.path} does not exist (<edit> can only change existing files; use <file> for new ones).`,
      });
      continue;
    }
    const r = replaceOnce(code, e.find, e.replace);
    if ("error" in r) {
      failures.push({ path: e.path, reason: `In ${e.path}: ${r.error}` });
      continue;
    }
    working[e.path] = r.code;
    touched.add(e.path);
  }

  const failed = new Set(failures.map((f) => f.path));
  const files: Files = {};
  for (const p of touched) if (!failed.has(p)) files[p] = working[p];
  return { files, failures };
}
