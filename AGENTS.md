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

# Type checking
npx tsc --noEmit         # Check types (root)
cd web && npx tsc -b     # Check types (web)

# Database
wrangler d1 migrations apply antigravity-auth --local   # Local migrations
bun run migrate          # Remote migrations

# Deploy
bun run deploy           # Build web + migrate + deploy
bun run cf-typegen       # Generate Cloudflare bindings types
```

## Project Structure

```
src/
  index.tsx              # App entry, routes, middleware
  constants.ts           # Config constants (endpoints, timeouts, model groups)
  oauth.ts               # Google OAuth flow
  auth-schemas.ts        # Shared auth Zod schemas
  openai/                # OpenAI-compatible API
    index.ts             # Exports
    completions.ts       # Chat completion handlers
    models.ts            # Model definitions
    schemas.ts           # Request/response Zod schemas
  anthropic/             # Anthropic-compatible API (same structure)
  providers/gemini/      # Gemini API converter/types
  db/schema.ts           # Drizzle schema (tokens table)
  graphql/               # GraphQL API (schema, resolvers, context)
  lib/                   # Shared utilities
    errors.ts            # API error formatters
    rate-limit.ts        # Rate limit parsing
    token-rotation.ts    # Multi-account token rotation
    utils.ts             # Helpers (safeCompare, maskEmail, ID generators)
  services/              # Business logic
    tokens.ts            # Token CRUD, refresh, rate limit tracking
    quota.ts             # Account quota queries
    warmup.ts            # Model warmup logic
tests/                   # Mirrors src/ structure
web/                     # React dashboard (separate package)
  src/
    components/          # UI components
    hooks/               # React Query hooks
    lib/                 # API client, types
drizzle/                 # D1 migrations
```

## Code Style

### TypeScript
- Strict mode enabled, target ESNext
- Use `type` imports for type-only imports
- Prefer `const` assertions for literals: `as const`
- Use Zod for runtime validation, infer types: `z.infer<typeof Schema>`

### Imports
- Relative imports within modules: `./schemas`, `../lib/utils`
- Path aliases in web only: `@/components`, `@/hooks`, `@/lib`

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
