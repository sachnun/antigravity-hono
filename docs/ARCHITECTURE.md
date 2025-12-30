# Architecture

## Overview

Antigravity Hono is an API proxy that converts OpenAI/Anthropic format requests to Google's internal Gemini format and routes them through Google's Antigravity API.

```
Client Request (OpenAI/Anthropic format)
         │
         ▼
┌─────────────────────┐
│   Hono Workers      │
│   (src/index.tsx)   │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Token Rotation     │
│  (token-rotation.ts)│
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Format Converter   │
│ (gemini-converter)  │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Google Internal    │
│  Antigravity API    │
└─────────────────────┘
         │
         ▼
   Response converted back
   to OpenAI/Anthropic format
```

## Directory Structure

```
src/
├── index.tsx           # Main entry, routes, middleware
├── oauth.ts            # Google OAuth flow
├── storage.ts          # Token management, D1 operations
├── schemas.ts          # Shared Zod schemas
├── constants.ts        # OAuth credentials, API endpoints
├── openai/             # OpenAI-compatible API
│   ├── completions.ts  # Chat completion handler
│   ├── models.ts       # Model definitions
│   └── schemas.ts      # Request/response schemas
├── anthropic/          # Anthropic-compatible API
│   ├── completions.ts  # Messages handler
│   ├── models.ts       # Model definitions
│   └── schemas.ts      # Request/response schemas
├── shared/             # Shared utilities
│   ├── gemini-converter.ts  # Format conversion
│   ├── token-rotation.ts    # Multi-account rotation
│   ├── fetch-with-fallback.ts  # Retry logic
│   └── rate-limit.ts   # Rate limit parsing
└── db/
    └── schema.ts       # Drizzle ORM schema

web/                    # React frontend dashboard
drizzle/                # Database migrations
```

## Key Components

### Main Entry (src/index.tsx)
- Hono app with OpenAPI routes
- Route handlers for all endpoints
- Admin authentication middleware
- Scheduled cron handler for token refresh

### Token Storage (src/storage.ts)
- D1 database operations via Drizzle ORM
- Token caching with 30s TTL
- `getTokenWithAutoWait()` - Gets available token, waits if rate-limited
- `markRateLimited()` - Tracks per-account rate limits
- Quota fetching from Google API

### Token Rotation (src/shared/token-rotation.ts)
- Rotates between multiple Google accounts
- Excludes rate-limited accounts temporarily
- Waits up to 25s for rate limit cooldown
- Retries with different account on 429 responses

### Format Converter (src/shared/gemini-converter.ts)
- Converts OpenAI messages → Gemini format
- Converts Anthropic messages → Gemini format
- Handles tool calls, images, system prompts
- Thinking block conversion

### OAuth Flow (src/oauth.ts)
- PKCE code challenge generation
- Google OAuth2 authorization URL
- Token exchange and refresh
- Project ID and tier discovery

## Database Schema

```sql
CREATE TABLE tokens (
  email TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  project_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  tier TEXT,
  rate_limit_until INTEGER,
  updated_at INTEGER NOT NULL
);
```

## Request Flow

1. **Request arrives** at Hono route handler
2. **Authentication** - Validate API key if configured
3. **Token selection** - Get available account via rotation
4. **Format conversion** - Transform to Gemini internal format
5. **API call** - Request to Google with fallback endpoints
6. **Rate limit handling** - On 429, mark account and retry with another
7. **Response conversion** - Transform back to OpenAI/Anthropic format
8. **Streaming** - SSE transformation for streaming responses

## Cron Jobs

Scheduled task runs every 30 minutes (configured in `wrangler.jsonc`):
- Refresh tokens expiring within 5 minutes
- Warm up accounts to prevent cold start quota issues

## Configuration

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `ADMIN_KEY` | Admin endpoint authentication |
| `API_KEY` | Completions endpoint authentication |
| `ENVIRONMENT` | Set to `development` for detailed errors |

### Cloudflare Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `DB` | D1 Database | Token storage |
| `ASSETS` | Fetcher | Static web assets |

### Internal Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `CACHE_TTL_MS` | 30,000ms | Token list cache duration |
| `MAX_AUTO_WAIT_MS` | 25,000ms | Max wait for rate limit cooldown |
| `TOKEN_EXPIRY_BUFFER_MS` | 300,000ms | Refresh tokens 5min before expiry |
| `DEFAULT_RATE_LIMIT_DELAY_MS` | 60,000ms | Default rate limit delay |
| `MAX_TOKEN_RETRY_DEPTH` | 10 | Max recursive depth for auto-wait token selection |
