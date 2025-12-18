import { useState, useEffect } from 'hono/jsx'
import { render } from 'hono/jsx/dom'

type QuotaGroup = {
  displayName: string
  remainingFraction: number | null
  resetTimestamp?: number
}

type Quota = {
  email: string
  status: 'success' | 'error'
  groups?: QuotaGroup[]
  error?: string
}

type Token = {
  email: string
  projectId?: string
  expiresAt?: number
  lastUsed?: number
  tier?: string
  rateLimitUntil?: { gemini?: number; claude?: number }
}

const getAuthHeaders = (): Record<string, string> => {
  const adminKey = localStorage.getItem('adminKey') || ''
  return adminKey ? { Authorization: `Bearer ${adminKey}` } : {}
}

const maskEmail = (email: string) => {
  if (!email) return 'N/A'
  const [local, domain] = email.split('@')
  if (!domain) return email
  const maskedLocal = local.length <= 2 ? local[0] + '***' : local.slice(0, 2) + '***'
  return `${maskedLocal}@${domain}`
}

const formatExpiry = (expiresAt?: number) => {
  if (!expiresAt) return { text: 'Unknown', cls: '' }
  const diff = expiresAt - Date.now()
  if (diff <= 0) return { text: 'Expired', cls: 'text-red-500' }

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  const text = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  const cls = diff < 30 * 60 * 1000 ? 'text-amber-500' : 'text-green-500'
  return { text, cls }
}

