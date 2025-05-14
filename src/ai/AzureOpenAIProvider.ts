import { jsonrepair } from 'jsonrepair'
import { AzureOpenAI } from 'openai'
import { AIModelConfig, AIProvider, TokenUsageInfo } from '../types/AIProvider'
import { replaceUUIDv4Placeholders } from '../utils/data'

export interface AzureOpenAIConfig extends AIModelConfig {
  endpoint: string
  apiVersion?: string
  deploymentName?: string
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
        // temperature: this.config.temperature || 0.2,
        // max_tokens: this.config.maxTokens || 4096,
        // response_format: { type: 'json_object' },
        // response_format: { type: 'json_object' },
      }

      completion = await this.client.chat.completions.create(requestParams)

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
