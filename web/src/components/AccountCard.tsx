import type { Account } from '@/lib/types'
import { QuotaBar } from './QuotaBar'

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

type AccountCardProps = {
  account: Account
  isAdmin: boolean
  onDelete?: (email: string) => void
}

export const AccountCard = ({ account, isAdmin, onDelete }: AccountCardProps) => {
  const email = account.email
  const quota = account.quota

  const geminiRL = account.rateLimitUntil?.gemini
  const claudeRL = account.rateLimitUntil?.claude
  const hasRL = (geminiRL && Date.now() < geminiRL) || (claudeRL && Date.now() < claudeRL)

  const expiry = account.expiresAt ? formatExpiry(account.expiresAt) : null

  const tierBadge = () => {
    if (!account.tier || account.tier === 'unknown') return null
    const isPro = account.tier.toLowerCase().includes('pro') || account.tier === 'standard-tier'
    const isFree = account.tier === 'free-tier'
    const cls = isPro ? 'bg-green-600' : isFree ? 'bg-blue-600' : 'bg-neutral-600'
    const label = isPro ? 'PRO' : isFree ? 'FREE' : account.tier.toUpperCase()
    return <span className={`px-2 py-0.5 rounded text-xs font-semibold text-white ${cls}`}>{label}</span>
  }

  return (
    <div className={`bg-neutral-900 border rounded-lg p-4 mb-3 ${hasRL ? 'border-amber-500 bg-amber-500/5' : 'border-neutral-800'}`}>
      <div className="flex justify-between items-center mb-3">
        <span className="font-semibold text-white text-sm">{email}</span>
        <div className="flex gap-2">
          {tierBadge()}
          {hasRL && <span className="bg-amber-500 text-black px-2 py-0.5 rounded text-xs font-semibold">RATE LIMITED</span>}
        </div>
      </div>

      {isAdmin && account.projectId && (
        <div className="text-xs text-neutral-500 space-y-1">
          <div className="flex justify-between">
            <span>Project ID</span>
            <span>{account.projectId}</span>
          </div>
          {expiry && (
            <div className="flex justify-between">
              <span>Expires</span>
              <span className={expiry.cls}>{expiry.text}</span>
            </div>
          )}
        </div>
      )}

      {quota?.status === 'success' && quota.groups && (
        <div className={`space-y-3 ${isAdmin && account.projectId ? 'mt-4' : ''}`}>
          {quota.groups.map((group) => (
            <QuotaBar key={group.displayName} group={group} />
          ))}
        </div>
      )}

      {quota?.status === 'error' && (
        <div className="text-red-500 text-xs p-2 bg-red-500/10 rounded mt-3">{quota.error || 'Failed to fetch quota'}</div>
      )}

      {isAdmin && onDelete && (
        <div className="flex gap-2 mt-3">
          <button
            className="px-3 py-1.5 text-xs font-medium rounded bg-red-600 hover:bg-red-700 text-white"
            onClick={() => onDelete(email)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
