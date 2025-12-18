# Antigravity Hono

OpenAI and Anthropic compatible API proxy powered by Google Antigravity.

## Setup

```sh
bun install
bun run dev
```

## Deploy

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
