import type { QuotaGroup } from '@/lib/types'

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

type QuotaBarProps = {
  group: QuotaGroup
}

export const QuotaBar = ({ group }: QuotaBarProps) => {
  const pct = group.remainingFraction !== null ? Math.round(group.remainingFraction * 100) : 0
  const cls = getQuotaClass(group.remainingFraction)
  const resetText = formatRelativeTime(group.resetTimestamp)

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-neutral-300">{group.displayName}</span>
        <span className="text-xs text-neutral-500">{pct}%</span>
      </div>
      <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      {resetText && <div className="text-[11px] text-neutral-600 mt-1">Reset: {resetText}</div>}
    </div>
  )
}
