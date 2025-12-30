# Antigravity API Reference

OpenAI/Anthropic-compatible API proxy routing to Google's internal API with multi-account token rotation and extended thinking support.

## Authentication

API endpoints use Bearer token authentication:

```
Authorization: Bearer YOUR_API_KEY
```

| Environment Variable | Purpose |
|---------------------|---------|
| `API_KEY` | Required for `/v1/*` endpoints. If not set, endpoints are unauthenticated. |
| `ADMIN_KEY` | Required for `/admin/*` endpoints. If not set, admin endpoints return 403. |

The Anthropic-compatible endpoint also accepts `x-api-key` header:

```
x-api-key: YOUR_API_KEY
```

---

## Endpoints

### OpenAI-Compatible

#### POST /v1/chat/completions

Create a chat completion.

**Request Body**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model ID (see [Available Models](#available-models)) |
| `messages` | array | Yes | Array of message objects |
| `stream` | boolean | No | Enable SSE streaming (default: false) |
| `max_tokens` | integer | No | Maximum tokens to generate |
| `max_completion_tokens` | integer | No | Alias for max_tokens |
| `temperature` | number | No | Sampling temperature (0-2) |
| `top_p` | number | No | Nucleus sampling (0-1) |
| `stop` | string/array | No | Stop sequences |
| `tools` | array | No | Available tools for function calling |
| `tool_choice` | string/object | No | Tool selection mode |
| `reasoning_effort` | string | No | Thinking level: `"none"`, `"low"`, `"medium"`, `"high"` |
| `thinking_budget` | integer | No | Explicit thinking budget in tokens (overrides reasoning_effort) |
| `include_thoughts` | boolean | No | Include thinking in response (default: true when thinking enabled) |

**Message Object**

```json
{
  "role": "user",
  "content": "Hello!"
}
```

Content can be a string or array for multimodal:

```json
{
  "role": "user",
  "content": [
    {"type": "text", "text": "What's in this image?"},
    {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
  ]
}
```

**Example: Non-streaming**

```bash
curl -X POST https://your-worker.dev/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 1024
  }'
```

**Response**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "claude-sonnet-4-5",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

**Example: Streaming**

```bash
curl -X POST https://your-worker.dev/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

---

#### GET /v1/models

List available models.

```bash
curl https://your-worker.dev/v1/models
```

**Response**

```json
{
  "object": "list",
  "data": [
    {"id": "gemini-3-pro-preview", "object": "model", "created": 1700000000, "owned_by": "google"},
    {"id": "gemini-3-flash", "object": "model", "created": 1700000000, "owned_by": "google"},
    {"id": "gemini-2.5-flash", "object": "model", "created": 1700000000, "owned_by": "google"},
    {"id": "gemini-2.5-flash-lite", "object": "model", "created": 1700000000, "owned_by": "google"},
    {"id": "claude-sonnet-4-5", "object": "model", "created": 1700000000, "owned_by": "anthropic"},
    {"id": "claude-opus-4-5", "object": "model", "created": 1700000000, "owned_by": "anthropic"},
    {"id": "gpt-oss-120b-medium", "object": "model", "created": 1700000000, "owned_by": "openai"}
  ]
}
```

---

#### GET /v1/models/{model}

Get information about a specific model.

```bash
curl https://your-worker.dev/v1/models/claude-sonnet-4-5
```

**Response**

```json
{
  "id": "claude-sonnet-4-5",
  "object": "model",
  "created": 1700000000,
  "owned_by": "anthropic"
}
```

---

### Anthropic-Compatible

#### POST /v1/messages

Create a message using Anthropic API format.

**Request Body**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model ID |
| `messages` | array | Yes | Array of message objects |
| `max_tokens` | integer | No | Maximum tokens to generate |
| `stream` | boolean | No | Enable SSE streaming |
| `system` | string/array | No | System prompt |
| `temperature` | number | No | Sampling temperature (0-1) |
| `top_p` | number | No | Nucleus sampling (0-1) |
| `top_k` | integer | No | Top-k sampling |
| `stop_sequences` | array | No | Stop sequences |
| `tools` | array | No | Available tools |
| `tool_choice` | object | No | Tool selection mode |
| `thinking` | object | No | Extended thinking configuration |

**Example**

```bash
curl -X POST https://your-worker.dev/v1/messages \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-5",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

**Response**

```json
{
  "id": "msg_abc123",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "Hello! How can I assist you today?"}],
  "model": "claude-sonnet-4-5",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 10,
    "output_tokens": 15
  }
}
```

---

### Admin Endpoints

All admin endpoints require `ADMIN_KEY`:

```
Authorization: Bearer YOUR_ADMIN_KEY
```

#### POST /admin/token

Add or update an OAuth token.

**Request Body**

```json
{
  "refreshToken": "1//0g...",
  "projectId": "my-project-123",
  "email": "user@gmail.com",
  "accessToken": "ya29...",
  "expiresAt": 1700000000000
}
```

**Response**

```json
{"success": true, "email": "user@gmail.com", "expiresAt": 1700000000000}
```

---

#### GET /admin/token

Check if tokens exist.

**Response**

```json
{"hasToken": true, "count": 3}
```

Returns `404` with `{"error": "No token stored"}` if no tokens exist.

---

#### POST /admin/token/refresh

Force refresh all tokens.

**Response**

```json
{"success": true, "refreshed": 3}
```

---

#### DELETE /admin/token?email={email}

Delete a specific account.

```bash
curl -X DELETE "https://your-worker.dev/admin/token?email=user@gmail.com" \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"
```

---

#### POST /admin/warmup

Warm up quota for all accounts.

**Response**

```json
{
  "results": [
    {"email": "user@gmail.com", "warmedUp": ["claude", "gemini-3-pro"], "skipped": [], "errors": []}
  ]
}
```

---

#### GET /admin/accounts

List all accounts with quota information. Returns masked emails for non-admin requests.

**Response (Admin)**

```json
{
  "accounts": [
    {
      "email": "user@gmail.com",
      "projectId": "project-123",
      "tier": "standard",
      "expiresAt": 1700000000000,
      "rateLimitUntil": null,
      "quota": {...}
    }
  ],
  "isAdmin": true,
  "fetchedAt": 1700000000000
}
```

---

### OAuth Endpoints

#### GET /auth/authorize

Get OAuth authorization URL.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `redirectUri` | string | Optional custom redirect URI |

**Response**

```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "verifier": "abc123xyz...",
  "state": "eyJ2ZXJpZmllciI6..."
}
```

---

#### POST /auth/exchange

Exchange authorization code for tokens.

**Request Body**

```json
{
  "code": "4/0AX4XfWh...",
  "state": "eyJ2ZXJpZmllciI6..."
}
```

---

#### POST /auth/callback

OAuth callback - exchanges code and stores token.

**Request Body**

```json
{
  "code": "4/0AX4XfWh...",
  "state": "eyJ2ZXJpZmllciI6...",
  "redirectUri": "http://localhost:3000/callback"
}
```

---

#### POST /auth/refresh

Manually refresh an access token.

**Request Body**

```json
{
  "refreshToken": "1//0g..."
}
```

**Response**

```json
{
  "accessToken": "ya29...",
  "expiresIn": 3599
}
```

---

#### GET /auth

Web dashboard for account management.

---

### Documentation Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /docs` | Swagger UI |
| `GET /openapi.json` | OpenAPI specification |

---

## Available Models

| Model ID | Provider | Description |
|----------|----------|-------------|
| `gemini-3-pro-preview` | Google | Gemini 3 Pro Preview |
| `gemini-3-flash` | Google | Gemini 3 Flash |
| `gemini-2.5-flash` | Google | Gemini 2.5 Flash |
| `gemini-2.5-flash-lite` | Google | Gemini 2.5 Flash Lite |
| `claude-sonnet-4-5` | Anthropic | Claude Sonnet 4.5 |
| `claude-opus-4-5` | Anthropic | Claude Opus 4.5 |
| `gpt-oss-120b-medium` | OpenAI | GPT-OSS 120B Medium |

**Model Aliases (Anthropic)**

| Alias | Resolves To |
|-------|-------------|
| `claude-sonnet-4-5-20250929` | `claude-sonnet-4-5` |
| `claude-4-sonnet` | `claude-sonnet-4-5` |
| `claude-opus-4-5-20251101` | `claude-opus-4-5` |
| `claude-4-opus` | `claude-opus-4-5` |

---

## Extended Thinking

Extended thinking enables models to reason through complex problems before responding.

### OpenAI-Compatible Format

```json
{
  "model": "claude-sonnet-4-5",
  "messages": [{"role": "user", "content": "Solve: 847 * 239"}],
  "reasoning_effort": "high",
  "include_thoughts": true
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `reasoning_effort` | string | `"none"`, `"low"`, `"medium"`, `"high"` |
| `thinking_budget` | integer | Explicit token budget (overrides reasoning_effort) |
| `include_thoughts` | boolean | Include thinking in response |

**Reasoning Effort to Budget Mapping**

| Level | Budget (tokens) |
|-------|-----------------|
| `none` | 0 |
| `low` | 4,096 |
| `medium` | 8,192 |
| `high` | 16,384 |

**Response with Thinking**

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "The answer is 202,433.",
      "reasoning_content": "Let me work through this step by step...",
      "thought_signature": "sig_abc123..."
    }
  }],
  "usage": {
    "completion_tokens_details": {
      "reasoning_tokens": 1500
    }
  }
}
```

### Anthropic-Compatible Format

```json
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 16384,
  "messages": [{"role": "user", "content": "Solve: 847 * 239"}],
  "thinking": {
    "type": "enabled",
    "budget_tokens": 8192
  }
}
```

**Response with Thinking**

```json
{
  "content": [
    {
      "type": "thinking",
      "thinking": "Let me work through this step by step...",
      "signature": "sig_abc123..."
    },
    {
      "type": "text",
      "text": "The answer is 202,433."
    }
  ]
}
```

### Multi-turn with Thinking

When continuing a conversation that includes thinking, include the `thought_signature` or `signature` from the previous response to maintain thinking continuity:

**OpenAI Format**

```json
{
  "messages": [
    {"role": "user", "content": "What is 2+2?"},
    {
      "role": "assistant",
      "content": "4",
      "reasoning_content": "Adding 2 and 2...",
      "thought_signature": "sig_abc123..."
    },
    {"role": "user", "content": "Multiply that by 3"}
  ]
}
```

---

## Streaming

### OpenAI Streaming Format

Server-Sent Events with `data:` prefix:

```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**With Thinking (streaming)**

```
data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"Let me think..."}}]}

