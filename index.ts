import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Not a sandbox: bash stays available, so this hides write tools and reminds the
// model, it does not guarantee read-only against shell commands.
const WRITE_TOOLS = new Set(["edit", "write"]);

const PLAN_CONTEXT = `[PLAN MODE]
Read-only. No modifiques nada. Investiga con read/grep/bash y responde con un plan numerado bajo cabecera "Plan:".`;

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

  pi.on("before_agent_start", async (event) => {
    if (!enabled || event.messageType !== "user") return;
    return {
      message: {
        customType: "plan-mode-context",
        content: PLAN_CONTEXT,
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
}
