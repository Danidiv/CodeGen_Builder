import { extractFallbackFiles, looksLikeToolCall, parseFiles } from "./parseFiles";
import { applyEdits, parseEdits } from "./edits";
import { checkResult } from "./validate";

type Files = Record<string, string>;

/** Why an answer could not be used at all (nothing to apply). */
export type EmptyReason = "toolCall" | "noCode" | "unchanged" | "badEdits" | "cutOff" | "tooLong";

export type Interpreted = {
  /** Files that can be applied: complete contents of every new or changed file (may be empty) */
  files: Files;
  /** Short chat message from the model, cleaned */
  message: string;
  /** Why the answer is not usable / looks broken, or null if fine */
  problem: string | null;
  /** The model answered with a tool call instead of code */
  toolCall: boolean;
  /** Set when `files` is empty: what went wrong, for a friendly message */
  emptyReason: EmptyReason | null;
  /** At least one <edit> patch was applied */
  usedEdits: boolean;
  /** The answer ran out of space (length limit hit or a file was cut off): ask for a shorter one */
  tooLong: boolean;
};

/**
 * Turns the complete raw model answer into files + message + a verdict.
 * The model may answer with full <file> blocks, with <edit> patches, or both
 * (a full file wins over patches for the same path).
 * `truncated` is true when the server reported that the model hit its length limit.
 */
export function interpretResponse(raw: string, base: Files, truncated = false): Interpreted {
  const toolCall = looksLikeToolCall(raw);
  const parsed = parseFiles(raw);
  let files: Files = { ...parsed.files };
  let message = parsed.message;
  let problem: string | null = null;
  let emptyReason: EmptyReason | null = null;
  let usedEdits = false;

  // A file that never got its closing tag was cut off: do not trust it.
  if (parsed.openFile) {
    delete files[parsed.openFile];
    problem = `Your answer was cut off inside ${parsed.openFile} (no closing </file>).`;
    emptyReason = "cutOff";
  }

  // <edit> patches
  const { edits, incomplete } = parseEdits(raw);
  const wanted = edits.filter((e) => !(e.path in files));
  if (wanted.length > 0 || incomplete) {
    const applied = applyEdits(base, wanted);
    if (incomplete) {
      problem = problem ?? "Your <edit> blocks were cut off or malformed (each needs <find> and <replace>).";
      emptyReason = emptyReason ?? "badEdits";
      files = {}; // never apply half of a set of edits
    } else if (applied.failures.length > 0) {
      problem =
        problem ??
        "Some of your <edit> blocks could not be applied: " +
          applied.failures
            .slice(0, 3)
            .map((f) => f.reason)
            .join(" ");
      emptyReason = emptyReason ?? "badEdits";
      files = {};
    } else {
      Object.assign(files, applied.files);
      usedEdits = Object.keys(applied.files).length > 0;
    }
  }

  // The model ignored our formats; try a plain markdown code block.
  if (Object.keys(files).length === 0 && !problem) {
    const fallback = extractFallbackFiles(raw);
    if (fallback) {
      files = fallback.files;
      message = fallback.message;
    }
  }

  // Files identical to what we already have change nothing.
  const returned = Object.keys(files).length;
  const changed: Files = {};
  for (const [path, content] of Object.entries(files)) {
    if ((base[path] ?? "").trim() !== content.trim()) changed[path] = content;
  }
  files = changed;

  // Cut off by the length limit: whatever is missing, the real cause is "too long".
  const tooLong = (truncated || !!parsed.openFile) && (!!problem || Object.keys(files).length === 0);
  if (tooLong) {
    problem = "Your answer was too long and was cut off before it finished.";
    if (Object.keys(files).length === 0 || parsed.openFile) emptyReason = "tooLong";
  }

  if (Object.keys(files).length === 0) {
    if (!emptyReason) {
      emptyReason = returned > 0 ? "unchanged" : toolCall ? "toolCall" : "noCode";
    }
    problem =
      problem ??
      (emptyReason === "unchanged"
        ? "The files you returned are identical to the current ones, so nothing changed. Actually make the requested change."
        : emptyReason === "toolCall"
          ? "You answered with a tool call instead of file blocks."
          : "You did not output any <file> or <edit> blocks.");
  } else {
    emptyReason = null;
    if (!problem) problem = checkResult(base, files);
  }

  return { files, message, problem, toolCall, emptyReason, usedEdits, tooLong };
}
