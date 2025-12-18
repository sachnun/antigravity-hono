# Antigravity Hono

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/daku/antigravity-hono)

OpenAI and Anthropic compatible API proxy powered by Google Antigravity, built with [Hono](https://hono.dev) on Cloudflare Workers.

> **Warning**: This project uses Google's internal API. Use at your own risk.

## Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- Cloudflare account

## Getting Started

### 1. Install dependencies

```sh
bun install
```

### 2. Create D1 database

```sh
wrangler d1 create antigravity-auth
```

### 3. Configure database

Update `wrangler.jsonc` with your database ID from the previous step.

### 4. Run migrations

```sh
wrangler d1 migrations apply antigravity-auth --local
```

### 5. Generate Cloudflare types

```sh
bun run cf-typegen
```

### 6. Start development server

```sh
bun run dev
```

## Deployment

### Using Deploy Button

Click the deploy button above to deploy directly to Cloudflare Workers.

### Manual Deployment

1. Set required secrets:

```sh
wrangler secret put ADMIN_KEY
wrangler secret put API_KEY
```

2. Deploy:

```sh
bun run deploy
```

## API Reference

### Chat Completions

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/v1/chat/completions` | POST | API_KEY | OpenAI-compatible chat completions |
| `/v1/messages` | POST | API_KEY | Anthropic-compatible messages |
| `/v1/models` | GET | - | List available models |
| `/v1/models/{model}` | GET | - | Get specific model info |
| `/search` | POST | accessToken | Google Search with grounding |

### Admin

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/admin/token` | GET | ADMIN_KEY | Check token existence |
| `/admin/token` | POST | ADMIN_KEY | Store/update token |
| `/admin/token` | DELETE | ADMIN_KEY | Delete token by email |
| `/admin/token/refresh` | POST | ADMIN_KEY | Force refresh all tokens |
| `/admin/accounts` | GET | ADMIN_KEY* | List accounts and quotas |

\* Returns masked emails without ADMIN_KEY

### Documentation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Swagger UI |
| `/openapi.json` | GET | OpenAPI specification |

## Supported Models

### OpenAI-compatible (`/v1/chat/completions`)

| Model | Provider |
|-------|----------|
| `gemini-3-pro-preview` | Google |
| `gemini-2.5-flash` | Google |
| `gemini-2.5-flash-lite` | Google |
| `claude-sonnet-4-5` | Anthropic |
| `claude-opus-4-5` | Anthropic |

### Anthropic-compatible (`/v1/messages`)

| Model | Aliases |
|-------|---------|
| `claude-sonnet-4-5` | `claude-sonnet-4-5-20250929`, `claude-4-sonnet` |
| `claude-opus-4-5` | `claude-opus-4-5-20251101`, `claude-4-opus` |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ADMIN_KEY` | Admin API key for token management | Yes |
| `API_KEY` | API key for chat completions | Yes |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start local development server |
| `bun run deploy` | Build and deploy to Cloudflare Workers |
| `bun run cf-typegen` | Generate Cloudflare bindings types |
| `bun run migrate` | Apply database migrations (remote) |

## License

MIT
