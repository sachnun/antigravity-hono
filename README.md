# Antigravity Hono

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com)

OpenAI and Anthropic compatible API proxy powered by Google Antigravity, built with [Hono](https://hono.dev) on [Cloudflare Workers](https://workers.cloudflare.com)

> **Warning**: This project uses Google's internal/undocumented API. Use at your own risk.

## Features

- OpenAI-compatible `/v1/chat/completions` endpoint
- Anthropic-compatible `/v1/messages` endpoint
- Multi-account token rotation with rate limit handling
- Extended thinking support for Claude models
- Interactive API docs at `/docs` (OpenAPI/Swagger)
- Web dashboard for account management

## Quick Start

```sh
bun install
cd web && bun install && cd ..
wrangler d1 create antigravity-auth
wrangler d1 migrations apply antigravity-auth --local
bun run cf-typegen
bun run dev
```

Update `wrangler.jsonc` with your database ID after creating the D1 database.

### Usage Example

```sh
curl -X POST https://YOUR_WORKER_URL/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gemini-2.5-flash",
    "stream": true,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

## Models

### OpenAI-compatible (`/v1/chat/completions`)

| Model | Description |
|-------|-------------|
| `gemini-3-pro-preview` | Gemini 3 Pro |
| `gemini-3-flash` | Gemini 3 Flash |
| `gemini-2.5-flash` | Gemini 2.5 Flash |
| `gemini-2.5-flash-lite` | Gemini 2.5 Flash Lite |
| `claude-sonnet-4-5` | Claude Sonnet 4.5 |
| `claude-opus-4-5` | Claude Opus 4.5 |
| `gpt-oss-120b-medium` | GPT-OSS 120B |

### Anthropic-compatible (`/v1/messages`)

| Model | Description |
|-------|-------------|
| `claude-sonnet-4-5` | Claude Sonnet 4.5 |
| `claude-opus-4-5` | Claude Opus 4.5 |

## Deployment

See [Deployment Guide](docs/DEPLOY.md) for full deployment configuration.

```sh
wrangler secret put ADMIN_KEY
wrangler secret put API_KEY
bun run deploy
```

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](docs/API.md) | Endpoints, authentication, examples |
| [Deployment Guide](docs/DEPLOY.md) | Cloudflare setup, environment variables |
| [Architecture](docs/ARCHITECTURE.md) | System design, components, request flow |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues, debugging, FAQ |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server |
| `bun run deploy` | Deploy to Workers |
| `bun run cf-typegen` | Generate types |
| `bun run migrate` | Apply migrations (remote) |

## License

[MIT](LICENSE)
