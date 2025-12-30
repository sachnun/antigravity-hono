# Troubleshooting Guide

## Common Errors

### 401 Unauthorized

**API Key Issues**
- Verify `API_KEY` secret is set: `wrangler secret list`
- Header format must be `Authorization: Bearer YOUR_KEY`
- For Anthropic endpoint, also accepts `x-api-key: YOUR_KEY` header

**Admin Key Issues**
- `/admin/*` endpoints require `ADMIN_KEY` secret
- If `ADMIN_KEY` is not set, admin access is disabled (403 Forbidden)
- Use `Authorization: Bearer YOUR_ADMIN_KEY` header

**Token Issues**
- No accounts configured → "No valid token available"
- All tokens expired → Re-authenticate via OAuth flow

### 429 Too Many Requests

**Cause:** All accounts are rate-limited by Google's quota system.

**What happens internally:**
1. System tries each account in rotation
2. Rate-limited accounts are marked with cooldown (default 60s)
3. System waits up to 25s for accounts to become available
4. If all accounts exhausted → 429 returned to client

**Solutions:**
- Wait for rate limit cooldown (check `rate_limit_until` in database)
- Add more Google accounts to distribute load
- Check if accounts still have quota remaining via `/admin/accounts`
- Reduce request frequency

### 500 Internal Server Error

**Debug steps:**
1. Check worker logs: `wrangler tail`
2. In development mode (`ENVIRONMENT=development`), error details are included in response

**Common causes:**
- Token expired and refresh failed
- Google API outage
- Invalid request format passed to Google
- Database connection issues

### OAuth Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `invalid_grant` | Auth code expired | Retry OAuth flow from `/auth/authorize` |
| `access_denied` | Account lacks Code Assist access | Use account with Gemini Code Assist enabled |
| `redirect_uri_mismatch` | Callback URL mismatch | Verify redirect URI matches OAuth config |
| `Token exchange failed` | PKCE verifier mismatch | Don't modify the `state` parameter |

### Token Refresh Failures

**Symptoms:**
- Requests fail with authentication errors
- `handleTokenRefresh` returns errors

**Causes:**
- Refresh token revoked (user revoked access in Google settings)
- Account suspended or closed
- OAuth credentials invalidated

**Solution:** Re-authenticate the account via OAuth flow at `/auth`

---

## Debugging

### View Worker Logs

```bash
# Real-time logs
wrangler tail

# With filter
wrangler tail --format=pretty
```

### Check Account Status

```bash
# List all accounts with quota info
curl -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  https://your-worker.dev/admin/accounts
```

Response includes:
- `email` - Account identifier
- `tier` - Subscription tier
- `rateLimitUntil` - Timestamp when rate limit expires (null if not limited)
- `quota` - Current quota usage by model group

### Test Token Refresh

```bash
# Refresh all tokens
curl -X POST -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  https://your-worker.dev/admin/token/refresh
```

Returns: `{ "success": true, "refreshed": 2 }` or errors for failed accounts.

### Warm Up Accounts

Initializes quota tracking for new accounts:

```bash
curl -X POST -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  https://your-worker.dev/admin/warmup
```

### Query Database Directly

```bash
# Local development
wrangler d1 execute antigravity-auth --local --command \
  "SELECT email, tier, rate_limit_until, expires_at FROM tokens"

# Production
wrangler d1 execute antigravity-auth --remote --command \
  "SELECT email, tier, rate_limit_until, expires_at FROM tokens"
```

### Check Token Expiry

```bash
wrangler d1 execute antigravity-auth --remote --command \
  "SELECT email, datetime(expires_at/1000, 'unixepoch') as expires FROM tokens"
```

---

## Rate Limiting

### How It Works

1. Each Google account has per-model quota limits
2. When an account hits 429, it's marked rate-limited in the database
3. System parses `retryDelay` from Google's error response (or defaults to 60s)
4. Rate-limited accounts are excluded from rotation until cooldown expires
5. System waits up to **25 seconds** for rate-limited accounts before failing

### Symptoms

- Slow responses (system waiting for cooldown)
- 429 errors when all accounts exhausted
- Inconsistent response times
- Error message: "All accounts rate limited" or "Tried N accounts"

### Check Rate Limit Status

