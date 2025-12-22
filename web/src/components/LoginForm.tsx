import { useState, type ChangeEvent } from 'react'

type LoginFormProps = {
  onLogin: (key: string) => void
}

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [key, setKey] = useState('')

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => setKey(e.target.value)

  return (
    <div className="p-5 bg-neutral-900 rounded-lg border border-neutral-800">
      <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">Admin Login</div>
      <input
        type="password"
        value={key}
        onChange={handleChange}
        placeholder="Enter Admin Key"
        className="w-full px-3 py-3 rounded-md border border-neutral-700 bg-neutral-950 text-neutral-300 text-sm font-mono focus:outline-none focus:border-blue-500"
      />
      <button
        className="w-full mt-3 px-4 py-2.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        onClick={() => onLogin(key)}
      >
        Login
      </button>
    </div>
  )
}
