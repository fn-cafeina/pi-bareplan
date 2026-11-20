import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// Not a sandbox: bash stays available, so this hides write tools and blocks edit/write
// calls; it does not guarantee read-only against shell commands.
const WRITE_TOOLS = new Set(["edit", "write"]);
const PLAN_ON_TYPE = "plan-mode-context";
const PLAN_OFF_TYPE = "plan-mode-off";
// Last-toggle state, persisted in the session file so session_start can restore it.
const PLAN_ON_ENTRY = "bareplan-on";
const PLAN_OFF_ENTRY = "bareplan-off";

// Keep this contract in English. Only the answer follows the user's language.
const PLAN_CONTRACT = `[PLAN MODE] Read-only. No file changes, no writes through bash. Inspection only.

Changing code: read the code and every caller first, then propose. Stop there; do not implement until approved. If asked to edit anyway: plan mode is read-only, offer /plan.
Questions and chat: answer directly, no proposal.
Code claims: only from files read this session; otherwise say "assumption".
Ambiguous request: ask.

End every change proposal with a \`\`\`plan block holding the whole current plan (goal, steps, open questions). Rewrite it complete, never append.`;

// OFF needs a positive signal; otherwise the model keeps repeating its earlier plan-mode answers.
const PLAN_OFF_NOTICE = `[PLAN MODE OFF] Plan mode is off for this session. Writes are allowed. Do not claim plan mode is active or ask for approval before editing. If a plan you gave earlier in this session is in the conversation, follow it; otherwise work normally.`;

// Hidden per-turn copy of the latest plan; the transcript keeps zero copies.
const PLAN_TYPE = "plan-mode-plan";
const PLAN_PREFIX = "[CURRENT PLAN]\n";
const PLAN_BLOCK = /```plan\r?\n([\s\S]*?)```/g;

export default function (pi: ExtensionAPI) {
  let enabled = false;

  const setStatus = (ctx: ExtensionContext) =>
    ctx.ui.setStatus("bareplan", enabled ? "plan: ON" : "plan: OFF");

  const enable = (ctx: ExtensionContext) => {
    enabled = true;
    pi.setActiveTools(pi.getActiveTools().filter((t) => !WRITE_TOOLS.has(t)));
    setStatus(ctx);
  };

  // A write tool the user's defaultTools setting leaves out stays out on /plan off.
  const configAllows = (tool: string) => {
    const selected = pi.getSettings().defaultTools;
    return !selected || selected.includes(tool) || selected.includes(`+${tool}`);
  };

  const disable = (ctx: ExtensionContext) => {
    enabled = false;
    // Add back what plan mode removed; adds and removes by others survive.
    // shortcut: `--tools -write` modifiers are invisible here, upgrade when ctx exposes them.
    pi.setActiveTools([
      ...new Set([...pi.getActiveTools(), ...[...WRITE_TOOLS].filter((t) => configAllows(t))]),
    ]);
    setStatus(ctx);
  };

  pi.registerCommand("plan", {
    description: "Toggle plan mode (read-only)",
    handler: async (_args, ctx) => {
      pi.appendEntry(!enabled ? PLAN_ON_ENTRY : PLAN_OFF_ENTRY);
      (enabled ? disable : enable)(ctx);
    },
  });

  // Saved state: last /plan entry on the branch, ON when there is none.
  const applySavedState = (ctx: ExtensionContext) => {
    const last = ctx.sessionManager
      .getBranch()
      .findLast(
        (e) =>
          e.type === "custom" &&
          (e.customType === PLAN_ON_ENTRY || e.customType === PLAN_OFF_ENTRY),
      );
    const off = last?.type === "custom" && last.customType === PLAN_OFF_ENTRY;
    (off ? disable : enable)(ctx);
  };

  // Fresh sessions start in plan mode; resumed or switched ones restore the last /plan
  // state from the transcript (custom entries never enter the LLM context).
  pi.on("session_start", async (_event, ctx) => applySavedState(ctx));

  // Branch navigation lands on a branch whose saved state may differ from memory;
  // re-apply it in both directions.
  pi.on("session_tree", async (_event, ctx) => applySavedState(ctx));

  // Hidden per-turn state right after the user prompt: small models follow a
  // reminder next to the request more reliably than a one-time system prompt section.
  pi.on("before_agent_start", async (event) => {
    if (event.messageType !== "user") return;
    return {
      message: {
        customType: enabled ? PLAN_ON_TYPE : PLAN_OFF_TYPE,
        content: enabled ? PLAN_CONTRACT : PLAN_OFF_NOTICE,
        display: false,
      },
    };
  });

  // State notices: keep only the latest, drop the other state. Plans: strip every
  // ```plan block from the transcript and re-inject one hidden copy next to the
  // request, so the latest plan survives accumulated chat without growing context.
  pi.on("context", async (event) => {
    const keep = enabled ? PLAN_ON_TYPE : PLAN_OFF_TYPE;
    const drop = enabled ? PLAN_OFF_TYPE : PLAN_ON_TYPE;
    const state = (m: unknown) => (m as { customType?: string }).customType;
    const lastKeep = event.messages.findLastIndex((m) => state(m) === keep);

    let plan: string | undefined;
    let dirty = false;
    const messages: (typeof event.messages)[number][] = [];
    for (let i = 0; i < event.messages.length; i++) {
      const m = event.messages[i];
      const t = state(m);
      if (t === PLAN_TYPE) {
        // Previous injection: the fallback plan when no newer block exists.
        dirty = true;
        const c = (m as { content?: unknown }).content;
        const body = typeof c === "string" ? c.slice(PLAN_PREFIX.length) : "";
        if (body) plan = body;
        continue;
      }
      if ((t === keep && i !== lastKeep) || t === drop) {
        dirty = true;
        continue;
      }
      // Assistant message: strip plan blocks, remember the last body. Cast keeps the
      // union narrow; the spread preserves fields the type cannot see.
      const am = m as { role?: string; content?: Array<{ type: string; text: string }> };
      if (am.role !== "assistant" || !am.content) {
        messages.push(m);
        continue;
      }
      let touched = false;
      const content: Array<{ type: string; text: string }> = [];
      for (const b of am.content) {
        if (b.type !== "text" || !b.text.match(PLAN_BLOCK)) {
          content.push(b);
          continue;
        }
        touched = true;
        const body = [...b.text.matchAll(PLAN_BLOCK)].at(-1)?.[1]?.trim();
        if (body) plan = body;
        const rest = b.text.replace(PLAN_BLOCK, "").trim();
        if (rest) content.push({ ...b, text: rest });
      }
      if (!touched) {
        messages.push(m);
        continue;
      }
      dirty = true;
      messages.push({
        ...m,
        content: content.length ? content : [{ type: "text", text: "(plan moved)" }],
      } as typeof m);
    }

    if (plan) {
      dirty = true;
      messages.push({
        customType: PLAN_TYPE,
        content: PLAN_PREFIX + plan,
        display: false,
      } as (typeof event.messages)[number]);
    }
    if (!dirty) return;
    return { messages };
  });

  // Keep the guarantee when another extension re-enables a write tool or calls it nested.
  pi.on("tool_call", async (event) => {
    if (enabled && WRITE_TOOLS.has(event.toolName)) {
      return {
        block: true,
        reason: "Plan mode is read-only. Present the plan and wait for approval.",
      };
    }
  });
}
