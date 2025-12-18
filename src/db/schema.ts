import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const tokens = sqliteTable('tokens', {
  email: text('email').primaryKey(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  projectId: text('project_id').notNull(),
  expiresAt: integer('expires_at').notNull(),
  tier: text('tier'),
  geminiRateLimitUntil: integer('gemini_rate_limit_until'),
  claudeRateLimitUntil: integer('claude_rate_limit_until'),
  updatedAt: integer('updated_at').$defaultFn(() => Date.now()),
})

export type Token = typeof tokens.$inferSelect
export type NewToken = typeof tokens.$inferInsert
