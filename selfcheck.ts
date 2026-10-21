// Self-check: load index.ts with a mock ExtensionAPI and verify toggle behavior.
import assert from "node:assert";
import ext from "./index.ts";

const calls: { op: string; tools?: string[] }[] = [];
const handlers: Record<string, Function> = {};
let status: string | undefined;

const pi = {
  getActiveTools: () => ["read", "bash", "edit", "write", "search"],
  setActiveTools: (tools: string[]) => calls.push({ op: "setActiveTools", tools }),
  registerCommand: (_name: string, opts: any) => (handlers.command = opts),
  on: (event: string, fn: Function) => (handlers[event] = fn),
};
const ctx = { ui: { setStatus: (_k: string, v?: string) => (status = v) } };

ext(pi as any);

// session_start: plan mode is ON by default
await handlers.session_start({ reason: "startup" }, ctx);
assert.deepStrictEqual(calls[0].tools, ["read", "bash", "search"], "default ON: edit/write filtered");
assert.equal(status, "plan: ON");

// ON: contract attached as a hidden message on every user turn, not a system section
const onPrompt = { messageType: "user", systemPromptOptions: { sections: {} as Record<string, string> } };
const reminder = await handlers.before_agent_start(onPrompt);
assert.equal(reminder.message.customType, "plan-mode-context", "ON: hidden message customType");
assert.equal(reminder.message.display, false, "ON: message hidden");
assert.match(reminder.message.content, /PLAN MODE/);
assert.match(reminder.message.content, /grep/);
assert.match(reminder.message.content, /greeting/i);
assert.equal(onPrompt.systemPromptOptions.sections.plan_mode, undefined, "ON: no system section");
assert.equal(await handlers.before_agent_start({ messageType: "custom" }), undefined, "custom run: no reminder");

// ON: write calls blocked, read/bash untouched, history kept
const blocked = await handlers.tool_call({ toolName: "write" });
assert.equal(blocked.block, true, "ON: write blocked");
assert.match(blocked.reason, /read-only/);
assert.equal((await handlers.tool_call({ toolName: "edit" })).block, true, "ON: edit blocked");
assert.equal(await handlers.tool_call({ toolName: "bash" }), undefined, "ON: bash allowed");
assert.equal(await handlers.tool_call({ toolName: "read" }), undefined, "ON: read allowed");
assert.equal(await handlers.context({ messages: [] }), undefined, "ON: context untouched");

// toggle OFF: tools restored, status shows OFF
await handlers.command.handler([], ctx);
assert.deepStrictEqual(calls[1].tools, ["read", "bash", "edit", "write", "search"], "OFF: restored");
assert.equal(status, "plan: OFF");

// OFF: no reminder, stale plan messages filtered, writes allowed again
assert.equal(await handlers.before_agent_start({ messageType: "user" }), undefined, "OFF: no reminder");
const filtered = await handlers.context({ messages: [{ customType: "plan-mode-context" }, { role: "user" }] });
assert.deepStrictEqual(filtered.messages, [{ role: "user" }], "OFF: stale plan message dropped");
assert.equal(await handlers.tool_call({ toolName: "edit" }), undefined, "OFF: writes allowed");

// second ON re-snapshots current tools (savedTools cleared on OFF)
await handlers.command.handler([], ctx);
assert.deepStrictEqual(calls[2].tools, ["read", "bash", "search"], "second ON: filters again");
const again = await handlers.before_agent_start({ messageType: "user" });
assert.equal(again.message.customType, "plan-mode-context", "second ON: reminder again");

// a new session turns plan mode back on after an OFF
await handlers.command.handler([], ctx);
assert.deepStrictEqual(calls[3].tools, ["read", "bash", "edit", "write", "search"], "OFF again: restored");
await handlers.session_start({ reason: "new" }, ctx);
assert.deepStrictEqual(calls[4].tools, ["read", "bash", "search"], "new session: plan ON again");
assert.equal(status, "plan: ON");

console.log("ok — all assertions passed");
