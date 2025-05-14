import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { jsonrepair } from 'jsonrepair'
import { AIModelConfig, AIProvider } from '../types/AIProvider'
import { replaceUUIDv4Placeholders } from '../utils/data'

export interface AWSBedrockConfig extends Omit<AIModelConfig, 'apiKey'> {
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  apiKey?: string
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

    this.client = new BedrockRuntimeClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      credentials:
        Object.keys(credentials).length > 0 ? credentials : undefined,
    })
  }

  async extractStructuredData<T>(
    imageUrls: string[],
    dataSchema: object,
    instructions: string
  ): Promise<T> {
    try {
      console.log(`[AWSBedrockProvider] Processing ${imageUrls.length} images`)
      console.log(
        `[AWSBedrockProvider] Extracting structured data with AWS Bedrock`
      )

      const modelId = this.config.model || 'apac.amazon.nova-micro-v1:0'

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
          temperature: this.config.temperature || 0.2,
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
      model: this.config.model || 'apac.amazon.nova-micro-v1:0',
    }
  }
}
