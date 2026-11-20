// Self-check: load index.ts with a mock ExtensionAPI and verify toggle behavior.
import assert from "node:assert";
import ext from "./index.ts";

const handlers: Record<string, any> = {};
let commandName = "";
let status: string | undefined;
let active = ["read", "bash", "edit", "write", "search"];
let settings: Record<string, unknown> = {};
const branch: any[] = [];

const pi = {
  getActiveTools: () => active,
  setActiveTools: (tools: string[]) => (active = tools),
  registerCommand: (name: string, opts: any) => {
    commandName = name;
    handlers.command = opts;
  },
  appendEntry: (customType: string) => branch.push({ type: "custom", customType }),
  on: (event: string, fn: Function) => (handlers[event] = fn),
};
const ctx = {
  ui: { setStatus: (_k: string, v?: string) => (status = v) },
  sessionManager: { getBranch: () => branch },
};

ext({ ...pi, getSettings: () => settings } as any);

assert.equal(commandName, "plan", "toggle command registered as /plan");

// session_start: plan mode is ON by default
await handlers.session_start({ reason: "startup" }, ctx);
assert.deepStrictEqual(active, ["read", "bash", "search"], "default ON: edit/write filtered");
assert.equal(status, "plan: ON");

// ON: contract attached as a hidden message on every user turn, not a system section
const onPrompt = {
  messageType: "user",
  systemPromptOptions: { sections: {} as Record<string, string> },
};
const reminder = await handlers.before_agent_start(onPrompt);
assert.equal(reminder.message.customType, "plan-mode-context", "ON: hidden message customType");
assert.equal(reminder.message.display, false, "ON: message hidden");
assert.match(reminder.message.content, /PLAN MODE/);
assert.match(reminder.message.content, /Questions and chat/, "ON: chat mode declared");
assert.doesNotMatch(reminder.message.content, /assumptions:\n1\./, "ON: numbered rules gone");
assert.equal(onPrompt.systemPromptOptions.sections.plan_mode, undefined, "ON: no system section");
assert.equal(
  await handlers.before_agent_start({ messageType: "custom" }),
  undefined,
  "custom run: no reminder",
);

// ON: write calls blocked, read/bash untouched, history kept
const blocked = await handlers.tool_call({ toolName: "write" });
assert.equal(blocked.block, true, "ON: write blocked");
assert.match(blocked.reason, /read-only/);
assert.equal((await handlers.tool_call({ toolName: "edit" })).block, true, "ON: edit blocked");
assert.equal(await handlers.tool_call({ toolName: "bash" }), undefined, "ON: bash allowed");
assert.equal(await handlers.tool_call({ toolName: "read" }), undefined, "ON: read allowed");
assert.equal(
  await handlers.context({ messages: [{ role: "user" }] }),
  undefined,
  "ON: unrelated context untouched",
);

// latest ```plan block wins: stripped from the transcript, injected once, hidden
const planned = await handlers.context({
  messages: [
    { role: "assistant", content: [{ type: "text", text: "before\n```plan\nold plan\n```" }] },
    { role: "user" },
    { role: "assistant", content: [{ type: "text", text: "mid\n```plan\nv2 plan\n```\nafter" }] },
    { role: "user", content: "next" },
  ],
});
assert.equal(planned.messages.length, 5, "plan: nothing dropped, one injection added");
assert.deepStrictEqual(
  planned.messages[0].content,
  [{ type: "text", text: "before" }],
  "plan: old block stripped",
);
assert.deepStrictEqual(
  planned.messages[2].content,
  [{ type: "text", text: "mid\n\nafter" }],
  "plan: latest block stripped, surrounding text kept",
);
assert.equal(planned.messages[4].customType, "plan-mode-plan", "plan: injected as custom message");
assert.match(planned.messages[4].content, /v2 plan/, "plan: latest body wins");
assert.equal(planned.messages[4].display, false, "plan: hidden");

