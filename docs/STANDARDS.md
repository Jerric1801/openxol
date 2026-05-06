# OpenXol — Engineering Standards

## Language

**TypeScript strict** throughout `src/main/` and `src/preload/`.
- `strict: true`
- `noUncheckedIndexedAccess: true`
- No `any` without an inline comment: `// reason: <explanation>`
- Renderer JS migrates to TS in Phase 2.

## Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Variables, functions | camelCase | `audioPath`, `getConfig()` |
| Classes, interfaces, types, enums | PascalCase | `MeetingPipeline`, `IpcChannels` |
| Files | kebab-case | `config-manager.ts`, `setup-manager.ts` |
| Constants (module-level, frozen) | SCREAMING_SNAKE_CASE | `MAX_RETRY_COUNT` |
| IPC channel strings | kebab-case | `process-audio`, `get-config` |
| CSS custom properties | kebab-case | `--color-primary` |

## File Organisation

```
src/
  main/           # Main process: TypeScript, compiled by electron-vite
    pipeline/     # Processing steps
    utils/        # Shared utilities (config, setup, file)
    index.ts      # Entry point
  preload/        # Preload script: TypeScript, sandboxed
    index.ts
  renderer/       # Renderer: vanilla HTML/CSS/JS → migrates Phase 2
    css/
    js/
    index.html
    setup.html
  types/          # Shared IPC + domain types (Phase 2)
docs/             # Project documentation
```

## Imports

Order within a file:
1. Node built-ins (`path`, `fs`)
2. Electron (`electron`)
3. Third-party (`electron-log`, `@google/generative-ai`)
4. Internal (`./pipeline/orchestrator`)

No circular imports between `main/pipeline/` and `main/utils/`.

## Logging

| Context | Tool |
|---------|------|
| Main process | `electron-log` — never `console.log` |
| Renderer (dev only) | `console.*` acceptable |

Log levels: `log.error` for failures, `log.warn` for non-critical issues, `log.info` for lifecycle events, `log.debug` for trace data.

## Error Handling

Pipeline errors are always shaped as:
```typescript
{ step: string; error: string; critical: boolean }
```

- `critical: true` — transcription failed; pipeline aborts, no results
- `critical: false` — optional step failed; pipeline continues

Catch blocks in main process: always `catch (err: unknown)` and narrow the type before use. Never `catch (e: any)`.

## IPC Channels

All channels documented in `docs/ARCHITECTURE.md`. Channel string format: kebab-case verb-noun (`process-audio`, `get-config`).

Never add an IPC channel without:
1. Adding it to the channel registry in `docs/ARCHITECTURE.md`
2. Typing it in `src/types/ipc.ts` (Phase 2)
3. Exposing it via `contextBridge` in `src/preload/index.ts`

## Git

Branch naming: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`

Commit format: [Conventional Commits](https://www.conventionalcommits.org/)
```
feat(pipeline): add diarization timeout config
fix(setup): correct Linux binary path resolution
docs(standards): add IPC naming rule
```

## Testing (Phase 3)

- Unit tests: Vitest — all pipeline modules (`transcription`, `diarization`, `analysis`, `docx-gen`)
- Integration tests: Vitest — IPC handlers with mocked Electron APIs
- E2E: Playwright — happy path + setup wizard flow
- Test files co-located: `src/main/pipeline/transcription.test.ts`
- Pipeline changes require test coverage before merge
