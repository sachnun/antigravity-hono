# Agent Guidelines

## Commands
- `bun install` - Install dependencies
- `bun run dev` - Start local dev server (wrangler)
- `bun run deploy` - Deploy to Cloudflare Workers
- `bun run cf-typegen` - Generate CloudflareBindings types
- No test framework configured yet

## Tech Stack
- Hono framework on Cloudflare Workers
- TypeScript (strict mode, ESNext target)
- Bun package manager

## Code Style
- ES modules with named imports: `import { Hono } from 'hono'`
- Single quotes for strings
- Arrow functions for route handlers: `app.get('/', (c) => c.text('Hello'))`
- Export default for main app instance
- No code comments unless absolutely necessary
- Type Cloudflare bindings: `new Hono<{ Bindings: CloudflareBindings }>()`
- Prefer early returns over nested conditionals
- Keep functions small and focused
