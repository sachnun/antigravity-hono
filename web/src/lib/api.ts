import type { AccountsResponse } from './types'

const getAuthHeaders = (): Record<string, string> => {
  const adminKey = localStorage.getItem('adminKey') || ''
  return adminKey ? { Authorization: `Bearer ${adminKey}` } : {}
}

export const fetchAccounts = async (): Promise<AccountsResponse> => {
  const res = await fetch('/admin/accounts', { headers: getAuthHeaders() })
  return res.json()
}

export const generateAuthUrl = async (): Promise<{ url: string }> => {
  const res = await fetch('/auth/authorize?redirectUri=http://localhost:9999/', {
    headers: getAuthHeaders(),
  })
  return res.json()
}

export const exchangeToken = async (callbackUrl: string): Promise<{ email?: string; error?: string }> => {
  const url = new URL(callbackUrl)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    throw new Error('Invalid URL - missing code or state')
  }

  const res = await fetch('/auth/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ code, state, redirectUri: 'http://localhost:9999/' }),
  })

  const data = (await res.json()) as { email?: string; error?: string }
  if (!res.ok) throw new Error(data.error || 'Exchange failed')
  return data
}

export const deleteAccount = async (email: string): Promise<void> => {
  const res = await fetch(`/admin/token?email=${encodeURIComponent(email)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Delete failed')
}

export const refreshAllTokens = async (): Promise<{ refreshed: number }> => {
  const res = await fetch('/admin/token/refresh', {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  const data = (await res.json()) as { refreshed?: number; error?: string }
  if (!res.ok) throw new Error(data.error || 'Refresh failed')
  return { refreshed: data.refreshed ?? 0 }
}

export const warmupAccounts = async (): Promise<{ results: Array<{ email: string; warmedUp: string[]; skipped: string[] }> }> => {
  const res = await fetch('/admin/warmup', {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  const data = (await res.json()) as { results: Array<{ email: string; warmedUp: string[]; skipped: string[] }> }
  if (!res.ok) throw new Error('Warmup failed')
  return data
}