data: {"choices":[{"delta":{"reasoning_content":" about this problem."}}]}

data: {"choices":[{"delta":{"content":"The answer is..."}}]}

data: [DONE]
```

### Anthropic Streaming Format

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_abc123","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":5}}

event: message_stop
data: {"type":"message_stop"}
```

**With Thinking (streaming)**

```
event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me think..."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}
```

---

## Error Handling

### Error Response Format

**OpenAI Format**

```json
{
  "error": {
    "message": "The model 'invalid-model' does not exist",
    "type": "invalid_request_error",
    "param": "model",
    "code": "model_not_found"
  }
}
```

**Anthropic Format**

```json
{
  "type": "error",
  "error": {
    "type": "authentication_error",
    "message": "Invalid API key"
  }
}
```

### HTTP Status Codes

| Status | Description |
|--------|-------------|
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid or missing API key |
| 403 | Forbidden - Admin access disabled |
| 404 | Not Found - Model or resource not found |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid API key` | Wrong or missing API_KEY | Check Authorization header |
| `No valid token available` | No OAuth tokens configured | Set up token via /auth |
| `All accounts rate limited` | All accounts hit rate limits | Wait or add more accounts |
| `All accounts exhausted` | Rotation exhausted all accounts | Wait for rate limit cooldown |
| `Model not found` | Invalid model ID | Check available models |

---

## Rate Limiting

The API implements intelligent multi-account token rotation:

1. **Automatic Rotation**: Requests rotate between configured accounts
2. **Rate Limit Detection**: 429 responses trigger account exclusion
3. **Auto-Wait**: System waits up to 25 seconds for rate limit cooldown
4. **Retry Depth**: Maximum 10 retry attempts across accounts

### Behavior

| Scenario | Result |
|----------|--------|
| Account rate limited | Automatically switches to next account |
| All accounts rate limited (wait < 25s) | Waits for nearest cooldown, then retries |
| All accounts rate limited (wait > 25s) | Returns 429 immediately |
| All accounts exhausted | Returns 429 with "All accounts exhausted" |

### Rate Limit Response

```json
{
  "error": "All accounts rate limited",
  "details": "Tried 3 accounts"
}
```

---

## SDK Integration

### OpenAI Python

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-worker.dev/v1",
    api_key="YOUR_API_KEY"
)

response = client.chat.completions.create(
    model="claude-sonnet-4-5",
    messages=[{"role": "user", "content": "Hello!"}]
)

print(response.choices[0].message.content)
```

