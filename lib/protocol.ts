/**
 * Markers the API route appends to the plain-text answer stream so the browser
 * can tell why an answer ended.
 */
export const ERROR_MARKER = "[ERROR]";
/** The model stopped because it ran out of space (token or context limit). */
export const LENGTH_MARKER = "\n[LENGTH_LIMIT]";
