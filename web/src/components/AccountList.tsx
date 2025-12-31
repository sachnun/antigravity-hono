import { useState, useMemo } from 'react'
import type { Account, QuotaGroup } from '@/lib/types'
import { AccountCard } from './AccountCard'

type AggregatedStats = {
  totalAccounts: number
  rateLimited: number
  quotaGroups: Map<string, { total: number; sum: number; resetTimestamp?: number }>
}

const aggregateStats = (accounts: Account[]): AggregatedStats => {
  const quotaGroups = new Map<string, { total: number; sum: number; resetTimestamp?: number }>()

  let rateLimited = 0

  for (const account of accounts) {
    if (account.rateLimitUntil && Date.now() < account.rateLimitUntil) {
      rateLimited++
    }

    if (account.quota?.status === 'success' && account.quota.groups) {
      for (const group of account.quota.groups) {
        const existing = quotaGroups.get(group.displayName)
        if (existing) {
          existing.total++
          existing.sum += group.remainingFraction ?? 0
          if (group.resetTimestamp && (!existing.resetTimestamp || group.resetTimestamp < existing.resetTimestamp)) {
            existing.resetTimestamp = group.resetTimestamp
          }
        } else {
          quotaGroups.set(group.displayName, {
            total: 1,
            sum: group.remainingFraction ?? 0,
            resetTimestamp: group.resetTimestamp,
          })
        }
      }
    }
  }

  return { totalAccounts: accounts.length, rateLimited, quotaGroups }
}

const getQuotaClass = (fraction: number | null) => {
  if (fraction === null || fraction <= 0) return 'bg-red-600'
  if (fraction <= 0.2) return 'bg-red-500'
  if (fraction <= 0.5) return 'bg-amber-500'
  return 'bg-green-500'
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

type AccountListProps = {
  accounts: Account[]
  isAdmin: boolean
  onDelete?: (email: string) => void
}

export const AccountList = ({ accounts, isAdmin, onDelete }: AccountListProps) => {
  const [expanded, setExpanded] = useState(false)

  const stats = useMemo(() => aggregateStats(accounts), [accounts])

  const aggregatedGroups: QuotaGroup[] = useMemo(() => {
    const result: QuotaGroup[] = []
    for (const [name, data] of stats.quotaGroups) {
      result.push({
        displayName: name,
        remainingFraction: data.total > 0 ? data.sum / data.total : null,
        resetTimestamp: data.resetTimestamp,
      })
    }
    return result
  }, [stats.quotaGroups])

  return (
    <div>
      {/* Aggregated Stats Summary */}
      <div
        className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 cursor-pointer hover:bg-neutral-750 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <span className="text-white font-semibold">
              {stats.totalAccounts} Account{stats.totalAccounts !== 1 ? 's' : ''}
            </span>
            {stats.rateLimited > 0 && (
              <span className="bg-amber-500 text-black px-2 py-0.5 rounded text-xs font-semibold">
                {stats.rateLimited} RATE LIMITED
              </span>
            )}
          </div>
          <svg
            className={`w-5 h-5 text-neutral-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Aggregated Quota Bars */}
        {aggregatedGroups.length > 0 && (
          <div className="space-y-3">
            {aggregatedGroups.map((group) => {
              const pct = group.remainingFraction !== null ? Math.round(group.remainingFraction * 100) : 0
              const cls = getQuotaClass(group.remainingFraction)
              const resetText = formatRelativeTime(group.resetTimestamp)

              return (
                <div key={group.displayName}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-neutral-300">{group.displayName}</span>
                    <span className="text-xs text-neutral-500">{pct}% avg</span>
                  </div>
                  <div className="h-2 bg-neutral-900 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${cls}`} style={{ width: `${pct}%` }} />
                  </div>
                  {resetText && <div className="text-[11px] text-neutral-600 mt-1">Reset: {resetText}</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Expanded Account List */}
      {expanded && (
        <div className="mt-3 space-y-0 max-h-[calc(100vh-400px)] overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent hover:scrollbar-thumb-neutral-600">
          {accounts.map((account) => (
            <AccountCard
              key={account.email}
              account={account}
              isAdmin={isAdmin}
              onDelete={isAdmin ? onDelete : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
