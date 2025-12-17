import {
  CODE_ASSIST_ENDPOINT,
  CODE_ASSIST_HEADERS,
  SEARCH_MODEL,
  SEARCH_THINKING_BUDGET_DEEP,
  SEARCH_THINKING_BUDGET_FAST,
  SEARCH_TIMEOUT_MS,
} from './constants'

interface GroundingChunk {
  web?: { uri?: string; title?: string }
}

interface UrlMetadata {
  retrieved_url?: string
  url_retrieval_status?: string
}

interface SearchApiResponse {
  response?: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }>; role?: string }
      finishReason?: string
      groundingMetadata?: {
        webSearchQueries?: string[]
        groundingChunks?: GroundingChunk[]
      }
      urlContextMetadata?: { url_metadata?: UrlMetadata[] }
    }>
    error?: { code?: number; message?: string; status?: string }
  }
  error?: { code?: number; message?: string; status?: string }
}

export interface SearchArgs {
  query: string
  urls?: string[]
  thinking?: boolean
}

export interface SearchResult {
  text: string
  sources: Array<{ title: string; url: string }>
  searchQueries: string[]
  urlsRetrieved: Array<{ url: string; status: string }>
}

const SEARCH_SYSTEM_INSTRUCTION = `You are an expert web search assistant with access to Google Search and URL analysis tools.

Your capabilities:
- Use google_search to find real-time information from the web
- Use url_context to fetch and analyze content from specific URLs when provided

Guidelines:
- Always provide accurate, well-sourced information
- Cite your sources when presenting facts
- If analyzing URLs, extract the most relevant information
- Be concise but comprehensive in your responses
- If information is uncertain or conflicting, acknowledge it
- Focus on answering the user's question directly`

function generateRequestId(): string {
  return crypto.randomUUID()
}

function parseSearchResponse(data: SearchApiResponse): SearchResult {
  const result: SearchResult = {
    text: '',
    sources: [],
    searchQueries: [],
    urlsRetrieved: [],
  }

  const response = data.response
  if (!response?.candidates?.length) {
    if (data.error) {
      result.text = `Error: ${data.error.message ?? 'Unknown error'}`
    } else if (response?.error) {
      result.text = `Error: ${response.error.message ?? 'Unknown error'}`
    }
    return result
  }

  const candidate = response.candidates[0]
  if (!candidate) return result

  if (candidate.content?.parts) {
    result.text = candidate.content.parts
      .map((p) => p.text ?? '')
      .filter(Boolean)
      .join('\n')
  }

  if (candidate.groundingMetadata) {
    const gm = candidate.groundingMetadata
    if (gm.webSearchQueries) {
      result.searchQueries = gm.webSearchQueries
    }
    if (gm.groundingChunks) {
      for (const chunk of gm.groundingChunks) {
        if (chunk.web?.uri && chunk.web?.title) {
          result.sources.push({ title: chunk.web.title, url: chunk.web.uri })
        }
      }
    }
  }

  if (candidate.urlContextMetadata?.url_metadata) {
    for (const meta of candidate.urlContextMetadata.url_metadata) {
      if (meta.retrieved_url) {
        result.urlsRetrieved.push({
          url: meta.retrieved_url,
          status: meta.url_retrieval_status ?? 'UNKNOWN',
        })
      }
    }
  }

  return result
}

export async function executeSearch(
  args: SearchArgs,
  accessToken: string,
  projectId: string
): Promise<SearchResult> {
  const { query, urls, thinking = true } = args

  let prompt = query
  if (urls?.length) {
    const urlList = urls.join('\n')
    prompt = `${query}\n\nURLs to analyze:\n${urlList}`
  }

  const tools: Array<Record<string, unknown>> = [{ googleSearch: {} }]
  if (urls?.length) {
    tools.push({ urlContext: {} })
  }

  const thinkingBudget = thinking ? SEARCH_THINKING_BUDGET_DEEP : SEARCH_THINKING_BUDGET_FAST

  const requestPayload = {
    systemInstruction: { parts: [{ text: SEARCH_SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools,
    generationConfig: {
      thinkingConfig: { thinkingBudget, includeThoughts: false },
    },
  }

  const wrappedBody = {
    project: projectId,
    model: SEARCH_MODEL,
    userAgent: 'antigravity',
    requestId: generateRequestId(),
    request: { ...requestPayload, sessionId: generateRequestId() },
  }

  const url = `${CODE_ASSIST_ENDPOINT}/v1internal:generateContent`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...CODE_ASSIST_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(wrappedBody),
    signal: controller.signal,
  })

  clearTimeout(timeoutId)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Search API error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const data = await response.json() as SearchApiResponse
  return parseSearchResponse(data)
}
