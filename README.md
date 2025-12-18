# Antigravity Hono

> **Warning**: This project uses Google's internal API. Use at your own risk.

OpenAI and Anthropic compatible API proxy powered by Google Antigravity.

## Setup

1. Install dependencies

```sh
bun install
```

2. Create D1 database

```sh
wrangler d1 create antigravity-auth
```

3. Update `wrangler.jsonc` with your database ID

4. Run migrations

```sh
wrangler d1 migrations apply antigravity-auth --local
```

5. Generate types

```sh
bun run cf-typegen
```

6. Start dev server

```sh
bun run dev
```

## Deploy

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/daku/antigravity-hono)

Or manually:

1. Set environment variables

```sh
wrangler secret put ADMIN_KEY
wrangler secret put API_KEY
```

2. Deploy

```sh
bun run deploy
```

## Endpoints

- `POST /v1/chat/completions` - OpenAI compatible
- `POST /v1/messages` - Anthropic compatible
- `GET /v1/models` - List models
- `GET /auth` - Auth UI

## Environment Variables

- `ADMIN_KEY` - Admin API key for token management
- `API_KEY` - API key for chat completions
