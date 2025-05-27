import { GoogleGenAI } from '@google/genai'
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
  private ai: GoogleGenAI
  private config: AIModelConfig

  constructor(config: AIModelConfig) {
    this.config = config
    this.ai = new GoogleGenAI({ apiKey: config.apiKey })
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

  /**
   * Convert image URLs to proper content parts for the new API
   */
  private async createImageParts(imageUrls: string[]): Promise<any[]> {
    const imageParts = []

    for (const imageUrl of imageUrls) {
      try {
        if (imageUrl.startsWith('data:image/')) {
          // Handle data URLs (base64-encoded images)
          const [mimeTypePart, base64Data] = imageUrl.split(',')
          const mimeType = mimeTypePart.split(':')[1].split(';')[0]

          imageParts.push({
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          })
        } else if (
          imageUrl.startsWith('http://') ||
          imageUrl.startsWith('https://')
        ) {
          // Handle web URLs by fetching and converting to base64
          const response = await fetch(imageUrl)
          if (!response.ok) {
            console.warn(
              `Failed to fetch image from ${imageUrl}: ${response.statusText}`
            )
            continue
          }

          const arrayBuffer = await response.arrayBuffer()
          const base64Data = Buffer.from(arrayBuffer).toString('base64')

          // Determine MIME type from response headers or URL extension
          let mimeType = response.headers.get('content-type') || 'image/jpeg'
          if (!mimeType.startsWith('image/')) {
            // Fallback based on URL extension
            if (imageUrl.toLowerCase().includes('.png')) {
              mimeType = 'image/png'
            } else if (imageUrl.toLowerCase().includes('.webp')) {
              mimeType = 'image/webp'
            } else {
              mimeType = 'image/jpeg'
            }
          }

          imageParts.push({
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          })
        } else if (imageUrl.startsWith('gs://')) {
          // Handle Google Cloud Storage URLs
          imageParts.push({
            fileData: {
              mimeType: 'image/jpeg', // Default, could be improved with better detection
              fileUri: imageUrl,
            },
          })
        } else {
          console.warn(`Unsupported image URL format: ${imageUrl}`)
        }
      } catch (error) {
        console.error(`Error processing image URL ${imageUrl}:`, error)
      }
    }

    return imageParts
  }

  async extractStructuredDataFromImages<T>(
    imageUrls: string[],
    dataSchema: object,
    instructions: string
  ): Promise<T & { tokenUsage?: TokenUsageInfo }> {
    try {
      const model = this.config.model || 'gemini-1.5-pro'

      // Create proper image content parts
      const imageParts = await this.createImageParts(imageUrls)

      if (imageParts.length === 0) {
        throw new Error(
          'No valid images could be processed from the provided URLs'
        )
      }

      // Create the content array with text and images
      const contents = [
        { text: instructions },
        {
          text: `Extract information according to this JSON schema: ${JSON.stringify(
            dataSchema,
            null,
            2
          )}`,
        },
        {
          text: 'Your response should be valid JSON that matches this schema.',
        },
        ...imageParts,
      ]

      // Set topK to 40 if using gemini-1.5-flash-8b model which has a limitation
      const topK = model === 'gemini-1.5-flash-8b' ? 40 : 50

      const result = await this.ai.models.generateContent({
        model: model,
        contents: contents,
        config: {
          temperature: this.config.temperature || 0,
          maxOutputTokens: this.config.maxTokens || 8192,
          topP: 1,
          topK: topK,
          candidateCount: 1,
        },
      })

      const responseText = result.text || ''

      // Estimate token usage (the new API doesn't provide easy access to token counts)
      const promptTokens =
        this.estimateTokenCount(instructions + JSON.stringify(dataSchema)) +
        imageParts.length * 258 // 258 tokens per image
      const completionTokens = this.estimateTokenCount(responseText)
      const totalTokens = promptTokens + completionTokens

      // Calculate estimated cost
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
        console.error('Error parsing JSON from Gemini response:', jsonError)
        throw jsonError
      }
    } catch (error) {
      console.error('Error extracting structured data with Gemini AI:', error)
      throw error
    }
  }

  async extractStructuredDataFromText<T>(
    texts: string[],
    dataSchema: object,
    instructions: string
  ): Promise<T & { tokenUsage?: TokenUsageInfo }> {
    try {
      const prompt = `
        ${instructions}
        
        Extract information from the following text according to this JSON schema:
        ${JSON.stringify(dataSchema, null, 2)}
        
        Your response should be valid JSON that matches this schema.

        Text content:
        ${texts.join('\n\n')}
      `

      const model = this.config.model || 'gemini-1.5-pro'

      // Set topK to 40 if using gemini-1.5-flash-8b model which has a limitation
      const topK = model === 'gemini-1.5-flash-8b' ? 40 : 50

      const result = await this.ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          temperature: this.config.temperature || 0,
          maxOutputTokens: this.config.maxTokens || 8192,
          topP: 1,
          topK: topK,
          candidateCount: 1,
        },
      })

      const responseText = result.text || ''

      // Estimate token usage
      const promptTokens = this.estimateTokenCount(prompt)
      const completionTokens = this.estimateTokenCount(responseText)
      const totalTokens = promptTokens + completionTokens

      // Calculate estimated cost
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