// no plan anywhere: context untouched
assert.equal(
  await handlers.context({
    messages: [{ role: "assistant", content: [{ type: "text", text: "no plan here" }] }],
  }),
  undefined,
  "plan: absent plan leaves context alone",
);

// a previous injection with no new blocks: relocated next to the latest request
const kept = await handlers.context({
  messages: [
    { customType: "plan-mode-plan", content: "[CURRENT PLAN]\nold body" },
    { role: "user" },
  ],
});
assert.equal(kept.messages.length, 2, "plan: old injection replaced, not duplicated");
assert.equal(kept.messages[0].role, "user", "plan: injection moved after the user turn");
assert.equal(kept.messages[1].customType, "plan-mode-plan");
assert.match(kept.messages[1].content, /old body/, "plan: body survives the relocation");
const onPruned = await handlers.context({
  messages: [
    { customType: "plan-mode-off", content: "old off" },
    { customType: "plan-mode-context", content: "old on" },
    { role: "user" },
    { customType: "plan-mode-context", content: "new on" },
  ],
});
assert.deepStrictEqual(
  onPruned.messages,
  [{ role: "user" }, { customType: "plan-mode-context", content: "new on" }],
  "ON: stale OFF and ON notices pruned",
);

// toggle OFF: tools restored, status shows OFF, state persisted
await handlers.command.handler([], ctx);
assert.deepStrictEqual(active, ["read", "bash", "search", "edit", "write"], "OFF: restored");
assert.equal(status, "plan: OFF");
assert.equal(branch.at(-1)?.customType, "bareplan-off", "OFF: state entry persisted");

// OFF: explicit notice, stale state pruned, writes allowed again
const offReminder = await handlers.before_agent_start({ messageType: "user" });
assert.equal(offReminder.message.customType, "plan-mode-off", "OFF: explicit notice customType");
assert.equal(offReminder.message.display, false, "OFF: notice hidden");
assert.match(offReminder.message.content, /PLAN MODE OFF/);
assert.equal(
  await handlers.before_agent_start({ messageType: "custom" }),
  undefined,
  "OFF: custom run no notice",
);
const filtered = await handlers.context({
  messages: [
    { customType: "plan-mode-context", content: "old on" },
    { customType: "plan-mode-off", content: "old off" },
    { role: "user" },
    { customType: "plan-mode-off", content: "new off" },
  ],
});
assert.deepStrictEqual(
  filtered.messages,
  [{ role: "user" }, { customType: "plan-mode-off", content: "new off" }],
  "OFF: stale ON/OFF notices pruned, latest OFF kept",
);
assert.equal(await handlers.tool_call({ toolName: "edit" }), undefined, "OFF: writes allowed");

// second ON filters the current tool set again
await handlers.command.handler([], ctx);
assert.deepStrictEqual(active, ["read", "bash", "search"], "second ON: filters again");
assert.equal(branch.at(-1)?.customType, "bareplan-on", "ON: state entry persisted");
const again = await handlers.before_agent_start({ messageType: "user" });
assert.equal(again.message.customType, "plan-mode-context", "second ON: reminder again");
const onAgain = await handlers.context({
  messages: [
    { customType: "plan-mode-off", content: "stale off" },
    { role: "user" },
    { customType: "plan-mode-context", content: "new on" },
  ],
});
assert.deepStrictEqual(
  onAgain.messages,
  [{ role: "user" }, { customType: "plan-mode-context", content: "new on" }],
  "second ON: stale OFF notice dropped",
);

// a new session (empty transcript) turns plan mode back on after an OFF
await handlers.command.handler([], ctx);
assert.deepStrictEqual(active, ["read", "bash", "search", "edit", "write"], "OFF again: restored");
branch.length = 0;
await handlers.session_start({ reason: "new" }, ctx);
assert.deepStrictEqual(active, ["read", "bash", "search"], "new session: plan ON again");
assert.equal(status, "plan: ON");