**With Streaming**

```python
stream = client.chat.completions.create(
    model="claude-sonnet-4-5",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

**With Extended Thinking**

```python
response = client.chat.completions.create(
    model="claude-sonnet-4-5",
    messages=[{"role": "user", "content": "Solve: 847 * 239"}],
    extra_body={
        "reasoning_effort": "high",
        "include_thoughts": True
    }
)

# Access thinking content
message = response.choices[0].message
print("Thinking:", getattr(message, "reasoning_content", None))
print("Answer:", message.content)
```

### OpenAI Node.js

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://your-worker.dev/v1',
  apiKey: 'YOUR_API_KEY'
});

const response = await client.chat.completions.create({
  model: 'claude-sonnet-4-5',
  messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(response.choices[0].message.content);
```

**With Streaming**

```javascript
const stream = await client.chat.completions.create({
  model: 'claude-sonnet-4-5',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

### Anthropic Python

```python
from anthropic import Anthropic

client = Anthropic(
    base_url="https://your-worker.dev",
    api_key="YOUR_API_KEY"
)

message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)

print(message.content[0].text)
```

**With Extended Thinking**

```python
message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=16384,
    messages=[{"role": "user", "content": "Solve: 847 * 239"}],
    thinking={
        "type": "enabled",
        "budget_tokens": 8192
    }
)

for block in message.content:
    if block.type == "thinking":
        print("Thinking:", block.thinking)
    elif block.type == "text":
        print("Answer:", block.text)
```

### Anthropic Node.js

```javascript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  baseURL: 'https://your-worker.dev',
  apiKey: 'YOUR_API_KEY'
});

const message = await client.messages.create({
  model: 'claude-sonnet-4-5',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(message.content[0].text);
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `API_KEY` | No | API key for chat/message endpoints |
| `ADMIN_KEY` | No | API key for admin endpoints |
| `ENVIRONMENT` | No | Set to `development` for detailed error messages |
