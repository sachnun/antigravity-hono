import type { AccountsResponse } from './types'

const GRAPHQL_ENDPOINT = '/graphql'

const getAuthHeaders = (): Record<string, string> => {
  const adminKey = localStorage.getItem('adminKey') || ''
  return adminKey ? { Authorization: `Bearer ${adminKey}` } : {}
}

async function graphqlRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ query, variables }),
  })

  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }

  if (!json.data) {
    throw new Error('No data returned from GraphQL')
  }

  return json.data
}

const ACCOUNTS_QUERY = `
  query GetAccounts {
    accounts {
      accounts {
        email
        projectId
        tier
        expiresAt
        rateLimitUntil
        quota {
          email
          status
          error
          groups {
            displayName
            remainingFraction
            resetTimestamp
          }
        }
      }
      isAdmin
      fetchedAt
    }
  }
`

export const fetchAccounts = async (): Promise<AccountsResponse> => {
  const data = await graphqlRequest<{ accounts: AccountsResponse }>(ACCOUNTS_QUERY)
  return data.accounts
}

export const generateAuthUrl = async (): Promise<{ url: string }> => {
  const res = await fetch('/auth/authorize?redirectUri=http://localhost:9999/', {
    headers: getAuthHeaders(),
  })
  return res.json()
}

const ADD_ACCOUNT_MUTATION = `
  mutation AddAccount($input: AddAccountInput!) {
    addAccount(input: $input) {
      success
      email
      projectId
      tier
      expiresAt
    }
  }
`

export const exchangeToken = async (callbackUrl: string): Promise<{ email?: string; error?: string }> => {
  const url = new URL(callbackUrl)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    throw new Error('Invalid URL - missing code or state')
  }

  const data = await graphqlRequest<{ addAccount: { email: string } }>(ADD_ACCOUNT_MUTATION, {
    input: { code, state, redirectUri: 'http://localhost:9999/' },
  })

  return { email: data.addAccount.email }
}

const DELETE_ACCOUNT_MUTATION = `
  mutation DeleteAccount($email: String!) {
    deleteAccount(email: $email) {
      success
    }
  }
`

export const deleteAccount = async (email: string): Promise<void> => {
  await graphqlRequest(DELETE_ACCOUNT_MUTATION, { email })
}

const REFRESH_TOKENS_MUTATION = `
  mutation RefreshTokens {
    refreshTokens {
      success
      refreshed
      errors
    }
  }
`

export const refreshAllTokens = async (): Promise<{ refreshed: number }> => {
  const data = await graphqlRequest<{ refreshTokens: { refreshed: number } }>(REFRESH_TOKENS_MUTATION)
  return { refreshed: data.refreshTokens.refreshed }
}

const WARMUP_ACCOUNTS_MUTATION = `
  mutation WarmupAccounts {
    warmupAccounts {
      email
      warmedUp
      skipped
      errors {
        group
        error
      }
    }
  }
`

export const warmupAccounts = async (): Promise<{
  results: Array<{ email: string; warmedUp: string[]; skipped: string[] }>
}> => {
  const data = await graphqlRequest<{
    warmupAccounts: Array<{ email: string; warmedUp: string[]; skipped: string[] }>
  }>(WARMUP_ACCOUNTS_MUTATION)
  return { results: data.warmupAccounts }
}
