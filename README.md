# pi-bareplan

Pi extension that toggles plan mode: read-only investigation, then a numbered plan.

## How it works

`/plan` flips the mode on and off:

- **ON**: `edit` and `write` are removed from the active tools. A hidden `[PLAN MODE]` message is injected at the start of each user turn, telling the model to investigate and answer with a numbered plan under a `Plan:` header. The status bar shows `plan`.
- **OFF**: saved tools are restored, the status indicator clears, and stale plan instructions are filtered out of the model's context.

## Not a sandbox

`bash` stays available, so the model can still modify files through shell commands. Plan mode hides write tools and nudges the model toward read-only work; it does not guarantee it.

## Install

```bash
pi install git:github.com/fn-cafeina/pi-bareplan    # from git
pi install ./pi-bareplan                            # local path
```

The package carries `"keywords": ["pi-package"]`, so Pi discovers `index.ts` without a `pi` manifest in `package.json`.

## Usage

Type `/plan` to toggle. You get `Plan mode ON` / `Plan mode OFF` notifications and the `plan` indicator in the status bar while it is active.

## Development

Self-check runs the extension against a mock `ExtensionAPI` and asserts toggle, injection and context-filtering behavior:

```bash
node selfcheck.ts
```

Requires Node >= 22.6 (built-in TypeScript type-stripping). No dependencies.

## License

Apache-2.0. See [LICENSE](LICENSE).
