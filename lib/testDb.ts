/**
 * Test-mode data and test accounts of the preview inside NEXA AI. The preview runs in an iframe whose
 * address changes with every reload, so the iframe cannot keep anything itself. The NEXA AI page keeps it
 * (per project) in its own localStorage and answers the iframe's db()/auth calls (see lib/backend.ts).
 * The logic is the same text the preview runs when it has no NEXA AI page around it (lib/testCore.ts).
 */
import { TEST_CORE_SOURCE } from "./testCore";

export type TestMsg = { nexaDb?: boolean; id?: string; op?: string; collection?: string; payload?: any };
type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };
type Core = (store: Store, scope: string, msg: TestMsg) => { result?: unknown; error?: string };

const OPS = ["list", "add", "update", "remove", "signUp", "signIn", "signOut", "me"];
let core: Core | null = null;

export function runTestOp(store: Store, scope: string, msg: TestMsg): { result?: unknown; error?: string } {
  if (typeof msg.op !== "string" || !OPS.includes(msg.op)) return { error: "Unknown request." };
  if (!core) core = new Function(TEST_CORE_SOURCE + "\nreturn nexaTestOp;")() as Core;
  return core(store, scope, msg);
}
