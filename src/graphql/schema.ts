export const typeDefs = /* GraphQL */ `
  type QuotaGroup {
    group: String!
    displayName: String!
    remainingFraction: Float
    isExhausted: Boolean!
    resetTime: String
    resetTimestamp: Float
  }

  type Quota {
    email: String!
    projectId: String!
    status: String!
    error: String
    groups: [QuotaGroup!]!
    fetchedAt: Float!
  }

  type Account {
    email: String!
    projectId: String
    tier: String
    expiresAt: Float
    rateLimitUntil: Float
    quota: Quota
  }

  type AccountsResult {
    accounts: [Account!]!
    isAdmin: Boolean!
    fetchedAt: Float!
  }

  type RefreshResult {
    success: Boolean!
    refreshed: Int!
    errors: [String!]!
  }

  type WarmupError {
    group: String!
    error: String!
  }

  type WarmupResult {
    email: String!
    warmedUp: [String!]!
    skipped: [String!]!
    errors: [WarmupError!]!
  }

  type AddAccountResult {
    success: Boolean!
    email: String!
    projectId: String!
    tier: String
    expiresAt: Float!
  }

  type DeleteAccountResult {
    success: Boolean!
  }

  type AuthUrl {
    url: String!
    state: String!
  }

  type Query {
    accounts: AccountsResult!
    account(email: String!): Account
  }

  input AddAccountInput {
    code: String!
    state: String!
    redirectUri: String
  }

  type Mutation {
    addAccount(input: AddAccountInput!): AddAccountResult!
    deleteAccount(email: String!): DeleteAccountResult!
    refreshTokens: RefreshResult!
    warmupAccounts: [WarmupResult!]!
  }
`
