import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { jsonrepair } from 'jsonrepair'
import { AIModelConfig, AIProvider, TokenUsageInfo } from '../types/AIProvider'
import { replaceUUIDv4Placeholders } from '../utils/data'
import { transformCredits } from '../utils/filtering'

export interface AWSBedrockConfig extends Omit<AIModelConfig, 'apiKey'> {
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  apiKey?: string
}

/**
 * Pricing information for AWS Bedrock models (USD per 1K tokens)
 */
interface ModelPricing {
  input: number
  output: number
}

const AWS_BEDROCK_PRICING: Record<string, ModelPricing> = {
  // Amazon models
  'apac.amazon.nova-micro-v1:0': { input: 0.000035, output: 0.00014 },
  'apac.amazon.nova-lite-v1:0': { input: 0.00006, output: 0.00024 },
  'apac.amazon.nova-v1:0': { input: 0.0008, output: 0.0032 },
  'apac.amazon.nova-v1-premium:0': { input: 0.001, output: 0.004 },
  'apac.amazon.nova-premier-v1:0': { input: 0.0025, output: 0.0125 },
  // Default
  default: { input: 0.00006, output: 0.00024 },
}

export class AWSBedrockProvider implements AIProvider {
  private client: BedrockRuntimeClient
  private config: AWSBedrockConfig

