# Antigravity Hono

OpenAI and Anthropic compatible API proxy powered by Google Antigravity, built with [Hono](https://hono.dev) on Cloudflare Workers.

> **Warning**: This project uses Google's internal API. Use at your own risk.

## Quick Start

```sh
bun install
wrangler d1 create antigravity-auth
wrangler d1 migrations apply antigravity-auth --local
bun run cf-typegen
bun run dev
```

Update `wrangler.jsonc` with your database ID after creating the D1 database.

## Deployment

See [DEPLOY.md](DEPLOY.md) for deployment configuration and Cloudflare Dashboard settings.

```sh
wrangler secret put ADMIN_KEY
wrangler secret put API_KEY
bun run deploy
```

## API Endpoints

### Chat Completions

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/v1/chat/completions` | POST | API_KEY | OpenAI-compatible |
| `/v1/messages` | POST | API_KEY | Anthropic-compatible |
| `/v1/models` | GET | - | List models |
| `/search` | POST | accessToken | Google Search |

### Admin

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/token` | GET/POST/DELETE | Token management |
| `/admin/token/refresh` | POST | Force refresh tokens |
| `/admin/accounts` | GET | List accounts |

### Docs

| Endpoint | Description |
|----------|-------------|
| `/` | Swagger UI |
| `/openapi.json` | OpenAPI spec |

## Models

### OpenAI-compatible

- `gemini-3-pro-preview`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`
- `claude-sonnet-4-5`
- `claude-opus-4-5`

### Anthropic-compatible

- `claude-sonnet-4-5` (aliases: `claude-sonnet-4-5-20250929`, `claude-4-sonnet`)
- `claude-opus-4-5` (aliases: `claude-opus-4-5-20251101`, `claude-4-opus`)

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server |
| `bun run deploy` | Deploy to Workers |
| `bun run cf-typegen` | Generate types |
| `bun run migrate` | Apply migrations (remote) |

## License

MIT
