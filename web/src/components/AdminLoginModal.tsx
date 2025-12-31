import { useState, useEffect, type ChangeEvent } from 'react'

type AdminLoginModalProps = {
  open: boolean
  loading?: boolean
  onClose: () => void
  onLogin: (key: string) => void
}

export const AdminLoginModal = ({ open, loading, onClose, onLogin }: AdminLoginModalProps) => {
  const [key, setKey] = useState('')

  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  useEffect(() => {
    if (!open) setKey('')
  }, [open])

  if (!open) return null

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => setKey(e.target.value)

  const handleSubmit = () => {
    const trimmedKey = key.trim()
    if (!trimmedKey || loading) return
    onLogin(trimmedKey)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm p-6 bg-neutral-900 rounded-lg border border-neutral-700 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-login-title"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="admin-login-title" className="text-lg font-semibold text-white">Admin Login</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-neutral-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <input
          type="password"
          value={key}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter Admin Key"
          autoFocus
          disabled={loading}
          className="w-full px-3 py-3 rounded-md border border-neutral-700 bg-neutral-950 text-neutral-300 text-sm font-mono focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />

        <button
          className="w-full mt-4 px-4 py-2.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          onClick={handleSubmit}
          disabled={!key.trim() || loading}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </div>
    </div>
  )
}
