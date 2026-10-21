# pi-bareplan

Pi extension that starts sessions in plan mode: read-only investigation, then a numbered plan, until you turn it off.

## How it works

Plan mode is enabled when a session starts. `/plan` toggles it for that session:

- **ON**: `edit` and `write` are removed from the active tools and any call to them is blocked. A hidden `[PLAN MODE]` message is attached to every user turn: investigate first, never plan against a file you have not read, then answer with a numbered plan under a `Plan:` header covering scope, verification and risks. The same message tells the model to answer a greeting briefly, without tools. The status bar shows `plan`.
- **OFF**: saved tools are restored, the status indicator clears, and stale `[PLAN MODE]` messages are filtered out of the model's context.

The reminder repeats on every turn on purpose. A one-time system prompt section is easy for small models to drop, especially next to a direct request to implement.

## Not a sandbox

`bash` stays available, so the model can still modify files through shell commands. Plan mode hides and blocks the write tools, and the prompt forbids writing through bash, but it does not enforce it.

## Install

```bash
pi install npm:pi-bareplan                          # from npm (recommended)
pi install git:github.com/fn-cafeina/pi-bareplan    # from git
pi install ./pi-bareplan                            # local path
```

The package carries `"keywords": ["pi-package"]`, so Pi discovers `index.ts` without a `pi` manifest in `package.json`.

## Usage

Plan mode is active from the first turn. Type `/plan` to turn it off or back on; the change lasts for the current session. You get `Plan mode ON` / `Plan mode OFF` notifications and the `plan` indicator in the status bar while it is active.

## Development

Self-check runs the extension against a mock `ExtensionAPI` and asserts the mode behavior: default state, toggle, contract and write blocking:

```bash
node selfcheck.ts
```

Requires Node >= 22.6 (built-in TypeScript type-stripping). No dependencies.

## License

Apache-2.0. See [LICENSE](LICENSE).