const formatRelativeTime = (timestamp?: number) => {
  if (!timestamp) return null
  const diff = timestamp - Date.now()
  if (diff <= 0) return 'Now'

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

const getQuotaClass = (fraction: number | null) => {
  if (fraction === null || fraction <= 0) return 'bg-red-600'
  if (fraction <= 0.2) return 'bg-red-500'
  if (fraction <= 0.5) return 'bg-amber-500'
  return 'bg-green-500'
}

const QuotaBar = ({ group }: { group: QuotaGroup }) => {
  const pct = group.remainingFraction !== null ? Math.round(group.remainingFraction * 100) : 0
  const cls = getQuotaClass(group.remainingFraction)
  const resetText = formatRelativeTime(group.resetTimestamp)

  return (
    <div>
      <div class="flex justify-between items-center mb-1">
        <span class="text-xs text-neutral-300">{group.displayName}</span>
        <span class="text-xs text-neutral-500">{pct}%</span>
      </div>
      <div class="h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div class={`h-full rounded-full transition-all ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      {resetText && <div class="text-[11px] text-neutral-600 mt-1">Reset: {resetText}</div>}
    </div>
  )
}

const AccountCard = ({
  token,
  quota,
  isAdmin,
  onDelete,
}: {
  token?: Token
  quota?: Quota
  isAdmin: boolean
  onDelete?: (email: string) => void
}) => {
  const email = token?.email || quota?.email || ''
  const displayEmail = isAdmin ? email : maskEmail(email)

  const geminiRL = token?.rateLimitUntil?.gemini
  const claudeRL = token?.rateLimitUntil?.claude
  const hasRL = (geminiRL && Date.now() < geminiRL) || (claudeRL && Date.now() < claudeRL)

  const expiry = token ? formatExpiry(token.expiresAt) : null

  const tierBadge = () => {
    if (!token?.tier || token.tier === 'unknown') return null
    const isPro = token.tier.toLowerCase().includes('pro') || token.tier === 'standard-tier'
    const isFree = token.tier === 'free-tier'
    const cls = isPro ? 'bg-green-600' : isFree ? 'bg-blue-600' : 'bg-neutral-600'
    const label = isPro ? 'PRO' : isFree ? 'FREE' : token.tier.toUpperCase()
    return <span class={`px-2 py-0.5 rounded text-xs font-semibold text-white ${cls}`}>{label}</span>
  }

  return (
    <div class={`bg-neutral-900 border rounded-lg p-4 mb-3 ${hasRL ? 'border-amber-500 bg-amber-500/5' : 'border-neutral-800'}`}>
      <div class="flex justify-between items-center mb-3">
        <span class="font-semibold text-white text-sm">{displayEmail}</span>
        <div class="flex gap-2">
          {tierBadge()}
          {hasRL && <span class="bg-amber-500 text-black px-2 py-0.5 rounded text-xs font-semibold">RATE LIMITED</span>}
        </div>
      </div>

      {isAdmin && token && (
        <div class="text-xs text-neutral-500 space-y-1">
          <div class="flex justify-between">
            <span>Project ID</span>
            <span>{token.projectId || 'N/A'}</span>
          </div>
          <div class="flex justify-between">
            <span>Expires</span>
            <span class={expiry?.cls}>{expiry?.text}</span>
          </div>
          {token.lastUsed && (
            <div class="flex justify-between">
              <span>Last Used</span>
              <span>{new Date(token.lastUsed).toLocaleTimeString()}</span>
            </div>
          )}
        </div>
      )}

      {quota?.status === 'success' && quota.groups && (
        <div class={`space-y-3 ${isAdmin && token ? 'mt-4' : ''}`}>
          {quota.groups.map((group) => (
            <QuotaBar group={group} />
          ))}
        </div>
      )}

      {quota?.status === 'error' && (
        <div class="text-red-500 text-xs p-2 bg-red-500/10 rounded mt-3">{quota.error || 'Failed to fetch quota'}</div>
      )}

      {isAdmin && onDelete && (
        <div class="flex gap-2 mt-3">
          <button
            class="px-3 py-1.5 text-xs font-medium rounded bg-red-600 hover:bg-red-700 text-white"
            onClick={() => onDelete(email)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

const LoginForm = ({ onLogin }: { onLogin: (key: string) => void }) => {
  const [key, setKey] = useState('')

  return (
    <div class="p-5 bg-neutral-900 rounded-lg border border-neutral-800">
      <div class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">Admin Login</div>
      <input
        type="password"
        value={key}
        onInput={(e) => setKey((e.target as HTMLInputElement).value)}
        placeholder="Enter Admin Key"
        class="w-full px-3 py-3 rounded-md border border-neutral-700 bg-neutral-950 text-neutral-300 text-sm font-mono focus:outline-none focus:border-blue-500"
      />
      <button
        class="w-full mt-3 px-4 py-2.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        onClick={() => onLogin(key)}
      >
        Login
      </button>
    </div>
  )
}

const AddAccountForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const [authUrl, setAuthUrl] = useState('')
  const [generating, setGenerating] = useState(false)
  const [callbackUrl, setCallbackUrl] = useState('')
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const generateAuthUrl = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/auth/authorize?redirectUri=http://localhost:9999/', { headers: getAuthHeaders() })
      const data = (await res.json()) as { url: string }
      setAuthUrl(data.url)
    } catch {
      setResult({ type: 'error', message: 'Failed to generate URL' })
    }
    setGenerating(false)
  }

  const exchangeToken = async () => {
    if (!callbackUrl.trim()) {
      setResult({ type: 'error', message: 'Please paste the callback URL' })
      return
    }

    setResult(null)
    try {
      const url = new URL(callbackUrl)
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      if (!code || !state) {
        setResult({ type: 'error', message: 'Invalid URL - missing code or state' })
        return
      }

      const res = await fetch('/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ code, state, redirectUri: 'http://localhost:9999/' }),
      })

      const data = (await res.json()) as { email?: string; error?: string }
      if (res.ok) {
        setResult({ type: 'success', message: `Added: ${data.email}` })
        setCallbackUrl('')
        setAuthUrl('')
        onSuccess()
      } else {
        setResult({ type: 'error', message: data.error || 'Exchange failed' })
      }
    } catch (e) {
      setResult({ type: 'error', message: `Error: ${(e as Error).message}` })
    }
  }

  return (
    <div class="p-5 bg-neutral-900 rounded-lg border border-neutral-800 h-fit lg:sticky lg:top-6">
      <div class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-4">Add Account</div>

      <div class="flex gap-3 mb-4">
        <div class="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0">
          1
        </div>
        <div class="flex-1">
          <p class="text-neutral-400 text-sm mb-2">Generate OAuth URL</p>
          <button
            class="w-full px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            onClick={generateAuthUrl}
            disabled={generating || !!authUrl}
          >
            {generating ? 'Generating...' : authUrl ? 'URL Generated' : 'Generate Auth URL'}
          </button>
          {authUrl && (
            <>
              <div class="mt-2 p-2 bg-neutral-950 border border-neutral-700 rounded-md font-mono text-xs break-all max-h-20 overflow-y-auto">
                {authUrl}
              </div>
              <div class="flex gap-2 mt-2">
                <button
                  class="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors"
                  onClick={() => navigator.clipboard.writeText(authUrl)}
                >
                  Copy
                </button>
                <button
                  class="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  onClick={() => window.open(authUrl, '_blank')}
                >
                  Open
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div class="flex gap-3">
        <div class="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0">
          2
        </div>
        <div class="flex-1">
          <p class="text-neutral-400 text-sm mb-2">Paste callback URL</p>
          <textarea
            value={callbackUrl}
            onInput={(e) => setCallbackUrl((e.target as HTMLTextAreaElement).value)}
            placeholder="http://localhost:9999/?state=...&code=..."
            class="w-full px-3 py-2 rounded-md border border-neutral-700 bg-neutral-950 text-neutral-300 text-sm font-mono focus:outline-none focus:border-blue-500 resize-y min-h-16"
          />
          <button
            class="w-full mt-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            onClick={exchangeToken}
          >
            Add Account
          </button>
          {result && (
            <div class={`text-sm mt-2 ${result.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
              {result.message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const App = () => {
  const [isAdmin, setIsAdmin] = useState(!!localStorage.getItem('adminKey'))
  const [tokens, setTokens] = useState<Token[]>([])
  const [quotas, setQuotas] = useState<Quota[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadAccounts = async () => {
    try {
      const [tokenRes, quotaRes] = await Promise.all([
        fetch('/admin/token/details', { headers: getAuthHeaders() }),
        fetch('/admin/quota', { headers: getAuthHeaders() }),
      ])

      const isAdminNow = tokenRes.status !== 401
      setIsAdmin(isAdminNow)

      const quotaData = (await quotaRes.json()) as { quotas?: Quota[] }
      setQuotas(quotaData.quotas || [])

      if (isAdminNow && tokenRes.ok) {
        const tokenData = (await tokenRes.json()) as { tokens?: Token[] }
        setTokens(tokenData.tokens || [])
      } else {
        setTokens([])
      }
    } catch {
      setTokens([])
      setQuotas([])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadAccounts()
    const interval = setInterval(loadAccounts, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleLogin = (key: string) => {
    localStorage.setItem('adminKey', key)
    setIsAdmin(true)
    loadAccounts()
  }

  const handleLogout = () => {
    localStorage.removeItem('adminKey')
    setIsAdmin(false)
    loadAccounts()
  }

  const handleDelete = async (email: string) => {
    if (!confirm(`Delete account ${email}?`)) return
    try {
      const res = await fetch(`/admin/token?email=${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (res.ok) loadAccounts()
      else alert('Delete failed')
    } catch {
      alert('Delete failed')
    }
  }

  const handleRefreshAll = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/admin/token/refresh', { method: 'POST', headers: getAuthHeaders() })
      const data = (await res.json()) as { refreshed?: number; error?: string }
      if (res.ok) {
        alert(`Refreshed ${data.refreshed} token(s)`)
        loadAccounts()
      } else {
        alert(data.error || 'Refresh failed')
      }
    } catch {
      alert('Refresh failed')
    }
    setRefreshing(false)
  }

  const quotaByEmail = Object.fromEntries(quotas.map((q) => [q.email, q]))
  const accountCount = isAdmin ? tokens.length : quotas.length

  return (
    <div class="max-w-5xl w-full mx-auto">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-2xl font-semibold text-white">Antigravity Auth</h1>
          <p class="text-neutral-500 text-sm">Multi-account Google OAuth token management</p>
        </div>
        {isAdmin && (
          <button
            class="px-3 py-1.5 text-xs font-medium rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors"
            onClick={handleLogout}
          >
            Logout
          </button>
        )}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div class="lg:col-span-3 p-5 bg-neutral-900 rounded-lg border border-neutral-800">
          <div class="flex justify-between items-center mb-3">
            <div class="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Accounts</div>
            {isAdmin && (
              <button
                class="px-3 py-1.5 text-xs font-medium rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors disabled:opacity-50"
                onClick={handleRefreshAll}
                disabled={refreshing}
              >
                {refreshing ? 'Refreshing...' : 'Refresh All'}
              </button>
            )}
          </div>

          {loading ? (
            <div class="flex items-center gap-2 p-3 rounded-md text-sm bg-blue-500/10 border border-blue-500/30 text-blue-500">
              <span class="w-2 h-2 rounded-full bg-current" />
              <span>Loading...</span>
            </div>
          ) : (
            <div class="flex items-center gap-2 p-3 rounded-md text-sm bg-green-500/10 border border-green-500/30 text-green-500">
              <span class="w-2 h-2 rounded-full bg-current" />
              <span>{accountCount} account(s) {isAdmin ? 'configured' : 'available'}</span>
            </div>
          )}

          <div class="mt-4 max-h-[calc(100vh-280px)] overflow-y-auto">
            {isAdmin
              ? tokens.map((token) => (
                  <AccountCard
                    token={token}
                    quota={quotaByEmail[token.email]}
                    isAdmin={true}
                    onDelete={handleDelete}
                  />
                ))
              : quotas.map((quota) => <AccountCard quota={quota} isAdmin={false} />)}
          </div>
        </div>

        <div class="lg:col-span-2 space-y-4">
          {!isAdmin && <LoginForm onLogin={handleLogin} />}
          {isAdmin && <AddAccountForm onSuccess={loadAccounts} />}
        </div>
      </div>
    </div>
  )
}

const root = document.getElementById('root')
if (root) render(<App />, root)
