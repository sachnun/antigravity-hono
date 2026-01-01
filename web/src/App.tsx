import { useCallback, useState } from 'react'
import { useAccounts, useDeleteAccount, useRefreshTokens, useWarmup } from '@/hooks/useAccounts'
import { AccountList } from '@/components/AccountList'
import { AccountListSkeleton } from '@/components/AccountListSkeleton'
import { AdminLoginModal } from '@/components/AdminLoginModal'
import { AddAccountForm } from '@/components/AddAccountForm'
import { Toaster, toast } from '@/components/Toast'

export const App = () => {
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const { data, isLoading, refetch } = useAccounts()

  const deleteMutation = useDeleteAccount()
  const refreshMutation = useRefreshTokens()
  const warmupMutation = useWarmup()

  const accounts = data?.accounts ?? []
  const isAdmin = data?.isAdmin ?? false

  const handleLogin = useCallback((key: string) => {
    setLoginLoading(true)
    localStorage.setItem('adminKey', key)
    refetch()
      .then((result) => {
        if (result.data?.isAdmin) {
          setLoginModalOpen(false)
        } else {
          localStorage.removeItem('adminKey')
          toast.error('Invalid admin key')
        }
      })
      .catch(() => {
        localStorage.removeItem('adminKey')
        toast.error('Login failed')
      })
      .finally(() => setLoginLoading(false))
  }, [refetch])

  const handleLogout = useCallback(() => {
    localStorage.removeItem('adminKey')
    refetch()
  }, [refetch])

  const handleDelete = useCallback((email: string) => {
    if (!confirm(`Delete account ${email}?`)) return
    deleteMutation.mutate(email, {
      onSuccess: () => toast.success('Account deleted'),
      onError: () => toast.error('Delete failed'),
    })
  }, [deleteMutation])

  const handleRefreshAll = useCallback(() => {
    refreshMutation.mutate(undefined, {
      onSuccess: (data) => toast.success(`Refreshed ${data.refreshed} token(s)`),
      onError: () => toast.error('Refresh failed'),
    })
  }, [refreshMutation])

  const handleWarmup = useCallback(() => {
    warmupMutation.mutate(undefined, {
      onSuccess: (data) => {
        const warmed = data.results.filter(r => r.warmedUp.length > 0)
        toast.success(`Warmed ${warmed.length} account(s)`)
      },
      onError: () => toast.error('Warmup failed'),
    })
  }, [warmupMutation])

  return (
    <>
      <div className="max-w-5xl w-full mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-white">Antigravity Auth</h1>
              <p className="text-neutral-500 text-sm">Multi-account Google OAuth token management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <button
                className="p-2 text-neutral-400 hover:text-white transition-colors"
                onClick={handleLogout}
                title="Logout"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            ) : (
              <button
                className="p-2 text-neutral-400 hover:text-white transition-colors"
                onClick={() => setLoginModalOpen(true)}
                title="Admin Login"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 p-5 bg-neutral-900 rounded-lg border border-neutral-800">
            <div className="flex justify-between items-center mb-3">
              <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Accounts</div>
              {isAdmin && (
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
              <AccountListSkeleton />
            ) : (
              <AccountList
                accounts={accounts}
                isAdmin={isAdmin}
                onDelete={handleDelete}
              />
            )}
          </div>

          <div className="lg:col-span-2 space-y-4">
            {isAdmin && <AddAccountForm onSuccess={refetch} />}
          </div>
        </div>
      </div>
      <AdminLoginModal
        open={loginModalOpen}
        loading={loginLoading}
        onClose={() => setLoginModalOpen(false)}
        onLogin={handleLogin}
      />
      <Toaster />
    </>
  )
}
