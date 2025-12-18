import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, streamText, tool } from 'ai'
import { z } from 'zod'

const BASE_URL = 'http://localhost:8787'

const refreshToken = '1//0ge-S31hhLucQCgYIARAAGBASNwF-L9IrlFn6xpOh4PCjDvdbDBQsHUQb7DYHE3i0WCjj65A7762kUWeJne5nKfT4KiJCXJzya_M|upheld-leaf-1sf6z|upheld-leaf-1sf6z'
const accessToken = 'ya29.a0Aa7pCA_W0woAjl_alIXHUO0XTAeuyis2xyCVv9qFohC3E6etwAC5-cPbXf0oNglp-3wbOfghWdJj30Tz2YCPck5v0eOKE7tLBhLV-Fu9XPY__3Xoy0VRhswbo8DFeQMyGPSGOTviHD1tXLfoMu9BLv-MZ06-HjqDf33nSGSYuYUaQyVlkT3stpiSx0BLfTf0A4DIZSAibpdipAaCgYKAf0SARASFQHGX2Mi50vsi9MXRq_eZ3wSAHU6ig0213'
const projectId = 'upheld-leaf-1sf6z'

async function setupToken() {
  console.log('Setting up token...')
  const res = await fetch(`${BASE_URL}/admin/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refreshToken,
      accessToken,
      projectId,
      email: 'test@example.com',
      expiresAt: 1766026646897,
    }),
  })
  const data = await res.json()
  console.log('Token setup result:', data)
  return res.ok
}

async function testGenerateText() {
  console.log('\n=== Test 1: generateText (basic) ===')
  
  const provider = createOpenAICompatible({
    name: 'antigravity',
    baseURL: `${BASE_URL}/v1`,
  })

  const model = provider.chatModel('claude-sonnet-4-5')

  const result = await generateText({
    model,
    prompt: 'Say "Hello World" in 3 different languages. Be brief.',
  })

  console.log('Response:', result.text)
  console.log('Usage:', result.usage)
  console.log('Finish reason:', result.finishReason)
}

async function testStreamText() {
  console.log('\n=== Test 2: streamText ===')
  
  const provider = createOpenAICompatible({
    name: 'antigravity',
    baseURL: `${BASE_URL}/v1`,
  })

  const model = provider.chatModel('claude-sonnet-4-5')

  const result = streamText({
    model,
    prompt: 'Count from 1 to 5 slowly.',
  })

  let streamedText = ''
  for await (const chunk of result.textStream) {
    streamedText += chunk
    Bun.write(Bun.stdout, chunk)
  }
  console.log('\n')
  
  const finalResult = await result
  console.log('Usage:', finalResult.usage)
  console.log('Finish reason:', finalResult.finishReason)
}

async function testToolCalling() {
  console.log('\n=== Test 3: Tool Calling ===')
  
  const provider = createOpenAICompatible({
    name: 'antigravity',
    baseURL: `${BASE_URL}/v1`,
  })

  const model = provider.chatModel('claude-sonnet-4-5')

  const result = await generateText({
    model,
    prompt: 'What is the weather in Tokyo?',
    tools: {
      getWeather: tool({
        description: 'Get weather for a location',
        parameters: z.object({
          location: z.string().describe('City name'),
          unit: z.enum(['celsius', 'fahrenheit']).optional().describe('Temperature unit'),
        }),
        execute: async ({ location, unit }: { location: string; unit?: string }) => {
          console.log(`Tool called with location: ${location}, unit: ${unit}`)
          return { temperature: 25, condition: 'sunny', location, unit: unit ?? 'celsius' }
        },
      }),
    },
    maxSteps: 3,
  })

  console.log('Final response:', result.text)
  console.log('Tool calls:', result.toolCalls)
  console.log('Tool results:', result.toolResults)
}

async function testModelsEndpoint() {
  console.log('\n=== Test 4: List Models ===')
  
  const res = await fetch(`${BASE_URL}/v1/models`)
  const data = await res.json()
  console.log('Models:', JSON.stringify(data, null, 2))
}

async function main() {
  try {
    await setupToken()
    await testModelsEndpoint()
    await testGenerateText()
    await testStreamText()
    await testToolCalling()
    
    console.log('\n✅ All tests passed!')
  } catch (error) {
    console.error('\n❌ Test failed:', error)
  }
}

main()
