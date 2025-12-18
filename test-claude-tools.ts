import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const provider = createOpenAICompatible({
  name: 'antigravity',
  baseURL: 'https://antigravity-hono.dakunesu.workers.dev/v1',
})

const model = provider.chatModel('claude-opus-4-5')

async function main() {
  const result = await generateText({
    model,
    prompt: 'What is the weather in Tokyo?',
    tools: {
      getWeather: tool({
        description: 'Get weather for a location',
        parameters: z.object({
          location: z.string().describe('City name'),
        }),
      }),
    },
  })

  console.log('Result:', result.text)
  console.log('Tool calls:', JSON.stringify(result.toolCalls, null, 2))
}

main().catch(e => {
  console.error('Error:', e.message)
  if (e.responseBody) console.error('Response:', e.responseBody)
})
