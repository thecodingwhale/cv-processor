import { jsonrepair } from 'jsonrepair'
import { OpenAI } from 'openai'
import { AIModelConfig, AIProvider, TokenUsageInfo } from '../types/AIProvider'
import { replaceUUIDv4Placeholders } from '../utils/data'

export interface GrokAIConfig extends AIModelConfig {
  // No additional config needed beyond apiKey and model
}

/**
 * Pricing information for Grok AI models (USD per 1K tokens)
 */
interface ModelPricing {
  input: number
  output: number
}

const GROK_AI_PRICING: Record<string, ModelPricing> = {
  'grok-3': { input: 0.003, output: 0.015 },
  'grok-2-vision-1212': { input: 0.002, output: 0.01 },
  'grok-2': { input: 0.002, output: 0.01 },
  'grok-1': { input: 0.0001, output: 0.0002 }, // Older model with lower pricing
  // Default
  default: { input: 0.002, output: 0.01 },
}

/**
 * Models that support structured output (response_format)
 */
const MODELS_WITH_STRUCTURED_OUTPUT = [
  'grok-2-vision-1212',
  'grok-2',
  'grok-beta',
  'grok-vision-beta',
]

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

  /**
   * Check if the current model supports structured output
   */
  private supportsStructuredOutput(model: string): boolean {
    return MODELS_WITH_STRUCTURED_OUTPUT.some((supportedModel) =>
      model.toLowerCase().includes(supportedModel.toLowerCase())
    )
  }

  /**
   * Calculate estimated cost based on token usage and model
   */
  private calculateCost(
    promptTokens: number,
    completionTokens: number,
    model: string
  ): number {
    // First try to match by specific model name
    let pricing = GROK_AI_PRICING[model]

    // If not found, try to match by partial model name
    if (!pricing) {
      const matchingKey = Object.keys(GROK_AI_PRICING).find((key) =>
        model.toLowerCase().includes(key.toLowerCase())
      )
      pricing = matchingKey
        ? GROK_AI_PRICING[matchingKey]
        : GROK_AI_PRICING['default']
    }

    const inputCost = (promptTokens / 1000) * pricing.input
    const outputCost = (completionTokens / 1000) * pricing.output

    return inputCost + outputCost
  }

  /**
   * Estimate token count based on text content
   */
  private estimateTokenCount(text: string): number {
    // Simple estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4)
  }

  async extractStructuredDataFromImages<T>(
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

      // Prepare the completion request
      const completionRequest: any = {
        model: modelName,
        messages: messages,
      }

      // Only add response_format if the model supports it
      if (this.supportsStructuredOutput(modelName)) {
        completionRequest.response_format = { type: 'json_object' }
      }

      const completion = await this.client.chat.completions.create(
        completionRequest
      )

      const responseText = completion.choices[0]?.message?.content || '{}'

      // Extract token usage information
      const promptTokens =
        completion.usage?.prompt_tokens ||
        this.estimateTokenCount(prompt + JSON.stringify(imageUrls))
      const completionTokens =
        completion.usage?.completion_tokens ||
        this.estimateTokenCount(responseText)
      const totalTokens =
        completion.usage?.total_tokens || promptTokens + completionTokens

      // Calculate estimated cost
      const estimatedCost = this.calculateCost(
        promptTokens,
        completionTokens,
        modelName
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
          try {
            fixedJson = jsonrepair(responseText)
          } catch (err) {
            console.error('❌ Could not repair JSON:', err)
            throw new Error(`AI returned invalid JSON: ${err}`)
          }
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
      console.error('Error extracting structured data with Grok AI:', error)
      throw error
    }
  }

  async extractStructuredDataFromText<T>(
    texts: string[],
    dataSchema: object,
    instructions: string
  ): Promise<T & { tokenUsage?: TokenUsageInfo }> {
    try {
      const modelName = this.config.model || 'grok-2-vision-1212'

      const prompt = `
        ${instructions}
        Extract information from the following text according to this JSON schema:
        ${JSON.stringify(dataSchema, null, 2)}
        Your response should be valid JSON that matches this schema.

        Text content:
        ${texts.join('\n\n')}
      `

      // Prepare the completion request
      const completionRequest: any = {
        model: modelName,
        messages: [
          {
            role: 'system',
            content: prompt,
          },
        ],
      }

      // Only add response_format if the model supports it
      if (this.supportsStructuredOutput(modelName)) {
        completionRequest.response_format = { type: 'json_object' }
      }

      const completion = await this.client.chat.completions.create(
        completionRequest
      )

      const responseText = completion.choices[0]?.message?.content || '{}'

      // Extract token usage information
      const promptTokens =
        completion.usage?.prompt_tokens || this.estimateTokenCount(prompt)
      const completionTokens =
        completion.usage?.completion_tokens ||
        this.estimateTokenCount(responseText)
      const totalTokens =
        completion.usage?.total_tokens || promptTokens + completionTokens

      // Calculate estimated cost
      const estimatedCost = this.calculateCost(
        promptTokens,
        completionTokens,
        modelName
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
        console.error('Error parsing JSON from Grok AI response:', jsonError)
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
