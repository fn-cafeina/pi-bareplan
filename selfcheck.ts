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

// ON: contract lands in the system prompt section, nothing injected as a message
const onPrompt = { systemPromptOptions: { sections: {} as Record<string, string> } };
assert.equal(await handlers.before_agent_start(onPrompt), undefined, "ON: no hidden message");
assert.match(onPrompt.systemPromptOptions.sections.plan_mode, /PLAN MODE/);
assert.match(onPrompt.systemPromptOptions.sections.plan_mode, /grep/);

// toggle OFF: tools restored, status cleared
await handlers.command.handler([], ctx);
assert.deepStrictEqual(calls[1].tools, ["read", "bash", "edit", "write", "search"], "OFF: restored");
assert.equal(status, undefined);
assert.equal(notifications[1], "Plan mode OFF");

// OFF: stale section cleared, writes allowed again
const offPrompt = { systemPromptOptions: { sections: { plan_mode: "stale" } } };
await handlers.before_agent_start(offPrompt);
assert.equal(offPrompt.systemPromptOptions.sections.plan_mode, "", "OFF: section cleared");

// second ON re-snapshots current tools (savedTools cleared on OFF)
await handlers.command.handler([], ctx);
assert.deepStrictEqual(calls[2].tools, ["read", "bash", "search"], "second ON: filters again");

console.log("ok — all assertions passed");
