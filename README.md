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

## Models

### OpenAI-compatible (`/v1/chat/completions`)

- `gemini-3-pro-preview` - Gemini 3 Pro
- `gemini-3-flash` - Gemini 3 Flash
- `gemini-2.5-flash` - Gemini 2.5 Flash
- `gemini-2.5-flash-lite` - Gemini 2.5 Flash Lite
- `claude-sonnet-4-5` - Claude Sonnet 4.5
- `claude-opus-4-5` - Claude Opus 4.5
- `gpt-oss-120b-medium` - GPT-OSS 120B

### Anthropic-compatible (`/v1/messages`)

- `claude-sonnet-4-5`
- `claude-opus-4-5`

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server |
| `bun run deploy` | Deploy to Workers |
| `bun run cf-typegen` | Generate types |
| `bun run migrate` | Apply migrations (remote) |

## License

[MIT](LICENSE)
