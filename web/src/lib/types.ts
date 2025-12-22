export type QuotaGroup = {
  displayName: string
  remainingFraction: number | null
  resetTimestamp?: number
}

export type Quota = {
  email: string
  status: 'success' | 'error'
  groups?: QuotaGroup[]
  error?: string
}

export type Account = {
  email: string
  projectId?: string
  tier?: string
  expiresAt?: number
  rateLimitUntil?: { gemini?: number; claude?: number }
  quota?: Quota | null
}

export type AccountsResponse = {
  accounts: Account[]
  isAdmin: boolean
  fetchedAt: number
}
