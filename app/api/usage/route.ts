import { getBearer, requireUser, userClient } from "@/lib/serverAuth";
import { callUsage, parseLimit } from "@/lib/usage";

export const runtime = "nodejs";

/** Today's usage for the signed-in user (does not count as a request). */
export async function GET(req: Request) {
  const denied = await requireUser(req);
  if (denied) return denied;
  const sb = userClient(getBearer(req));
  if (!sb) return Response.json({ used: 0, limit: 0 }); // local mode: no limit
  try {
    const u = await callUsage(sb, parseLimit(process.env.DAILY_LIMIT), false);
    return Response.json({ used: u.used, limit: u.limit });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Usage check failed.", { status: 500 });
  }
}
