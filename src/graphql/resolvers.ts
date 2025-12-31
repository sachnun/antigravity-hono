import type { GraphQLContext } from './context'
import { getAllTokens, deleteStoredToken, handleTokenRefresh, setStoredToken, type StoredToken } from '../services/tokens'
import { getAllAccountsQuota, type AccountQuotaInfo } from '../services/quota'
import { warmUpAllAccounts, type WarmupResult } from '../services/warmup'
import { exchangeAntigravity } from '../oauth'
import { maskEmail } from '../lib/utils'
import { GraphQLError } from 'graphql'

function requireAdmin(ctx: GraphQLContext): void {
  if (!ctx.isAdmin) {
    throw new GraphQLError('Unauthorized - admin access required', {
      extensions: { code: 'UNAUTHORIZED' },
    })
  }
}

type AccountWithQuota = {
  email: string
  projectId?: string
  tier?: string
  expiresAt?: number
  rateLimitUntil?: number
  quota: AccountQuotaInfo | null
}

export const resolvers = {
  Query: {
    accounts: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const quotas = await getAllAccountsQuota(ctx.db)
      const tokens = await getAllTokens(ctx.db)

      const quotaByEmail = Object.fromEntries(quotas.map((q) => [q.email, q]))
      const tokenByEmail = Object.fromEntries(tokens.map((t) => [t.email, t]))

      let accounts: AccountWithQuota[]

      if (ctx.isAdmin) {
        accounts = tokens.map((t) => ({
          email: t.email,
          projectId: t.projectId,
          tier: t.tier,
          expiresAt: t.expiresAt,
          rateLimitUntil: t.rateLimitUntil,
          quota: quotaByEmail[t.email] || null,
        }))
      } else {
        accounts = quotas.map((q) => {
          const token = tokenByEmail[q.email]
          return {
            email: maskEmail(q.email),
            tier: token?.tier,
            rateLimitUntil: token?.rateLimitUntil,
            quota: q,
          }
        })
      }

      return {
        accounts,
        isAdmin: ctx.isAdmin,
        fetchedAt: Date.now(),
      }
    },

    account: async (_: unknown, args: { email: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx)

      const tokens = await getAllTokens(ctx.db)
      const token = tokens.find((t) => t.email === args.email)
      if (!token) return null

      const quotas = await getAllAccountsQuota(ctx.db)
      const quota = quotas.find((q) => q.email === args.email) || null

      return {
        email: token.email,
        projectId: token.projectId,
        tier: token.tier,
        expiresAt: token.expiresAt,
        rateLimitUntil: token.rateLimitUntil,
        quota,
      }
    },

  },

  Mutation: {
    addAccount: async (
      _: unknown,
      args: { input: { code: string; state: string; redirectUri?: string } },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx)

      let result
      try {
        result = await exchangeAntigravity(args.input.code, args.input.state, args.input.redirectUri)
      } catch (e) {
        throw new GraphQLError(
          `Token exchange failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
          { extensions: { code: 'EXCHANGE_FAILED' } }
        )
      }

      if (!result.email) {
        throw new GraphQLError('Failed to get email from Google', {
          extensions: { code: 'EXCHANGE_FAILED' },
        })
      }

      const token: StoredToken = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        projectId: result.projectId ?? '',
        expiresAt: result.expiresAt,
        email: result.email,
        tier: result.tier,
      }

      await setStoredToken(ctx.db, token)

      return {
        success: true,
        email: token.email,
        projectId: token.projectId,
        tier: token.tier,
        expiresAt: token.expiresAt,
      }
    },

    deleteAccount: async (_: unknown, args: { email: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx)
      await deleteStoredToken(ctx.db, args.email)
      return { success: true }
    },

    refreshTokens: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireAdmin(ctx)
      return handleTokenRefresh(ctx.db)
    },

    warmupAccounts: async (_: unknown, __: unknown, ctx: GraphQLContext): Promise<WarmupResult[]> => {
      requireAdmin(ctx)
      return warmUpAllAccounts(ctx.db)
    },
  },
}
