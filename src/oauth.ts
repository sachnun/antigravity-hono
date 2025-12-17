import {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_CLIENT_SECRET,
  ANTIGRAVITY_REDIRECT_URI,
  ANTIGRAVITY_SCOPES,
  CODE_ASSIST_ENDPOINT_FALLBACKS,
  CODE_ASSIST_HEADERS,
} from './constants'

interface PkceResult {
  verifier: string
  challenge: string
}

async function generatePKCE(): Promise<PkceResult> {
  const verifier = crypto.randomUUID() + crypto.randomUUID()
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return { verifier, challenge }
}

function encodeState(payload: { verifier: string; projectId: string }): string {
  return btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function decodeState(state: string): { verifier: string; projectId: string } {
  const normalized = state.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  const json = atob(padded)
  const parsed = JSON.parse(json)
  return {
    verifier: parsed.verifier ?? '',
    projectId: parsed.projectId ?? '',
  }
}

export interface AuthorizeResult {
  url: string
  verifier: string
  state: string
}

export async function authorizeAntigravity(redirectUri?: string): Promise<AuthorizeResult> {
  const pkce = await generatePKCE()
  const state = encodeState({ verifier: pkce.verifier, projectId: '' })
  
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', ANTIGRAVITY_CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri ?? ANTIGRAVITY_REDIRECT_URI)
  url.searchParams.set('scope', ANTIGRAVITY_SCOPES.join(' '))
  url.searchParams.set('code_challenge', pkce.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')

  return {
    url: url.toString(),
    verifier: pkce.verifier,
    state,
  }
}

export async function fetchProjectId(accessToken: string): Promise<string> {
  const loadHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...CODE_ASSIST_HEADERS,
  }

  for (const baseEndpoint of CODE_ASSIST_ENDPOINT_FALLBACKS) {
    const url = `${baseEndpoint}/v1internal:loadCodeAssist`
    const response = await fetch(url, {
      method: 'POST',
      headers: loadHeaders,
      body: JSON.stringify({
        metadata: {
          ideType: 'IDE_UNSPECIFIED',
          platform: 'PLATFORM_UNSPECIFIED',
          pluginType: 'GEMINI',
        },
      }),
    })

    if (!response.ok) continue

    const data = await response.json() as Record<string, unknown>
    if (typeof data.cloudaicompanionProject === 'string' && data.cloudaicompanionProject) {
      return data.cloudaicompanionProject
    }
    const project = data.cloudaicompanionProject as Record<string, unknown> | undefined
    if (project && typeof project.id === 'string' && project.id) {
      return project.id
    }
  }

  return ''
}

export interface ExchangeResult {
  accessToken: string
  refreshToken: string
  expiresAt: number
  email?: string
  projectId?: string
}

export async function exchangeAntigravity(
  code: string,
  state: string,
  redirectUri?: string
): Promise<ExchangeResult> {
  const { verifier } = decodeState(state)

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri ?? ANTIGRAVITY_REDIRECT_URI,
      code_verifier: verifier,
    }),
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    throw new Error(`Token exchange failed: ${errorText}`)
  }

  const tokenPayload = await tokenResponse.json() as {
    access_token: string
    expires_in: number
    refresh_token: string
  }

  const userInfoResponse = await fetch(
    'https://www.googleapis.com/oauth2/v1/userinfo?alt=json',
    { headers: { Authorization: `Bearer ${tokenPayload.access_token}` } }
  )

  const userInfo = userInfoResponse.ok
    ? (await userInfoResponse.json() as { email?: string })
    : {}

  const projectId = await fetchProjectId(tokenPayload.access_token)

  return {
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    expiresAt: Date.now() + tokenPayload.expires_in * 1000,
    email: userInfo.email,
    projectId: projectId || undefined,
  }
}

export interface RefreshResult {
  accessToken: string
  expiresAt: number
  refreshToken?: string
}

export async function refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token refresh failed: ${errorText}`)
  }

  const payload = await response.json() as {
    access_token: string
    expires_in: number
    refresh_token?: string
  }

  return {
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
    refreshToken: payload.refresh_token,
  }
}
