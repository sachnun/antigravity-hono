import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const tokens = sqliteTable('tokens', {
  email: text('email').primaryKey(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  projectId: text('project_id').notNull(),
  expiresAt: integer('expires_at').notNull(),
  tier: text('tier'),
  rateLimitUntil: integer('rate_limit_until'),
  updatedAt: integer('updated_at').$defaultFn(() => Date.now()),
}, (table) => [
  index('rate_limit_idx').on(table.rateLimitUntil),
])

export type Token = typeof tokens.$inferSelect
export type NewToken = typeof tokens.$inferInsert
