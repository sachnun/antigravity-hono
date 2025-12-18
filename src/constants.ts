export const ANTIGRAVITY_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com'
export const ANTIGRAVITY_CLIENT_SECRET = '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'
export const ANTIGRAVITY_REDIRECT_URI = 'http://localhost:36742/oauth-callback'

export const ANTIGRAVITY_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
] as const

export const ANTIGRAVITY_USER_AGENT = 'antigravity/1.11.5 windows/amd64'
export const ANTIGRAVITY_API_CLIENT = 'google-cloud-sdk vscode_cloudshelleditor/0.1'
export const ANTIGRAVITY_CLIENT_METADATA = '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}'

export const CODE_ASSIST_ENDPOINT_DAILY = 'https://daily-cloudcode-pa.sandbox.googleapis.com'
export const CODE_ASSIST_ENDPOINT_AUTOPUSH = 'https://autopush-cloudcode-pa.sandbox.googleapis.com'
export const CODE_ASSIST_ENDPOINT_PROD = 'https://cloudcode-pa.googleapis.com'

export const CODE_ASSIST_ENDPOINT_FALLBACKS = [
  CODE_ASSIST_ENDPOINT_DAILY,
  CODE_ASSIST_ENDPOINT_AUTOPUSH,
  CODE_ASSIST_ENDPOINT_PROD,
] as const

export const CODE_ASSIST_ENDPOINT = CODE_ASSIST_ENDPOINT_DAILY

export const CODE_ASSIST_HEADERS = {
  'User-Agent': ANTIGRAVITY_USER_AGENT,
  'X-Goog-Api-Client': ANTIGRAVITY_API_CLIENT,
  'Client-Metadata': ANTIGRAVITY_CLIENT_METADATA,
} as const

export const SEARCH_MODEL = 'gemini-2.5-flash'
export const SEARCH_THINKING_BUDGET_FAST = 4096
export const SEARCH_THINKING_BUDGET_DEEP = 16384
export const SEARCH_TIMEOUT_MS = 60 * 1000

export const QUOTA_GROUPS: Record<string, string[]> = {
  claude: [
    'claude-sonnet-4-5',
    'claude-sonnet-4-5-thinking',
    'claude-opus-4-5',
    'claude-opus-4-5-thinking',
    'gpt-oss-120b-medium',
  ],
  'gemini-3-pro': [
    'gemini-3-pro-high',
    'gemini-3-pro-low',
    'gemini-3-pro-preview',
  ],
  'gemini-2.5-flash': [
    'gemini-2.5-flash',
    'gemini-2.5-flash-thinking',
    'gemini-2.5-flash-lite',
  ],
}

export const GROUP_DISPLAY_NAMES: Record<string, string> = {
  claude: 'Claude / GPT-OSS',
  'gemini-3-pro': 'Gemini 3 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
}

export const MODEL_TO_GROUP: Record<string, string> = Object.entries(QUOTA_GROUPS).reduce(
  (acc, [group, models]) => {
    for (const model of models) {
      acc[model] = group
    }
    return acc
  },
  {} as Record<string, string>
)
