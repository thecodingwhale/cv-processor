import { jsonrepair } from 'jsonrepair'
import { OpenAI } from 'openai'
import { AIModelConfig, AIProvider, TokenUsageInfo } from '../types/AIProvider'
import { replaceUUIDv4Placeholders } from '../utils/data'

export interface GrokAIConfig extends AIModelConfig {
  // No additional config needed beyond apiKey and model
}

export class GrokAIProvider implements AIProvider {
  private client: OpenAI
  private config: GrokAIConfig

  constructor(config: GrokAIConfig) {
    this.config = config

    console.log(
      `[GrokAIProvider] Initializing with model: ${
        config.model || 'grok-2-vision-1212'
      }`
    )

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://api.x.ai/v1',
    })
  }

  async extractStructuredData<T>(
    imageUrls: string[],
    dataSchema: object,
    instructions: string
  ): Promise<T & { tokenUsage?: TokenUsageInfo }> {
    try {
      const prompt = `
        ${instructions}
        Extract information from the following document according to this JSON schema:
        ${JSON.stringify(dataSchema, null, 2)}
        Your response should be valid JSON that matches this schema.
      `

      // Check if the model supports vision capabilities
      const modelName = this.config.model || 'grok-2-vision-1212'

      // Create messages with the images
      const messages = [
        {
          role: 'system' as const,
          content: prompt,
        },
        {
          role: 'user' as const,
          content: [
            {
              type: 'text' as const,
              text: 'Please analyze this document:',
            },
            ...imageUrls.map((imageUrl) => ({
              type: 'image_url' as const,
              image_url: {
                url: imageUrl,
              },
            })),
          ],
        },
      ]

      const completion = await this.client.chat.completions.create({
        model: modelName,
        messages: messages,
        response_format: { type: 'json_object' },
      })

      const responseText = completion.choices[0]?.message?.content || '{}'

      try {
        let fixedJson
        try {
          fixedJson = jsonrepair(responseText)
        } catch (err) {
          console.error('❌ Could not repair JSON:', err)
          throw new Error(`AI returned invalid JSON: ${err}`)
        }
        const parsedJson = JSON.parse(fixedJson)
        return {
          ...replaceUUIDv4Placeholders(parsedJson),
        }
      } catch (jsonError) {
        console.error('Error parsing JSON from OpenAI response:', jsonError)
        throw jsonError
      }
    } catch (error) {
      console.error('Error extracting structured data with Grok AI:', error)
      throw error
    }
  }

  getModelInfo(): { provider: string; model: string } {
    return {
      provider: 'grok',
      model: this.config.model || 'grok-2-vision-1212',
    }
  }
}