```bash
wrangler d1 execute antigravity-auth --remote --command \
  "SELECT email, datetime(rate_limit_until/1000, 'unixepoch') as until FROM tokens WHERE rate_limit_until > 0"
```

### Clear Rate Limits Manually

```bash
wrangler d1 execute antigravity-auth --remote --command \
  "UPDATE tokens SET rate_limit_until = NULL"
```

### Solutions

| Action | Impact |
|--------|--------|
| Add more accounts | Distributes load, increases total quota |
| Reduce request frequency | Stay under per-account limits |
| Use lower-quota models | `gemini-2.5-flash` vs `claude-sonnet-4-5` |
| Monitor via dashboard | Track which accounts are exhausted |

---

## Database Issues

### "D1_ERROR: no such table: tokens"

Migrations not applied. Run:

```bash
# Local
wrangler d1 migrations apply antigravity-auth --local

# Production
wrangler d1 migrations apply antigravity-auth --remote
```

### Token Not Persisting

1. Check D1 binding in `wrangler.jsonc`:
   ```json
   "d1_databases": [{
     "binding": "DB",
     "database_name": "antigravity-auth",
     "database_id": "your-database-id"
   }]
   ```

2. Verify database exists:
   ```bash
   wrangler d1 list
   ```

3. If missing, create it:
   ```bash
   wrangler d1 create antigravity-auth
   ```
   Then update `database_id` in `wrangler.jsonc`.

### Database Connection Errors

```bash
# Test local database
wrangler d1 execute antigravity-auth --local --command "SELECT 1"

# Test remote database
wrangler d1 execute antigravity-auth --remote --command "SELECT 1"
```

---

## Deployment Issues

### "No such worker"

Worker not deployed yet:
```bash
bun run deploy
```

### Secrets Not Working

Set secrets via wrangler:
```bash
wrangler secret put API_KEY
wrangler secret put ADMIN_KEY
```

List current secrets:
```bash
wrangler secret list
```

### Assets Not Loading

1. Build the web frontend:
   ```bash
   cd web && bun install && bun run build
   ```

2. Redeploy:
   ```bash
   bun run deploy
   ```

### CORS Errors

The API sets permissive CORS headers via `cors()` middleware. If you're seeing CORS errors:

1. Check if request is hitting the correct endpoint
2. Verify preflight (OPTIONS) requests succeed
3. Check browser console for specific blocked headers

---

## FAQ

**Q: Why am I getting rate limited so quickly?**

A: Google has per-account and per-model quotas. Heavy usage of high-quota models like Claude can exhaust accounts quickly. Add more accounts or reduce request frequency.

**Q: Can I use this without authentication?**

A: Yes. If `API_KEY` is not set, the `/v1/chat/completions` and `/v1/messages` endpoints are unauthenticated.

**Q: How do I add more accounts?**

A: Two methods:
1. Web dashboard at `/auth` - Interactive OAuth flow
2. API: `POST /admin/token` with admin key

**Q: Why do responses sometimes take 25+ seconds?**

A: The system waits up to 25s (`MAX_AUTO_WAIT_MS`) for rate-limited accounts to cool down before returning a 429 error. This behavior is intentional to maximize success rate.

**Q: Is my data sent to Google?**

A: Yes. All requests are proxied to Google's internal Antigravity API. Google sees all request content.

**Q: Why does quota show 100% used for new accounts?**

A: Cold start behavior - quota tracking initializes on first request. Use `POST /admin/warmup` to pre-initialize quota tracking for all accounts.

**Q: How often do tokens refresh automatically?**

A: A cron job runs every 30 minutes (`*/30 * * * *`) that:
1. Refreshes all access tokens
2. Warms up accounts to initialize quota tracking

**Q: How do I remove an account?**

A: 
```bash
curl -X DELETE "https://your-worker.dev/admin/token?email=user@example.com" \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"
```

**Q: What tiers are available?**

A: Tier is determined by the Google account's Gemini Code Assist subscription level. Common values: `FREE`, `STANDARD`, `ENTERPRISE`.

---

## Getting Help

1. Check worker logs: `wrangler tail`
2. Query database state directly
3. Test endpoints with curl
4. Review `/admin/accounts` for account health
