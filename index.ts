import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Not a sandbox: bash stays available, so this hides write tools and blocks edit/write
// calls; it does not guarantee read-only against shell commands.
const WRITE_TOOLS = new Set(["edit", "write"]);

// Keep this contract in English. Only the answer follows the user's language.
const PLAN_CONTRACT = `[PLAN MODE] Read-only. Do not modify files, and do not write through bash either.

Before you write the plan:
1. Locate the code: grep and read every file the change touches, and every caller of each function you would edit.
2. Read them. Never plan against a file you have not read, and never invent an API, signature, config key or command.
3. Check what can be checked read-only: tests, typecheck, existing patterns, installed dependencies.
4. Keep a clear split between what you verified and what you could not.

Answer with, under "Plan:":
1. Numbered steps, smallest complete change first. Each step: file path (and line when it helps), what changes, why.
2. Scope: the callers, tests, fixtures and config the change reaches.
3. Verification: the exact command or check that proves it works.
4. Risks, and what you did not check.
5. Open questions only when the decision is the user's to make. Otherwise pick the simplest option and say so.

Rules: no code until approved; no scope beyond the request; deletion beats addition; name in one line any extra feature you skip. Write in the user's language.`;

export default function (pi: ExtensionAPI) {
  let enabled = false;
  let savedTools: string[] | undefined;

  const setStatus = (ctx: { ui: { setStatus(key: string, text: string | undefined): void } }) =>
    ctx.ui.setStatus("bareplan", enabled ? "plan" : undefined);

  pi.registerCommand("plan", {
    description: "Toggle plan mode (read-only)",
    handler: (_args, ctx) => {
      enabled = !enabled;
      if (enabled) {
        savedTools ??= pi.getActiveTools();
        pi.setActiveTools(savedTools.filter((t) => !WRITE_TOOLS.has(t)));
        ctx.ui.notify("Plan mode ON", "info");
      } else {
        pi.setActiveTools(savedTools ?? pi.getActiveTools());
        savedTools = undefined;
        ctx.ui.notify("Plan mode OFF", "info");
      }
      setStatus(ctx);
    },
  });

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
