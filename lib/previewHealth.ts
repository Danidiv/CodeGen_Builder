/**
 * How a slow or stuck preview start-up is judged and explained.
 * No React in here, so the rules can be tested on their own.
 */

/** Seconds of "loading" after which the connection to the preview server is checked. */
export const PROBE_AFTER = 12;
/** Seconds of "loading" after which the help panel is shown. */
export const SHOW_HELP_AFTER = 15;
/**
 * Seconds of "loading" after which the preview is restarted once by itself.
 * Deliberately long: on a slow connection the first start really can take
 * a minute or more, and restarting too early would only start the download over.
 */
export const AUTO_RELOAD_AFTER = 90;
/** How many automatic restarts happen before we leave it to the user. */
export const MAX_AUTO_RELOADS = 1;

export type Probe = { host: string; ok: boolean; ms: number };

export function shouldAutoReload(elapsed: number, busy: boolean, autoReloadsDone: number): boolean {
  return !busy && autoReloadsDone < MAX_AUTO_RELOADS && elapsed >= AUTO_RELOAD_AFTER;
}

export type StallInfo = {
  headline: string;
  lines: string[];
  /** checking = probe not finished yet, ok = server answers, blocked = server cannot be reached */
  connection: "checking" | "ok" | "blocked";
};

export function describeStall(elapsed: number, probe: Probe | null, timedOut = false): StallInfo {
  const headline = timedOut
    ? "The preview server did not answer in time."
    : `The preview is taking longer than usual (${elapsed}s).`;

  if (!probe) {
    return {
      headline,
      connection: "checking",
      lines: ["Checking the connection to the preview server..."],
    };
  }

  if (!probe.ok) {
    return {
      headline,
      connection: "blocked",
      lines: [
        `Your browser cannot reach the preview server (${probe.host}).`,
        "Turn off any VPN, ad-blocker or browser shield (for example Brave) for this page, or try another " +
          "network such as a phone hotspot. Then press Reload preview.",
      ],
    };
  }

  const lines = [`The preview server (${probe.host}) answers in ${probe.ms} ms, so the connection works.`];
  if (probe.ms > 3000) lines.push("The connection is slow, which delays the first start.");
  lines.push(
    "The first start downloads the packages and can take up to 2 minutes on a slow connection. " +
      "If nothing appears after that, press Reload preview."
  );
  return { headline, connection: "ok", lines };
}

/**
 * Checks from the browser whether the server that runs the preview can be
 * reached at all. It asks the same host the preview iframe talks to; if no
 * iframe is found yet it asks codesandbox.io. Only the network matters here,
 * so the answer itself is not read (no-cors).
 */
export async function probeServer(timeoutMs = 10000): Promise<Probe> {
  let url = "https://codesandbox.io/";
  try {
    const frame = document.querySelector<HTMLIFrameElement>('iframe.sp-preview-iframe, iframe[src^="https://"]');
    const src = frame?.src;
    if (src && /^https:\/\//i.test(src)) url = new URL(src).origin + "/";
  } catch {
    // keep the default
  }

  let host = "codesandbox.io";
  try {
    host = new URL(url).host;
  } catch {
    // keep the default
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    await fetch(url, { mode: "no-cors", cache: "no-store", signal: controller.signal });
    return { host, ok: true, ms: Math.round(performance.now() - started) };
  } catch {
    return { host, ok: false, ms: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}
