import { jsonrepair } from 'jsonrepair'
import { OpenAI } from 'openai'
import { AIModelConfig, AIProvider, TokenUsageInfo } from '../types/AIProvider'
import { replaceUUIDv4Placeholders } from '../utils/data'

/**
 * Pricing information for OpenAI models (USD per 1K tokens)
 */
interface ModelPricing {
  input: number
  output: number
}

const OPENAI_PRICING: Record<string, ModelPricing> = {
  'gpt-4o-2024-11-20': { input: 0.0025, output: 0.01 },
  'gpt-4o-2024-08-06': { input: 0.0025, output: 0.01 },
  'gpt-4o-2024-05-13': { input: 0.0025, output: 0.01 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4.5-preview': { input: 0.075, output: 0.15 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
  'gpt-4.1-nano': { input: 0.0001, output: 0.0004 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  o3: { input: 0.01, output: 0.04 },
  'o3-mini': { input: 0.0011, output: 0.0044 },
  'o4-mini': { input: 0.0011, output: 0.0044 },
  o1: { input: 0.015, output: 0.06 },
  'o1-mini': { input: 0.0011, output: 0.0044 },
  // Default
  default: { input: 0.0025, output: 0.01 }, // Default fallback pricing
}

export class OpenAIProvider implements AIProvider {
  private openai: OpenAI
  private config: AIModelConfig

  constructor(config: AIModelConfig) {
    this.config = config
    this.openai = new OpenAI({
      apiKey: config.apiKey,
    })
  }

  /**
   * Calculate estimated cost based on token usage and model
   */
  private calculateCost(
    promptTokens: number,
    completionTokens: number,
    model: string
  ): number {
    const pricing = OPENAI_PRICING[model] || OPENAI_PRICING['default']

    const inputCost = (promptTokens / 1000) * pricing.input
    const outputCost = (completionTokens / 1000) * pricing.output

    return inputCost + outputCost
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
        temperature: this.config.temperature || 0,
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

      // Extract token usage information
      const promptTokens = completion.usage?.prompt_tokens || 0
      const completionTokens = completion.usage?.completion_tokens || 0
      const totalTokens = completion.usage?.total_tokens || 0

      // Calculate estimated cost
      const model = this.config.model || 'gpt-4o'
      const estimatedCost = this.calculateCost(
        promptTokens,
        completionTokens,
        model
      )

      // Create token usage object
      const tokenUsage: TokenUsageInfo = {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCost,
      }

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
          tokenUsage,
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
