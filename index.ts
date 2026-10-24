import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// Not a sandbox: bash stays available, so this hides write tools and blocks edit/write
// calls; it does not guarantee read-only against shell commands.
const WRITE_TOOLS = new Set(["edit", "write"]);
const PLAN_ON_TYPE = "plan-mode-context";
const PLAN_OFF_TYPE = "plan-mode-off";

// Keep this contract in English. Only the answer follows the user's language.
const PLAN_CONTRACT = `[PLAN MODE] Read-only. Do not modify files, and do not write through bash either.

Read-only means no action whose purpose is to change state. No file edits, no shell commands that install, create, delete, move, download or commit anything, no writes dressed up as "setup", "fixes" or "cleanup". Inspection only.

Plan with evidence, not assumptions:
1. Every claim about the code must come from a file you read in this session. Never cite a path, line number, API, signature, config key or command you have not seen with your own tools.
2. No change is too small to skip reading. Locate the code the change touches and every caller of each function you would edit, then read them.
3. Any step that rests on something you did not verify is an assumption. Mark it as one instead of stating it as fact.
4. Run only checks that inspect without writing: tests, typecheck, existing patterns, installed dependencies.
5. If the request is ambiguous or the scope is unclear, say what is unclear and ask. Do not pick a reading and run with it.

Then answer the user directly, in their language, and stop at the proposal. Do not implement until the user approves. If the user asks you to skip the plan or edit files anyway, say plan mode is read-only and offer /plan to turn it off.`;

// OFF needs a positive signal; otherwise the model keeps repeating its earlier plan-mode answers.
const PLAN_OFF_NOTICE = `[PLAN MODE OFF] Plan mode is off for this session. Writes are allowed. Do not claim plan mode is active or ask for approval before editing.`;

export default function (pi: ExtensionAPI) {
  let enabled = false;
  let savedTools: string[] | undefined;

  const setStatus = (ctx: ExtensionContext) =>
    ctx.ui.setStatus("bareplan", enabled ? "plan: ON" : "plan: OFF");

  const enable = (ctx: ExtensionContext) => {
    enabled = true;
    savedTools ??= pi.getActiveTools();
    pi.setActiveTools(savedTools.filter((t) => !WRITE_TOOLS.has(t)));
    setStatus(ctx);
  };

  const disable = (ctx: ExtensionContext) => {
    enabled = false;
    // Restore only what plan mode removed; adds and removes by others survive.
    const active = pi.getActiveTools();
    const saved = savedTools;
    pi.setActiveTools(
      saved
        ? [
            ...saved.filter((t) => WRITE_TOOLS.has(t) || active.includes(t)),
            ...active.filter((t) => !saved.includes(t)),
          ]
        : active,
    );
    savedTools = undefined;
    setStatus(ctx);
  };

  pi.registerCommand("plan", {
    description: "Toggle plan mode (read-only)",
    handler: async (_args, ctx) => {
      if (enabled) {
        disable(ctx);
      } else {
        enable(ctx);
      }
    },
  });

  // Start every session in plan mode; /plan turns it off for that session.
  pi.on("session_start", async (_event, ctx) => enable(ctx));

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

  // Keep only the latest state notice and drop the other state, so stale instructions cannot win.
  pi.on("context", async (event) => {
    const keep = enabled ? PLAN_ON_TYPE : PLAN_OFF_TYPE;
    const drop = enabled ? PLAN_OFF_TYPE : PLAN_ON_TYPE;
    const state = (m: unknown) => (m as { customType?: string }).customType;
    const lastKeep = event.messages.findLastIndex((m) => state(m) === keep);
    const filtered = event.messages.filter((m, i) =>
      state(m) === keep ? i === lastKeep : state(m) !== drop,
    );
    if (filtered.length === event.messages.length) return;
    return { messages: filtered };
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
