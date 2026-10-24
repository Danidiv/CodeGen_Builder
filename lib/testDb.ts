/**
 * Test-mode data of the preview inside NEXA AI. The preview runs in an iframe whose address
 * changes with every reload, so the iframe cannot keep data itself. The NEXA AI page keeps it
 * (per project) in its own localStorage and answers the iframe's `db()` calls (see lib/backend.ts).
 */
export type TestMsg = { nexaDb?: boolean; id?: string; op?: string; collection?: string; payload?: any };
type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };
type Row = { id: string; createdAt: string; [k: string]: unknown };

const NAME = /^[a-z0-9 _-]{1,40}$/;
const MAX_ROWS = 200;

function rid(): string {
  return "t" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function runTestOp(store: Store, scope: string, msg: TestMsg): { result?: unknown; error?: string } {
  const collection = String(msg.collection ?? "").trim().toLowerCase();
  if (!NAME.test(collection)) return { error: "Bad collection name." };
  const key = `nexa-test-db:${scope}:${collection}`;
  let rows: Row[] = [];
  try {
    const parsed = JSON.parse(store.getItem(key) || "[]");
    if (Array.isArray(parsed)) rows = parsed;
  } catch {
    rows = [];
  }
  const save = () => {
    try {
      store.setItem(key, JSON.stringify(rows.slice(-MAX_ROWS)));
    } catch {
      // storage full or blocked: the preview keeps working, data is just not kept
    }
  };
  const fieldsOf = (v: unknown): Record<string, unknown> | null => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    if (JSON.stringify(v).length > 5000) return null;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k !== "id" && k !== "createdAt") out[k.slice(0, 60)] = val;
    }
    return out;
  };

  switch (msg.op) {
    case "list":
      return { result: rows };
    case "add": {
      const f = fieldsOf(msg.payload);
      if (!f) return { error: "Storage limit reached." };
      const row: Row = { ...f, id: rid(), createdAt: new Date().toISOString() };
      rows.push(row);
      save();
      return { result: row };
    }
    case "update": {
      const f = fieldsOf(msg.payload?.fields);
      const i = rows.findIndex((r) => r.id === msg.payload?.id);
      if (i < 0) return { error: "Item not found." };
      if (!f) return { error: "Storage limit reached." };
      rows[i] = { ...rows[i], ...f };
      save();
      return { result: rows[i] };
    }
    case "remove":
      rows = rows.filter((r) => r.id !== msg.payload?.id);
      save();
      return { result: null };
    default:
      return { error: "Unknown request." };
  }
}
