# pi-bareplan

Pi extension that starts every session in plan mode: investigate read-only, propose the change, then write. The status bar shows `plan: ON`.

While plan mode is on:
- `edit` and `write` are removed from the tool set, and any call to them is blocked.
- A hidden reminder on every user turn requires claims about the code to come from files read in that session, and stops at the proposal until you approve.
- `bash` stays available. The prompt forbids writes through it; nothing enforces it. A write tool registered under another name is not blocked either.

When the mode is off, a hidden notice tells the model writes are allowed, so it stops repeating plan-mode answers. The next session starts in plan mode again.

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

```bash
npm test           # self check (node selfcheck.ts)
npm run typecheck  # tsc --noEmit
npm run lint       # biome lint, checks only
npm run format     # biome format, checks only
biome check --write .   # apply formatting
```

No runtime dependencies. Type checking needs `npm install` first. Requires Node >= 22.18.

## License

MIT. See [LICENSE](LICENSE).
