import { useState, useEffect, useCallback } from 'react'

type ToastType = 'success' | 'error'

type Toast = {
  id: number
  message: string
  type: ToastType
}

let toastId = 0
const listeners: Set<(t: Toast) => void> = new Set()

export const toast = {
  success: (message: string) => listeners.forEach((fn) => fn({ id: ++toastId, message, type: 'success' })),
  error: (message: string) => listeners.forEach((fn) => fn({ id: ++toastId, message, type: 'error' })),
}

export const Toaster = () => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const add = useCallback((t: Toast) => {
    setToasts((prev) => [...prev, t])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3000)
  }, [])

  useEffect(() => {
    listeners.add(add)
    return () => { listeners.delete(add) }
  }, [add])

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2.5 rounded-md text-sm font-medium shadow-lg ${
            t.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
