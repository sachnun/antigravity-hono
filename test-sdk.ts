import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const provider = createOpenAICompatible({
  name: 'antigravity',
  baseURL: 'https://antigravity-hono.dakunesu.workers.dev/v1',
  headers: {
    Authorization: `Bearer ${Bun.env.ANTIGRAVITY_API_KEY}`,
  },
})

const model = provider.chatModel('gemini-2.5-flash')

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
        execute: async ({ location }: { location: string }) => {
          return { temperature: 25, condition: 'sunny', location }
        },
      }),
    },
  })

  console.log('Result:', result.text)
  console.log('Tool calls:', result.toolCalls)
  console.log('Tool results:', result.toolResults)
}

main().catch(console.error)
