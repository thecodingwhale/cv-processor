import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai'
import { jsonrepair } from 'jsonrepair'
import { AIModelConfig, AIProvider, TokenUsageInfo } from '../types/AIProvider'
import { replaceUUIDv4Placeholders } from '../utils/data'

/**
 * Pricing information for Gemini models (USD per 1K tokens)
 */
interface ModelPricing {
  input: number
  output: number
}

const GEMINI_PRICING: Record<string, ModelPricing> = {
  // Gemini 2.5 models
  'gemini-2.5-flash': { input: 0.00015, output: 0.0006 },
  'gemini-2.5-pro': { input: 0.00125, output: 0.01 },

  // Gemini 2.0 models
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'gemini-2.0-flash-lite': { input: 0.000075, output: 0.0003 },

  // Gemini 1.5 models
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'gemini-1.5-flash-8b': { input: 0.0000375, output: 0.00015 },

  // Legacy models
  'gemini-pro': { input: 0.00125, output: 0.00375 },

  // Default fallback pricing (using Gemini 1.5 Pro as baseline)
  default: { input: 0.00125, output: 0.005 },
}

export class GeminiAIProvider implements AIProvider {
  private generativeModel: GenerativeModel
  private config: AIModelConfig

  constructor(config: AIModelConfig) {
    this.config = config
    const genAI = new GoogleGenerativeAI(config.apiKey)
    this.generativeModel = genAI.getGenerativeModel({
      model: config.model || 'gemini-1.5-pro',
      generationConfig: {
        temperature: config.temperature || 0,
        maxOutputTokens: config.maxTokens || 8192,
        topP: 1,
        topK: 50,
        candidateCount: 1,
      },
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
    const pricing = GEMINI_PRICING[model] || GEMINI_PRICING['default']

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
                
        Images
        ${imageUrls}

        Your response should be valid JSON that matches this schema.
      `

      const result = await this.generativeModel.generateContent(prompt)
      const response = await result.response
      const responseText = response.text()

      // Gemini API doesn't provide easy access to token counts like OpenAI
      // Use estimation instead
      const promptTokens = this.estimateTokenCount(prompt)
      const completionTokens = this.estimateTokenCount(responseText)
      const totalTokens = promptTokens + completionTokens

      // Calculate estimated cost
      const model = this.config.model || 'gemini-1.5-pro'
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
        console.error('Error parsing JSON from Gemini response:', jsonError)
        throw jsonError
      }
    } catch (error) {
      console.error('Error extracting structured data with Gemini AI:', error)
      throw error
    }
  }

  getModelInfo(): { provider: string; model: string } {
    return {
      provider: 'gemini',
      model: this.config.model || 'gemini-1.5-pro',
    }
  }
}
