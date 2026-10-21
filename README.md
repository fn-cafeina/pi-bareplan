# pi-bareplan

Pi extension that toggles plan mode: read-only investigation, then a numbered plan.

## How it works

`/plan` flips the mode on and off:

- **ON**: `edit` and `write` are removed from the active tools and any call to them is blocked. A `plan_mode` section is added to the system prompt: investigate first, never plan against a file you have not read, then answer with a numbered plan under a `Plan:` header covering scope, verification and risks. The status bar shows `plan`.
- **OFF**: saved tools are restored, the status indicator clears, and the `plan_mode` section is emptied out of the system prompt.

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

Type `/plan` to toggle. You get `Plan mode ON` / `Plan mode OFF` notifications and the `plan` indicator in the status bar while it is active.

## Development

Self-check runs the extension against a mock `ExtensionAPI` and asserts toggle, prompt-section and write-blocking behavior:

```bash
node selfcheck.ts
```

Requires Node >= 22.6 (built-in TypeScript type-stripping). No dependencies.

## License

Apache-2.0. See [LICENSE](LICENSE).
