# Deployment Guide

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sachnun/antigravity-hono)

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
- [Bun](https://bun.sh) >= 1.0

## Quick Deploy

Click the deploy button above to deploy directly via [Cloudflare Deploy Button](https://developers.cloudflare.com/workers/platform/deploy-button/).

## Manual Deployment

### 1. Clone and Install

```sh
git clone https://github.com/sachnun/antigravity-hono.git
cd antigravity-hono
bun install
cd web && bun install && cd ..
```

### 2. Create D1 Database

Create a new [D1 database](https://developers.cloudflare.com/d1/):

```sh
wrangler d1 create antigravity-auth
```

Copy the `database_id` from output and update `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "antigravity-auth",
    "database_id": "<YOUR_DATABASE_ID>"
  }
]
```

### 3. Apply Migrations

Apply [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) to remote database:

```sh
bun run migrate
```

### 4. Set Secrets

Set [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/) via CLI:

```sh
wrangler secret put ADMIN_KEY
wrangler secret put API_KEY
```

Or via [Cloudflare Dashboard](https://dash.cloudflare.com/) > Workers & Pages > Your Worker > Settings > Variables and Secrets.

### 5. Deploy

```sh
bun run deploy
```

This command will:
1. Build the React frontend (`web/dist/`)
2. Apply D1 migrations
3. Deploy Worker with static assets

## Cloudflare Dashboard Configuration

After deployment, configure these settings in [Cloudflare Dashboard](https://dash.cloudflare.com/).

### Build Configuration (Git-based Deploys)

Navigate to: **Workers & Pages** > **Your Worker** > **Settings** > **Build**

| Setting | Value |
|---------|-------|
| Build command | `bun run build:web` |
| Deploy command | `bun wrangler deploy` |
| Root directory | `/` |

### Build Watch Paths

Navigate to: **Workers & Pages** > **Your Worker** > **Settings** > **Build** > **Build watch paths**

Configure [build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/) to trigger rebuilds only when relevant files change.

**Include paths:**

```
src/**
drizzle/**
web/**
package.json
wrangler.jsonc
tsconfig.json
```

**Excluded (no rebuild trigger):**

- `README.md`
- `AGENTS.md`
- `DEPLOY.md`
- `.gitignore`

### Environment Variables

Navigate to: **Workers & Pages** > **Your Worker** > **Settings** > **Variables and Secrets**

| Variable | Type | Description |
|----------|------|-------------|
| `ADMIN_KEY` | Secret | Admin API key for token management |
| `API_KEY` | Secret | API key for chat completions |

See [Environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables/) documentation.

### Custom Domain (Optional)

Navigate to: **Workers & Pages** > **Your Worker** > **Settings** > **Domains & Routes**

Add a [custom domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) or [route](https://developers.cloudflare.com/workers/configuration/routing/routes/) for your worker.

### Cron Triggers

This worker includes a cron trigger for token refresh. Configured in `wrangler.jsonc`:

```jsonc
"triggers": {
  "crons": ["*/30 * * * *"]
}
```

See [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) documentation.

## Troubleshooting

### View Logs

Real-time logs via CLI:

```sh
wrangler tail
```

Or via [Cloudflare Dashboard](https://dash.cloudflare.com/) > Workers & Pages > Your Worker > Logs.

See [Logging](https://developers.cloudflare.com/workers/observability/logging/) documentation.

### Database Issues

Check D1 database status:

```sh
wrangler d1 info antigravity-auth
```

Execute SQL queries:

```sh
wrangler d1 execute antigravity-auth --command "SELECT * FROM tokens"
```

See [D1 documentation](https://developers.cloudflare.com/d1/).

## Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/commands/)
- [D1 Database Documentation](https://developers.cloudflare.com/d1/)
- [Hono Framework](https://hono.dev)
