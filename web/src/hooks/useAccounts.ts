import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchAccounts, deleteAccount, refreshAllTokens, warmupAccounts } from '@/lib/api'

export const useAccounts = () => {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
    refetchInterval: 10000,
  })
}

export const useDeleteAccount = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export const useRefreshTokens = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: refreshAllTokens,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export const useWarmup = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: warmupAccounts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}
