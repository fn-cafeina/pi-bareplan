import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Not a sandbox: bash stays available, so this hides write tools and blocks edit/write
// calls; it does not guarantee read-only against shell commands.
const WRITE_TOOLS = new Set(["edit", "write"]);

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

type StatusCtx = { ui: { setStatus(key: string, text: string | undefined): void } };

export default function (pi: ExtensionAPI) {
  let enabled = false;
  let savedTools: string[] | undefined;

  const setStatus = (ctx: StatusCtx) => ctx.ui.setStatus("bareplan", enabled ? "plan: ON" : "plan: OFF");

  const enable = (ctx: StatusCtx) => {
    enabled = true;
    savedTools ??= pi.getActiveTools();
    pi.setActiveTools(savedTools.filter((t) => !WRITE_TOOLS.has(t)));
    setStatus(ctx);
  };

  const disable = (ctx: StatusCtx) => {
    enabled = false;
    pi.setActiveTools(savedTools ?? pi.getActiveTools());
    savedTools = undefined;
    setStatus(ctx);
  };

  pi.registerCommand("plan", {
    description: "Toggle plan mode (read-only)",
    handler: (_args, ctx) => {
      if (enabled) {
        disable(ctx);
      } else {
        enable(ctx);
      }
    },
  });

  // Start every session in plan mode; /plan turns it off for that session.
  pi.on("session_start", async (_event, ctx) => enable(ctx));

  // Hidden per-turn message right after the user prompt: small models follow a
  // reminder next to the request more reliably than a one-time system prompt section.
  pi.on("before_agent_start", async (event) => {
    if (!enabled || event.messageType !== "user") return;
    return {
      message: {
        customType: "plan-mode-context",
        content: PLAN_CONTRACT,
        display: false,
      },
    };
  });

  // Drop stale plan instructions from the model's view once the mode is off.
  pi.on("context", async (event) => {
    if (enabled) return;
    return {
      messages: event.messages.filter((m) => (m as { customType?: string }).customType !== "plan-mode-context"),
    };
  });

  // Keep the guarantee when another extension re-enables a write tool or calls it nested.
  pi.on("tool_call", async (event) => {
    if (enabled && WRITE_TOOLS.has(event.toolName)) {
      return { block: true, reason: "Plan mode is read-only. Present the plan and wait for approval." };
    }
  });
}
