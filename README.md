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

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | OpenAI-compatible chat completions |
| `/v1/messages` | POST | Anthropic-compatible messages |
| `/v1/models` | GET | List available models |
| `/auth` | GET | Authentication UI |
| `/doc` | GET | Swagger UI documentation |

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
