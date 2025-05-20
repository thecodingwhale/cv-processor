import { jsonrepair } from 'jsonrepair'
import { AzureOpenAI } from 'openai'
import { AIModelConfig, AIProvider, TokenUsageInfo } from '../types/AIProvider'
import { replaceUUIDv4Placeholders } from '../utils/data'

export interface AzureOpenAIConfig extends AIModelConfig {
  endpoint: string
  apiVersion?: string
  deploymentName?: string
}

/**
 * Pricing information for Azure OpenAI models (USD per 1K tokens)
 * These are similar to OpenAI prices, but can vary based on Azure pricing tiers
 */
interface ModelPricing {
  input: number
  output: number
}

const AZURE_OPENAI_PRICING: Record<string, ModelPricing> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4.1-mini': { input: 0.0006, output: 0.0024 },
  'gpt-4.1-nano': { input: 0.0001, output: 0.0004 },
  'gpt-3.5-turbo': { input: 0.002, output: 0.006 },
  // Add more models as needed
  default: { input: 0.002, output: 0.008 }, // Default fallback pricing
}

export class AzureOpenAIProvider implements AIProvider {
  private client: AzureOpenAI
  private config: AzureOpenAIConfig

  constructor(config: AzureOpenAIConfig) {
    this.config = config

    // Make sure we have a deployment name
    if (!config.deploymentName) {
      console.warn(
        `[AzureOpenAIProvider] No deploymentName provided, using model name "${config.model}" as the deployment name`
      )
    }

    const deploymentName = config.deploymentName || config.model
    console.log(`[AzureOpenAIProvider] Using deployment: ${deploymentName}`)

    // Initialize Azure OpenAI client according to documentation
    this.client = new AzureOpenAI({
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      apiVersion: config.apiVersion || '2024-04-01-preview',
      deployment: deploymentName,
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
    // First try to match by specific model name
    let pricing = AZURE_OPENAI_PRICING[model]

    // If not found, try to match by partial model name
    if (!pricing) {
      const matchingKey = Object.keys(AZURE_OPENAI_PRICING).find((key) =>
        model.toLowerCase().includes(key.toLowerCase())
      )
      pricing = matchingKey
        ? AZURE_OPENAI_PRICING[matchingKey]
        : AZURE_OPENAI_PRICING['default']
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

      let completion

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

      // Create request parameters for vision model
      const requestParams = {
        messages: messages,
        model: 'gpt-4.1', // Required by OpenAI SDK but ignored by Azure
        // max_completion_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0,

        // max_tokens: this.config.maxTokens || 4096,
        // response_format: { type: 'json_object' },
        // response_format: { type: 'json_object' },
      }

      completion = await this.client.chat.completions.create(requestParams)

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
      const model = this.config.deploymentName || this.config.model || 'gpt-4.1'
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
      console.error(
        'Error extracting structured data with Azure OpenAI:',
        error
      )
      throw error
    }
  }

  getModelInfo(): { provider: string; model: string } {
    return {
      provider: 'azure',
      model: this.config.deploymentName || this.config.model,
    }
  }
}
