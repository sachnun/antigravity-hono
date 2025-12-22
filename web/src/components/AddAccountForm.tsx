import { useState, type ChangeEvent } from 'react'
import { generateAuthUrl, exchangeToken } from '@/lib/api'

type AddAccountFormProps = {
  onSuccess: () => void
}

export const AddAccountForm = ({ onSuccess }: AddAccountFormProps) => {
  const [authUrl, setAuthUrl] = useState('')
  const [generating, setGenerating] = useState(false)
  const [callbackUrl, setCallbackUrl] = useState('')
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleGenerateAuthUrl = async () => {
    setGenerating(true)
    try {
      const data = await generateAuthUrl()
      setAuthUrl(data.url)
    } catch {
      setResult({ type: 'error', message: 'Failed to generate URL' })
    }
    setGenerating(false)
  }

  const handleExchangeToken = async () => {
    if (!callbackUrl.trim()) {
      setResult({ type: 'error', message: 'Please paste the callback URL' })
      return
    }

    setResult(null)
    try {
      const data = await exchangeToken(callbackUrl)
      setResult({ type: 'success', message: `Added: ${data.email}` })
      setCallbackUrl('')
      setAuthUrl('')
      onSuccess()
    } catch (e) {
      setResult({ type: 'error', message: `Error: ${(e as Error).message}` })
    }
  }

  const handleCallbackChange = (e: ChangeEvent<HTMLTextAreaElement>) => setCallbackUrl(e.target.value)

  return (
    <div className="p-5 bg-neutral-900 rounded-lg border border-neutral-800 h-fit lg:sticky lg:top-6">
      <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-4">Add Account</div>

      <div className="flex gap-3 mb-4">
        <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0">
          1
        </div>
        <div className="flex-1">
          <p className="text-neutral-400 text-sm mb-2">Generate OAuth URL</p>
          <button
            className="w-full px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            onClick={handleGenerateAuthUrl}
            disabled={generating || !!authUrl}
          >
            {generating ? 'Generating...' : authUrl ? 'URL Generated' : 'Generate Auth URL'}
          </button>
          {authUrl && (
            <>
              <div className="mt-2 p-2 bg-neutral-950 border border-neutral-700 rounded-md font-mono text-xs break-all max-h-20 overflow-y-auto">
                {authUrl}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  className="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors"
                  onClick={() => navigator.clipboard.writeText(authUrl)}
                >
                  Copy
                </button>
                <button
                  className="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  onClick={() => window.open(authUrl, '_blank')}
                >
                  Open
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0">
          2
        </div>
        <div className="flex-1">
          <p className="text-neutral-400 text-sm mb-2">Paste callback URL</p>
          <textarea
            value={callbackUrl}
            onChange={handleCallbackChange}
            placeholder="http://localhost:9999/?state=...&code=..."
            className="w-full px-3 py-2 rounded-md border border-neutral-700 bg-neutral-950 text-neutral-300 text-sm font-mono focus:outline-none focus:border-blue-500 resize-y min-h-16"
          />
          <button
            className="w-full mt-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            onClick={handleExchangeToken}
          >
            Add Account
          </button>
          {result && (
            <div className={`text-sm mt-2 ${result.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
              {result.message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
