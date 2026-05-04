# Contributing

Thanks for considering a contribution. Read this before opening a PR.

## What lands quickly

- **Bug fixes** with a failing test in `test-fixtures/` that the fix makes pass.
- **New providers** that match the `src/providers/<name>.js` interface (`generate(req)` for image providers, `vectorize(buffer)` for vectorizers, plus `describeRequest()` for `--dry-run`). Stub providers exist in `replicate.js` and `vectorizer.js` showing the interface.
- **Documentation** corrections and clarifications.

## What probably won't land

- Wholesale rewrites or "modernizations" of the existing code.
- Adding a build step (TypeScript, bundler, etc.) — brandkit is plain ESM by design.
- New CLI subcommands without a clear, named use case.
- Anything that adds a runtime dependency without a strong reason.

## Local dev

```bash
git clone https://github.com/gent8/brandkit
cd brandkit
npm install
npm link
npm run test:smoke
```

The smoke test in `test-fixtures/smoke.mjs` is intentionally tiny. Add cases there (or alongside) when fixing a bug.

## Style

- ESM, `node >= 20`. No transpiler.
- Pure functions where possible; isolate side effects (`fs`, `fetch`) at the edges.
- Descriptive error messages — every thrown error should tell the user what to set or do next.

## License

By contributing, you agree your contribution is licensed under [Apache-2.0](LICENSE).
