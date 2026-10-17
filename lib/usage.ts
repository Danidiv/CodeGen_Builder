/** Daily AI request limit per signed-in user (see supabase/schema.sql). */

export const DEFAULT_DAILY_LIMIT = 30;

export type Usage = { allowed: boolean; used: number; limit: number };

/** DAILY_LIMIT from the environment. 0 = unlimited. Missing or invalid = default. */
export function parseLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_DAILY_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DAILY_LIMIT;
  return Math.floor(n);
}

export function limitMessage(u: Usage): string {
  return (
    `Daily limit reached (${u.used} of ${u.limit} AI requests used today). ` +
    `It resets at 05:00 Pakistan time (00:00 UTC). You can still edit code and use History.`
  );
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** Counts one request (consume=true) or only reads today's number (consume=false). */
export async function callUsage(sb: RpcClient, limit: number, consume: boolean): Promise<Usage> {
  const { data, error } = await sb.rpc(consume ? "consume_usage" : "get_usage", { p_limit: limit });
  if (error) {
    if (/could not find the function|does not exist|schema cache/i.test(error.message)) {
      throw new Error("The usage limit is not set up yet. Run supabase/schema.sql again in the Supabase SQL Editor.");
    }
    throw new Error("Usage check failed: " + error.message);
  }
  const d = data as Partial<Usage> | null;
  if (!d || typeof d.used !== "number") throw new Error("Usage check returned an unexpected answer.");
  return { allowed: d.allowed !== false, used: d.used, limit };
}
