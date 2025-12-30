# AGENTS.md

OpenAI/Anthropic-compatible API proxy for Google Antigravity, built with Hono on Cloudflare Workers.

## Commands

```bash
# Install dependencies
bun install
cd web && bun install && cd ..

# Development
bun run dev              # Start wrangler dev server
bun run dev:web          # Start web dashboard dev server

# Testing
bun test                 # Run all tests
bun test tests/lib/errors.test.ts           # Single test file
bun test --watch         # Watch mode

# Database
wrangler d1 migrations apply antigravity-auth --local   # Local migrations
bun run migrate          # Remote migrations

# Deploy
bun run deploy           # Build web + migrate + deploy
bun run cf-typegen       # Generate Cloudflare bindings types
```

## Code Style

### TypeScript
- Strict mode enabled, target ESNext
- Use `type` imports for type-only imports
- Prefer `const` assertions for literals: `as const`
- Use Zod for runtime validation, infer types: `z.infer<typeof Schema>`

### Imports
- Relative imports within modules: `./schemas`, `../lib/utils`
- Path aliases in web only: `@/components`, `@/hooks`

### Naming
- Files: kebab-case (`token-rotation.ts`)
- Functions: camelCase (`handleChatCompletion`)
- Types/Interfaces: PascalCase (`ChatCompletionRequest`)
- Constants: SCREAMING_SNAKE_CASE (`MAX_AUTO_WAIT_MS`)
- Zod schemas: PascalCase with `Schema` suffix (`ChatCompletionRequestSchema`)

### Error Handling
- Use `openaiError()` / `anthropicError()` from `src/lib/errors.ts` for API responses
- Return `Response` objects for error cases, not thrown exceptions
- Pattern: `if (result instanceof Response) return result`

### Schemas
- Define Zod schemas in `**/schemas.ts` files
- Export both schema and inferred type
- Use `.openapi()` for API documentation

## Conventions

### API Endpoints
- OpenAI format: `/v1/chat/completions`, `/v1/models`
- Anthropic format: `/v1/messages`
- Admin routes: `/admin/*` (protected by `ADMIN_KEY`)
- Auth routes: `/auth/*`

### Token Rotation
- Use `withTokenRotation()` wrapper for API calls requiring auth
- Handles rate limits, token refresh, multi-account fallback

### Database
- Drizzle ORM with D1 (SQLite)
- Schema in `src/db/schema.ts`
- Migrations in `drizzle/` directory

### Tests
- Bun test runner with `describe`/`test`/`expect`
- Mirror source structure: `tests/lib/errors.test.ts` for `src/lib/errors.ts`
- Import from relative paths: `../../src/lib/errors`

### Web Dashboard
- React 19 + TanStack Query + Tailwind v4
- Functional components with hooks
- Use `useCallback` for handlers passed to children

## Environment

### Bindings (wrangler.jsonc)
- `DB`: D1 database
- `ASSETS`: Static assets (web/dist)
- `ADMIN_KEY`: Admin authentication (secret)
- `API_KEY`: API authentication (secret)
- `ENVIRONMENT`: "development" | "production"

### Secrets (never commit)
- Set via `wrangler secret put <NAME>`
- `ADMIN_KEY`, `API_KEY`

## Safety

- Never log or expose access tokens, refresh tokens, or API keys
- Use `safeCompare()` for constant-time string comparison on secrets
- Validate all request bodies with Zod schemas before processing
- Rate limit info is extracted but tokens are not logged