  constructor(config: AWSBedrockConfig) {
    this.config = config

    console.log(
      `[AWSBedrockProvider] Initializing with model: ${
        config.model || 'apac.amazon.nova-micro-v1:0'
      }`
    )

    // Allow more flexible authentication methods
    const credentials: any = {}

    // Option 1: Use accessKeyId and secretAccessKey from config if provided
    if (config.accessKeyId && config.secretAccessKey) {
      console.log('[AWSBedrockProvider] Using credentials from config')
      credentials.accessKeyId = config.accessKeyId
      credentials.secretAccessKey = config.secretAccessKey
    }
    // Option 2: Use environment variables if available
    else if (
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY
    ) {
      console.log(
        '[AWSBedrockProvider] Using credentials from environment variables'
      )
      credentials.accessKeyId = process.env.AWS_ACCESS_KEY_ID
      credentials.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
    }
    // Option 3: Use general apiKey if provided (for compatibility with the common interface)
    else if (config.apiKey) {
      console.log('[AWSBedrockProvider] Using apiKey as accessKeyId')
      credentials.accessKeyId = config.apiKey
      // Try to use AWS_SECRET_ACCESS_KEY from environment if available
      credentials.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || ''
    }
    // Option 4: Let AWS SDK handle credentials from ~/.aws/credentials
    else {
      console.log(
        '[AWSBedrockProvider] No explicit credentials provided, using default AWS profile'
      )
    }

    const awsConfig = {
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      credentials:
        Object.keys(credentials).length > 0 ? credentials : undefined,
    }

    this.client = new BedrockRuntimeClient(awsConfig)
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
    let pricing = AWS_BEDROCK_PRICING[model]

    // If not found, try to match by partial model name
    if (!pricing) {
      const matchingKey = Object.keys(AWS_BEDROCK_PRICING).find((key) =>
        model.toLowerCase().includes(key.toLowerCase())
      )
      pricing = matchingKey
        ? AWS_BEDROCK_PRICING[matchingKey]
        : AWS_BEDROCK_PRICING['default']
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

  /**
   * Extract all searchable terms from categories (names + keywords)
   */
  private extractCategoryTerms(categories?: object[]): string[] {
    if (!categories || categories.length === 0) {
      return []
    }

    const terms: string[] = []

    for (const category of categories) {
      const cat = category as any

      // Add category name if it exists
      if (cat.name && typeof cat.name === 'string') {
        terms.push(cat.name.toLowerCase())
      }

      // Add keywords if they exist
      if (cat.keywords && Array.isArray(cat.keywords)) {
        for (const keyword of cat.keywords) {
          if (typeof keyword === 'string') {
            terms.push(keyword.toLowerCase())
          }
        }
      }
    }

    return terms
  }

  /**
   * Check if text contains any category-related terms (case-insensitive, substring matching)
   */
  private textMatchesCategories(
    text: string,
    categoryTerms: string[]
  ): boolean {
    if (categoryTerms.length === 0) {
      return true // If no categories provided, include all texts
    }

    const lowerText = text.toLowerCase()

    return categoryTerms.some((term) => lowerText.includes(term))
  }

  /**
   * Filter texts to only include those that match category terms
   */
  private filterTextsByCategories(
    texts: string[],
    categories?: object[]
  ): string[] {
    const categoryTerms = this.extractCategoryTerms(categories)

    if (categoryTerms.length === 0) {
      console.log(
        '[AWSBedrockProvider] No category terms found, including all texts'
      )
      return texts
    }

    console.log(
      `[AWSBedrockProvider] Filtering texts using ${categoryTerms.length} category terms`
    )
    console.log(
      '[AWSBedrockProvider] Category terms:',
      categoryTerms.join(', ')
    )

    const filteredTexts = texts.filter((text) =>
      this.textMatchesCategories(text, categoryTerms)
    )

    console.log(
      `[AWSBedrockProvider] Filtered ${texts.length} texts down to ${filteredTexts.length} matching texts`
    )

    return filteredTexts
  }

  async extractStructuredDataFromImages<T>(
    imageUrls: string[],
    dataSchema: object,
    instructions: string
  ): Promise<T & { tokenUsage?: TokenUsageInfo }> {
    try {
      console.log(`[AWSBedrockProvider] Processing ${imageUrls.length} images`)
      console.log(
        `[AWSBedrockProvider] Extracting structured data with AWS Bedrock`
      )

      const modelId = this.config.model || 'apac.amazon.nova-lite-v1:0'

      const prompt = `
        ${instructions}
        
        Extract information from the following images according to this JSON schema:
        ${JSON.stringify(dataSchema, null, 2)}
        
        Your response should be valid JSON that matches this schema.
        IMPORTANT: Return ONLY the JSON object, with no additional text or markdown formatting.
      `

      // Create content array with the first item being the text prompt
      const content: any[] = [{ text: prompt }]

      // Add image blocks for each valid image URL
      for (const imageUrl of imageUrls) {
        try {
          if (!imageUrl.startsWith('data:')) {
            console.warn(
              `[AWSBedrockProvider] Invalid image URL format: ${imageUrl.substring(
                0,
                20
              )}...`
            )
            continue
          }

          // Extract MIME type and base64 content
          const match = imageUrl.match(/^data:image\/([a-zA-Z]+);base64,(.*)$/)
          if (!match) {
            console.warn(`[AWSBedrockProvider] Could not parse image data URL`)
            continue
          }

          const format = match[1].toLowerCase()
          const base64Data = match[2]

          // Convert base64 to binary (Uint8Array)
          const binaryData = Buffer.from(base64Data, 'base64')

          // Ensure format is one of the supported formats by the API
          const apiFormat = format === 'jpg' ? 'jpeg' : format
          if (!['png', 'jpeg', 'gif', 'webp'].includes(apiFormat)) {
            console.warn(
              `[AWSBedrockProvider] Unsupported image format: ${format}`
            )
            continue
          }

          console.log(
            `[AWSBedrockProvider] Adding image (${apiFormat}, ${binaryData.length} bytes)`
          )

          // Add image block to content array using type assertion
          content.push({
            image: {
              format: apiFormat as 'png' | 'jpeg' | 'gif' | 'webp',
              source: {
                bytes: binaryData,
              },
            },
          })
        } catch (err) {
          console.error(`[AWSBedrockProvider] Error processing image: ${err}`)
        }
      }

      // Create the command using the Converse API format
      const command = new ConverseCommand({
        modelId: modelId,
        messages: [
          {
            role: 'user',
            content: content,
          },
        ],
        inferenceConfig: {
          maxTokens: this.config.maxTokens || 4096,
          temperature: this.config.temperature || 0,
          topP: 0.9,
        },
      })

      console.log(`[AWSBedrockProvider] Sending request to model ${modelId}`)
      const response = await this.client.send(command)

      // Extract text from the response
      let responseText = ''
      if (
        response.output &&
        response.output.message &&
        response.output.message.content
      ) {
        for (const content of response.output.message.content) {
          if (content.text) {
            responseText += content.text
          }
        }
      } else {
        console.warn(
          '[AWSBedrockProvider] Unexpected response structure:',
          response
        )
        responseText = JSON.stringify(response)
      }

      console.log(
        `[AWSBedrockProvider] Response received (length: ${responseText.length})`
      )
      console.log(
        '[AWSBedrockProvider] Response preview:',
        responseText.substring(0, 200)
      )

      // AWS Bedrock doesn't always provide token usage in a standard way
      // Use estimation for token usage
      const promptTokens = this.estimateTokenCount(
        prompt + JSON.stringify(imageUrls)
      )
      const completionTokens = this.estimateTokenCount(responseText)
      const totalTokens = promptTokens + completionTokens

      // Calculate estimated cost
      const estimatedCost = this.calculateCost(
        promptTokens,
        completionTokens,
        modelId
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
        console.error(
          '[AWSBedrockProvider] Error parsing JSON response:',
          jsonError
        )
        console.error('[AWSBedrockProvider] Raw response:', responseText)
        throw new Error('Failed to parse AI response as JSON')
      }
    } catch (error) {
      console.error('Error extracting structured data with AWS Bedrock:', error)
      throw error
    }
  }

  async extractStructuredDataFromText<T>(
    texts: string[],
    dataSchema: object,
    instructions: string,
    categories?: object[]
  ): Promise<T & { tokenUsage?: TokenUsageInfo }> {
    try {
      // Pre-cleanup: Filter texts to match expected categories
      const filteredTexts = this.filterTextsByCategories(texts, categories)
      // Early exit if no texts match categories
      if (filteredTexts.length === 0) {
        console.warn(
          '[AWSBedrockProvider] No texts match the expected categories after filtering'
        )
        // Return empty result with zero token usage
        const emptyResult = {} as T & {
          tokenUsage?: TokenUsageInfo
          resume: []
          resume_show_years: false
          empty_result: true
        }
        emptyResult.tokenUsage = {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCost: 0,
        }
        emptyResult.resume = []
        emptyResult.resume_show_years = false
        emptyResult.empty_result = true
        return emptyResult
      }

      const modelId = this.config.model || 'apac.amazon.nova-lite-v1:0'

      const prompt = `
        Pre defined categories that will be used to pull the category_id from:
        ${JSON.stringify(categories, null, 2)}
        
        ${instructions}
        
        Extract information from the following text according to this JSON schema:
        ${JSON.stringify(dataSchema, null, 2)}
        
        Your response should be valid JSON that matches this schema.
        IMPORTANT: Return ONLY the JSON object, with no additional text or markdown formatting.

        Text content:
        ${filteredTexts.join('\n\n')}
      `

      // Create the command using the Converse API format
      const command = new ConverseCommand({
        modelId: modelId,
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
        inferenceConfig: {
          maxTokens: this.config.maxTokens || 4096,
          temperature: this.config.temperature || 0,
          topP: 0.9,
        },
      })

      console.log(`[AWSBedrockProvider] Sending request to model ${modelId}`)
      const response = await this.client.send(command)

      // Extract text from the response
      let responseText = ''
      if (
        response.output &&
        response.output.message &&
        response.output.message.content
      ) {
        for (const content of response.output.message.content) {
          if (content.text) {
            responseText += content.text
          }
        }
      } else {
        console.warn(
          '[AWSBedrockProvider] Unexpected response structure:',
          response
        )
        responseText = JSON.stringify(response)
      }

      // AWS Bedrock doesn't always provide token usage in a standard way
      // Use estimation for token usage
      const promptTokens = this.estimateTokenCount(prompt)
      const completionTokens = this.estimateTokenCount(responseText)
      const totalTokens = promptTokens + completionTokens

      // Calculate estimated cost
      const estimatedCost = this.calculateCost(
        promptTokens,
        completionTokens,
        modelId
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

        let parsedJson = JSON.parse(fixedJson)
        console.log(`[AWSBedrockProvider] old parsedJson: ${parsedJson}`)
        if (parsedJson.credits) {
          parsedJson = transformCredits(parsedJson)
        }
        console.log(`[AWSBedrockProvider] new parsedJson: ${parsedJson}`)

        return {
          ...replaceUUIDv4Placeholders(parsedJson),
          tokenUsage,
        }
      } catch (jsonError) {
        console.error(
          '[AWSBedrockProvider] Error parsing JSON response:',
          jsonError
        )
        console.error('[AWSBedrockProvider] Raw response:', responseText)
        throw new Error('Failed to parse AI response as JSON')
      }
    } catch (error) {
      console.error('Error extracting structured data with AWS Bedrock:', error)
      throw error
    }
  }

  getModelInfo(): { provider: string; model: string } {
    return {
      provider: 'aws',
      model: this.config.model || 'apac.amazon.nova-lite-v1:0',
    }
  }
}
