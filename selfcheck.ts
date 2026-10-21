// Self-check: load index.ts with a mock ExtensionAPI and verify toggle behavior.
import assert from "node:assert";
import ext from "./index.ts";

const calls: { op: string; tools?: string[] }[] = [];
const handlers: Record<string, Function> = {};
let status: string | undefined;
const notifications: string[] = [];

const pi = {
  getActiveTools: () => ["read", "bash", "edit", "write", "search"],
  setActiveTools: (tools: string[]) => calls.push({ op: "setActiveTools", tools }),
  registerCommand: (_name: string, opts: any) => (handlers.command = opts),
  on: (event: string, fn: Function) => (handlers[event] = fn),
};
const ctx = { ui: { notify: (m: string) => notifications.push(m), setStatus: (_k: string, v?: string) => (status = v) } };

ext(pi as any);

// toggle ON: write tools gone, status set
await handlers.command.handler([], ctx);
assert.deepStrictEqual(calls[0].tools, ["read", "bash", "search"], "ON: edit/write filtered");
assert.equal(status, "plan");
assert.deepStrictEqual(notifications, ["Plan mode ON"]);

// injection while ON
const injected = await handlers.before_agent_start({ messageType: "user" });
assert.equal(injected.message.display, false);
assert.equal(injected.message.customType, "plan-mode-context");
assert.match(injected.message.content, /PLAN MODE/);

// no injection for non-user runs
assert.equal(await handlers.before_agent_start({ messageType: "custom" }), undefined);

// context NOT filtered while ON
assert.equal(await handlers.context({ messages: [{ customType: "plan-mode-context" }] }), undefined);

// toggle OFF: tools restored, status cleared
await handlers.command.handler([], ctx);
assert.deepStrictEqual(calls[1].tools, ["read", "bash", "edit", "write", "search"], "OFF: restored");
assert.equal(status, undefined);
assert.equal(notifications[1], "Plan mode OFF");

// context filtered while OFF
const filtered = await handlers.context({ messages: [{ customType: "plan-mode-context" }, { role: "user", content: "hi" }] });
assert.deepStrictEqual(filtered.messages, [{ role: "user", content: "hi" }], "OFF: stale plan msg dropped");

// second ON re-snapshots current tools (savedTools cleared on OFF)
await handlers.command.handler([], ctx);
assert.deepStrictEqual(calls[2].tools, ["read", "bash", "search"], "second ON: filters again");

console.log("ok — all assertions passed");
