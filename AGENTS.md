# AGENTS.md

Instructions for coding agents working on this repo.

## Commands

```bash
npm test           # self check (node selfcheck.ts)
npm run typecheck  # tsc --noEmit
npm run lint       # biome lint, checks only
npm run format     # biome format, checks only
biome check --write .   # apply formatting
```

Run all four before committing. Requires Node >= 22.18 (type stripping without a flag) and `npm install` first (dev dependencies only: typescript, `@types/node`, the pi package, biome).

## Layout

- `index.ts` — the extension. `PLAN_CONTRACT` and `PLAN_OFF_NOTICE` are the hidden per-turn prompts; keep them in English.
- `selfcheck.ts` — the test. Loads `index.ts` with a mock `ExtensionAPI` and asserts default state, toggle, contract, OFF notice, notice pruning, write blocking.
- `biome.json`, `tsconfig.json` — lint/format and typecheck config.
- `package.json` — `pi.extensions` points Pi at `./index.ts`; `exports` is the same file.

## Facts that matter

- No runtime dependencies. devDependencies exist only for typecheck and lint.
- Not a sandbox: `bash` stays in the tool set on purpose. Only tools named `edit` and `write` are hidden and blocked; a write tool under another name is not.
- The plan-mode reminder repeats on every user turn on purpose. Do not "optimize" it into a single system-prompt section.
- `selfcheck.ts` allows `any` and `Function` via a `biome.json` override. Keep the mock loose; do not add casts to satisfy those rules.

## Release

Push a tag `v*` matching `package.json` version. CI (`release.yml`) runs typecheck, lint, format and test, then publishes to npm with trusted publishing and creates a GitHub release with generated notes.
