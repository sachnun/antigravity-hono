import { useState, useCallback } from 'react'
import { useAccounts, useDeleteAccount, useRefreshTokens, useWarmup } from '@/hooks/useAccounts'
import { AccountCard } from '@/components/AccountCard'
import { LoginForm } from '@/components/LoginForm'
import { AddAccountForm } from '@/components/AddAccountForm'

export const App = () => {
  const [isAdmin, setIsAdmin] = useState(!!localStorage.getItem('adminKey'))
  const { data, isLoading, refetch } = useAccounts()

  const deleteMutation = useDeleteAccount()
  const refreshMutation = useRefreshTokens()
  const warmupMutation = useWarmup()

  const accounts = data?.accounts ?? []
  const actualIsAdmin = data?.isAdmin ?? false

  const handleLogin = useCallback((key: string) => {
    localStorage.setItem('adminKey', key)
    setIsAdmin(true)
    refetch()
  }, [refetch])

  const handleLogout = useCallback(() => {
    localStorage.removeItem('adminKey')
    setIsAdmin(false)
    refetch()
  }, [refetch])

  const handleDelete = useCallback((email: string) => {
    if (!confirm(`Delete account ${email}?`)) return
    deleteMutation.mutate(email, {
      onError: () => alert('Delete failed'),
    })
  }, [deleteMutation])

  const handleRefreshAll = useCallback(() => {
    refreshMutation.mutate(undefined, {
      onSuccess: (data) => alert(`Refreshed ${data.refreshed} token(s)`),
      onError: () => alert('Refresh failed'),
    })
  }, [refreshMutation])

  const handleWarmup = useCallback(() => {
    warmupMutation.mutate(undefined, {
      onSuccess: (data) => {
        const warmed = data.results.filter(r => r.warmedUp.length > 0)
        const skipped = data.results.filter(r => r.skipped.length > 0 && r.warmedUp.length === 0)
        alert(`Warmup complete!\nWarmed: ${warmed.length} account(s)\nSkipped: ${skipped.length} account(s)`)
      },
      onError: () => alert('Warmup failed'),
    })
  }, [warmupMutation])

  return (
    <div className="max-w-5xl w-full mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Antigravity Auth</h1>
          <p className="text-neutral-500 text-sm">Multi-account Google OAuth token management</p>
        </div>
        {actualIsAdmin && (
          <button
            className="px-3 py-1.5 text-xs font-medium rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors"
            onClick={handleLogout}
          >
            Logout
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 p-5 bg-neutral-900 rounded-lg border border-neutral-800">
          <div className="flex justify-between items-center mb-3">
            <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Accounts</div>
            {actualIsAdmin && (
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 text-xs font-medium rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors disabled:opacity-50"
                  onClick={handleRefreshAll}
                  disabled={refreshMutation.isPending}
                >
                  {refreshMutation.isPending ? 'Refreshing...' : 'Refresh All'}
                </button>
                <button
                  className="px-3 py-1.5 text-xs font-medium rounded bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50"
                  onClick={handleWarmup}
                  disabled={warmupMutation.isPending}
                >
                  {warmupMutation.isPending ? 'Warming...' : 'Warmup'}
                </button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 p-3 rounded-md text-sm bg-blue-500/10 border border-blue-500/30 text-blue-500">
              <span className="w-2 h-2 rounded-full bg-current" />
              <span>Loading...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-md text-sm bg-green-500/10 border border-green-500/30 text-green-500">
              <span className="w-2 h-2 rounded-full bg-current" />
              <span>{accounts.length} account(s) {actualIsAdmin ? 'configured' : 'available'}</span>
            </div>
          )}

          <div className="mt-4 max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent hover:scrollbar-thumb-neutral-600">
            {accounts.map((account) => (
              <AccountCard
                key={account.email}
                account={account}
                isAdmin={actualIsAdmin}
                onDelete={actualIsAdmin ? handleDelete : undefined}
              />
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {!isAdmin && <LoginForm onLogin={handleLogin} />}
          {actualIsAdmin && <AddAccountForm onSuccess={refetch} />}
        </div>
      </div>
    </div>
  )
}