// a tool another extension adds during plan mode survives turning it off
pi.setActiveTools([...active, "mcp_tool"]);
await handlers.command.handler([], ctx);
assert.deepStrictEqual(
  active,
  ["read", "bash", "search", "mcp_tool", "edit", "write"],
  "OFF: tool added during plan mode kept, write tools back",
);
assert.equal(status, "plan: OFF");

// resume: last state entry ON, transcript restore can start without the write tools at all
branch.length = 0;
branch.push({ type: "custom", customType: "bareplan-on" });
active = ["read", "bash", "search"];
await handlers.session_start({ reason: "resume" }, ctx);
assert.deepStrictEqual(active, ["read", "bash", "search"], "resume ON: still filtered while ON");
await handlers.command.handler([], ctx);
assert.deepStrictEqual(
  active,
  ["read", "bash", "search", "edit", "write"],
  "resume ON: OFF restores write tools the snapshot never had",
);
assert.equal(status, "plan: OFF");

// resume: last state entry OFF, session stays off with writes allowed
branch.length = 0;
branch.push({ type: "custom", customType: "bareplan-on" });
branch.push({ type: "custom", customType: "bareplan-off" });
await handlers.session_start({ reason: "resume" }, ctx);
assert.deepStrictEqual(
  active,
  ["read", "bash", "search", "edit", "write"],
  "resume OFF: write tools kept",
);
assert.equal(status, "plan: OFF");
assert.equal(await handlers.tool_call({ toolName: "edit" }), undefined, "resume OFF: edit allowed");
assert.equal(
  (await handlers.before_agent_start({ messageType: "user" })).message.customType,
  "plan-mode-off",
  "resume OFF: off notice on next turn",
);

// switch to a session whose last state is OFF disables actively, even when ON in memory
await handlers.command.handler([], ctx);
assert.deepStrictEqual(active, ["read", "bash", "search"], "ON in memory before switch");
branch.length = 0;
branch.push({ type: "custom", customType: "bareplan-off" });
await handlers.session_start({ reason: "resume" }, ctx);
assert.deepStrictEqual(
  active,
  ["read", "bash", "search", "edit", "write"],
  "switch to OFF session: write tools back",
);
assert.equal(status, "plan: OFF");

// branch navigation: transcript restore re-adds the write tools while ON
await handlers.command.handler([], ctx);
pi.setActiveTools(["read", "bash", "search", "edit", "write"]);
await handlers.session_tree({}, ctx);
assert.deepStrictEqual(
  active,
  ["read", "bash", "search"],
  "session_tree: write tools removed again while ON",
);
assert.equal(status, "plan: ON");

// branch navigation applies the saved state in both directions
branch.length = 0;
branch.push({ type: "custom", customType: "bareplan-off" });
await handlers.session_tree({}, ctx);
assert.deepStrictEqual(
  active,
  ["read", "bash", "search", "edit", "write"],
  "session_tree to OFF branch: write tools back",
);
assert.equal(status, "plan: OFF");
branch.length = 0;
branch.push({ type: "custom", customType: "bareplan-on" });
await handlers.session_tree({}, ctx);
assert.deepStrictEqual(
  active,
  ["read", "bash", "search"],
  "session_tree to ON branch: write tools hidden again",
);
assert.equal(status, "plan: ON");

// a write tool left out of the defaultTools setting is not resurrected on /plan off
settings = { defaultTools: ["read", "bash"] };
await handlers.command.handler([], ctx); // OFF
branch.length = 0;
branch.push({ type: "custom", customType: "bareplan-on" });
await handlers.session_start({ reason: "resume" }, ctx); // ON
await handlers.command.handler([], ctx); // OFF again
assert.deepStrictEqual(
  active,
  ["read", "bash", "search"],
  "OFF: edit/write excluded by defaultTools stay excluded",
);
assert.equal(status, "plan: OFF");
settings = {};

console.log("ok — all assertions passed");
