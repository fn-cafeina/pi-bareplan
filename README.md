# pi-bareplan

Pi extension that starts every session in plan mode. The model investigates without touching anything, and proposes the change before it writes. `/plan` turns the mode off for the session.

## How it works

Plan mode is on when a session starts, and the status bar shows `plan: ON`. While it is on:
- `edit` and `write` are removed from the tool set Pi declares to the model, and any call to them is blocked.
- A hidden `[PLAN MODE]` message is attached to every user turn. It forbids any action whose purpose is to change state, shell commands included, and requires every claim about the code to come from a file the model read in that session. Anything unverified has to be marked as an assumption.
- It closes the usual escape routes: ambiguous scope gets a question instead of a guess, nothing is implemented before you approve, and a request to edit anyway gets a pointer to `/plan` instead of a silent exception.
- The reminder does not dictate reply shape, language or sections. Formatting stays with the harness and your own instructions.

When the mode is off, a hidden `[PLAN MODE OFF]` notice is attached to every user turn. It states that writes are allowed and tells the model not to keep claiming plan mode is active.

The reminder repeats on every turn on purpose. A single system prompt section is easy for small models to drop, especially next to a direct request to implement.

`/plan` turns the mode off for the current session. The saved tools come back, the status bar shows `plan: OFF`, and the OFF notice replaces the plan contract in the model's context. Stale ON/OFF notices are pruned so only the latest state survives. The next session starts in plan mode again.

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

The self check loads the extension with a mock `ExtensionAPI` and asserts the mode behavior: default state, toggle, contract, OFF notice, notice pruning and write blocking.

```bash
node selfcheck.ts
npm run typecheck
npm run lint
```

`npm run lint` runs Biome (lint + format check); `biome check --write .` applies the formatting. Type checking needs the dev dependencies (`npm install` first): typescript, `@types/node` and the pi package for the `ExtensionAPI` types. There are no runtime dependencies.

Requires Node >= 22.18, the first release where type stripping runs without a flag.

The `pi` manifest in `package.json` points Pi at `./index.ts`.

## License

Apache-2.0. See [LICENSE](LICENSE).
