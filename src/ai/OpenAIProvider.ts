import { jsonrepair } from 'jsonrepair'
import { OpenAI } from 'openai'
import { AIModelConfig, AIProvider, TokenUsageInfo } from '../types/AIProvider'
import { replaceUUIDv4Placeholders } from '../utils/data'

export class OpenAIProvider implements AIProvider {
  private openai: OpenAI
  private config: AIModelConfig

  constructor(config: AIModelConfig) {
    this.config = config
    this.openai = new OpenAI({
      apiKey: config.apiKey,
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
        Extract information from the following text according to this JSON schema:
        ${JSON.stringify(dataSchema, null, 2)}
        Your response should be valid JSON that matches this schema.
      `

      const completion = await this.openai.chat.completions.create({
        model: this.config.model || 'gpt-4o',
        temperature: this.config.temperature || 0.2,
        max_tokens: this.config.maxTokens || 4096,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: prompt,
          },
          {
            role: 'user',
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
        ],
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
      console.error('Error extracting structured data with OpenAI:', error)
      throw error
    }
  }

  getModelInfo(): { provider: string; model: string } {
    return {
      provider: 'openai',
      model: this.config.model || 'gpt-4o',
    }
  }
}
