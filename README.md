# pi-bareplan

[![npm](https://img.shields.io/npm/v/pi-bareplan)](https://www.npmjs.com/package/pi-bareplan) [![license](https://img.shields.io/npm/l/pi-bareplan)](https://github.com/fn-cafeina/pi-bareplan/blob/main/LICENSE)

Pi extension that starts every session in plan mode. The model investigates without touching anything, then hands you a numbered plan before it changes files. `/plan` turns the mode off for the session.

## How it works

Plan mode is on when a session starts, and the status bar shows `plan: ON`. While it is on:

- `edit` and `write` are removed from the tool set Pi declares to the model, and any call to them is blocked.
- A hidden `[PLAN MODE]` message is attached to every user turn. It tells the model to investigate first, to never plan against a file it has not read, and to answer under a `Plan:` header.
- The same message tells the model to reply briefly to a greeting, with no tools and no plan.

The reminder repeats on every turn on purpose. A single system prompt section is easy for small models to drop, especially next to a direct request to implement.

`/plan` turns the mode off for the current session. The saved tools come back, the status bar shows `plan: OFF`, and the plan messages are filtered out of the model's context. The next session starts in plan mode again.

## What the model returns

The plan covers, in this order:

1. Numbered steps, smallest complete change first. Each step names the file path, what changes and why.
2. Scope: the callers, tests, fixtures and config the change reaches.
3. Verification: the command that proves it works.
4. Risks, and what was not checked.
5. Open questions, but only when the decision is yours. Otherwise the model picks the simplest option and says so.

## Not a sandbox

`bash` stays available, so the model can still write files through a shell command. The prompt forbids it, nothing enforces it.

Only the tools named `edit` and `write` are hidden and blocked. A write tool registered under another name stays in the set.

## Install

```bash
pi install npm:pi-bareplan                          # from npm (recommended)
pi install git:github.com/fn-cafeina/pi-bareplan    # from git
pi install ./pi-bareplan                            # local path
```

`pi list` shows what is installed, `pi remove npm:pi-bareplan` removes it.

## Usage

Plan mode is active from the first turn. Type `/plan` to switch it off, and again to switch it back on. The change lasts for the current session.

## Development

The self check loads the extension with a mock `ExtensionAPI` and asserts the mode behavior: default state, toggle, contract and write blocking.

```bash
node selfcheck.ts
```

Requires Node >= 22.18, the first release where type stripping runs without a flag. No dependencies.

The `pi` manifest in `package.json` points Pi at `./index.ts`.

## License

Apache-2.0. See [LICENSE](LICENSE).
