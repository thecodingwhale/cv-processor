import { exec } from 'child_process'
import * as fs from 'fs'
import { AzureOpenAI } from 'openai'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'
import {
  AIModelConfig,
  AIProvider,
  AIResponseFormat,
  TokenUsageInfo,
} from '../types/AIProvider'

const execAsync = promisify(exec)

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

  async processText(text: string, prompt: string): Promise<AIResponseFormat> {
    try {
      console.log(`[AzureOpenAIProvider] Processing text with Azure OpenAI`)

      // Create request parameters, omitting unsupported parameters for certain models
      const requestParams: any = {
        messages: [
          {
            role: 'system',
            content: prompt,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        model: this.config.model, // Required by OpenAI SDK but ignored by Azure
        max_completion_tokens: this.config.maxTokens || 4096,
      }

      // Only add temperature if it's supported by the model
      if (this.config.temperature !== undefined) {
        try {
          requestParams.temperature = this.config.temperature || 0.2
        } catch (e) {
          console.log(
            `[AzureOpenAIProvider] Temperature parameter not supported, skipping`
          )
        }
      }

      const completion = await this.client.chat.completions.create(
        requestParams
      )

      // Calculate token usage
      const tokenUsage = {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
        estimatedCost: this.estimateAzureCost(
          completion.usage?.prompt_tokens || 0,
          completion.usage?.completion_tokens || 0
        ),
      }

      return {
        text: completion.choices[0]?.message?.content || '',
        tokenUsage,
      }
    } catch (error) {
      console.error('Error processing text with Azure OpenAI:', error)
      throw error
    }
  }

  async extractStructuredData<T>(
    text: string,
    dataSchema: object,
    instructions: string
  ): Promise<T & { tokenUsage?: TokenUsageInfo }> {
    try {
      console.log(
        `[AzureOpenAIProvider] Extracting structured data with Azure OpenAI`
      )

      const prompt = `
        ${instructions}
        
        Extract information from the following text according to this JSON schema:
        ${JSON.stringify(dataSchema, null, 2)}
        
        Your response should be valid JSON that matches this schema.
      `

      // Create request parameters, omitting unsupported parameters for certain models
      const requestParams: any = {
        messages: [
          {
            role: 'system',
            content: prompt,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        model: this.config.model, // Required by OpenAI SDK but ignored by Azure
        max_completion_tokens: this.config.maxTokens || 4096,
        response_format: { type: 'json_object' },
      }

      // Only add temperature if it's supported by the model
      if (this.config.temperature !== undefined) {
        try {
          requestParams.temperature = this.config.temperature || 0.2
        } catch (e) {
          console.log(
            `[AzureOpenAIProvider] Temperature parameter not supported, skipping`
          )
        }
      }

      const completion = await this.client.chat.completions.create(
        requestParams
      )

      // Estimate token usage
      const tokenUsage = {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
        estimatedCost: this.estimateAzureCost(
          completion.usage?.prompt_tokens || 0,
          completion.usage?.completion_tokens || 0
        ),
      }

      const responseText = completion.choices[0]?.message?.content || '{}'

      try {
        // Try to parse the JSON response
        const parsedData = JSON.parse(responseText) as T

        return {
          ...parsedData,
          tokenUsage,
        }
      } catch (jsonError) {
        console.error(
          'Error parsing JSON from Azure OpenAI response:',
          jsonError
        )

        // Try to repair the JSON
        const repairedJson = this.repairJSON(responseText)

        try {
          // Try to parse the repaired JSON
          const parsedData = JSON.parse(repairedJson) as T
          console.log('Successfully repaired JSON response')

          return {
            ...parsedData,
            tokenUsage,
          }
        } catch (repairError) {
          console.error('Failed to repair JSON:', repairError)

          // If all else fails, retry with a more explicit instruction
          return this.retryWithValidJSON<T>(
            text,
            dataSchema,
            instructions,
            tokenUsage
          )
        }
      }
    } catch (error) {
      console.error(
        'Error extracting structured data with Azure OpenAI:',
        error
      )
      throw error
    }
  }

  /**
   * Attempt to repair common JSON syntax errors
   */
  private repairJSON(jsonStr: string): string {
    // Replace multiple consecutive newlines with a single newline
    let repaired = jsonStr.replace(/\n\s*\n/g, '\n')

    // Remove any non-JSON text at the beginning or end
    repaired = repaired.replace(/^[^{\[]+/, '').replace(/[^}\]]+$/, '')

    // Fix trailing commas in arrays
    repaired = repaired.replace(/,\s*(\])/g, '$1')

    // Fix trailing commas in objects
    repaired = repaired.replace(/,\s*(\})/g, '$1')

    // Fix missing commas between array elements
    repaired = repaired.replace(/\](\s*)\[/g, '],$1[')

    // Fix missing commas between object entries
    repaired = repaired.replace(/\}(\s*)\{/g, '},$1{')

    // Fix unquoted property names
    repaired = repaired.replace(
      /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g,
      '$1"$2"$3'
    )

    // Fix single quoted strings
    repaired = repaired.replace(/'([^'\\]*(\\.[^'\\]*)*?)'/g, '"$1"')

    // Fix unterminated strings by adding missing quotes
    // This is complex, but we can try a simple approach
    const lines = repaired.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const quoteCount = (lines[i].match(/"/g) || []).length
      if (quoteCount % 2 !== 0) {
        // Uneven number of quotes in this line
        if (i < lines.length - 1) {
          // Try to fix by ending the string at the end of the line
          lines[i] = lines[i] + '"'
        }
      }
    }
    repaired = lines.join('\n')

    // Check for balanced braces and brackets
    const openBraces = (repaired.match(/\{/g) || []).length
    const closeBraces = (repaired.match(/\}/g) || []).length
    const openBrackets = (repaired.match(/\[/g) || []).length
    const closeBrackets = (repaired.match(/\]/g) || []).length

    // Add missing closing braces
    if (openBraces > closeBraces) {
      repaired += '}'.repeat(openBraces - closeBraces)
    }

    // Add missing closing brackets
    if (openBrackets > closeBrackets) {
      repaired += ']'.repeat(openBrackets - closeBrackets)
    }

    return repaired
  }

  /**
   * Retry extraction with more explicit instructions for valid JSON
   */
  private async retryWithValidJSON<T>(
    text: string,
    dataSchema: object,
    instructions: string,
    originalTokenUsage?: TokenUsageInfo
  ): Promise<T & { tokenUsage?: TokenUsageInfo }> {
    console.log('Retrying API call with explicit JSON validation instructions')

    const retryPrompt = `
      ${instructions}
      
      I need STRICTLY VALID JSON that follows this schema exactly:
      ${JSON.stringify(dataSchema, null, 2)}
      
      CRITICALLY IMPORTANT:
      1. Double-check that your JSON is valid and does not contain ANY syntax errors
      2. Use double quotes for all strings and property names
      3. Do not include trailing commas in arrays or objects
      4. Make sure all strings are properly terminated with closing quotes
      5. Do not include any text before or after the JSON
      6. Do not use markdown formatting or code blocks
      
      Return ONLY the raw JSON object.
      
      Text content:
      ${text}
    `

    try {
      // Create request parameters for retry
      const requestParams: any = {
        messages: [
          {
            role: 'system',
            content: retryPrompt,
          },
          {
            role: 'user',
            content: 'Generate valid JSON according to the instructions',
          },
        ],
        model: this.config.model,
        max_completion_tokens: this.config.maxTokens || 4096,
        response_format: { type: 'json_object' },
      }

      // Only add temperature if it's supported by the model (use lower temperature)
      if (this.config.temperature !== undefined) {
        try {
          requestParams.temperature = 0.1 // Lower temperature for more precise output
        } catch (e) {
          console.log(
            `[AzureOpenAIProvider] Temperature parameter not supported, skipping`
          )
        }
      }

      const completion = await this.client.chat.completions.create(
        requestParams
      )

      const retryText = completion.choices[0]?.message?.content || '{}'

      // Calculate token usage for the retry request
      const retryTokenUsage = {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
        estimatedCost: this.estimateAzureCost(
          completion.usage?.prompt_tokens || 0,
          completion.usage?.completion_tokens || 0
        ),
      }

      // Combine with original token usage if available
      const combinedTokenUsage = originalTokenUsage
        ? {
            promptTokens:
              (originalTokenUsage.promptTokens || 0) +
              (retryTokenUsage.promptTokens || 0),
            completionTokens:
              (originalTokenUsage.completionTokens || 0) +
              (retryTokenUsage.completionTokens || 0),
            totalTokens:
              (originalTokenUsage.totalTokens || 0) +
              (retryTokenUsage.totalTokens || 0),
            estimatedCost:
              (originalTokenUsage.estimatedCost || 0) +
              (retryTokenUsage.estimatedCost || 0),
          }
        : retryTokenUsage

      try {
        // Try to parse the retry response
        return {
          ...JSON.parse(retryText),
          tokenUsage: combinedTokenUsage,
        }
      } catch (parseError) {
        console.error('JSON retry parsing failed:', parseError)

        // Apply repair to the retry response as a last resort
        const repairedJson = this.repairJSON(retryText)

        try {
          return {
            ...JSON.parse(repairedJson),
            tokenUsage: combinedTokenUsage,
          }
        } catch (finalError) {
          console.error(
            'All JSON parsing attempts failed, returning empty object'
          )

          // If everything fails, return a minimal valid object to avoid crashing
          return {
            tokenUsage: combinedTokenUsage,
          } as T & { tokenUsage?: TokenUsageInfo }
        }
      }
    } catch (retryError) {
      console.error('JSON retry attempt failed:', retryError)

      // At this point, return a minimal valid object that matches the expected type
      return {
        tokenUsage: originalTokenUsage,
      } as T & { tokenUsage?: TokenUsageInfo }
    }
  }

  /**
   * Estimate Azure OpenAI cost based on tokens used
   */
  private estimateAzureCost(
    promptTokens: number,
    completionTokens: number
  ): number {
    // Azure pricing can vary based on deployment type and region
    // These are approximate rates - actual rates should be updated based on your Azure pricing
    let promptRate = 0.01 // $0.01 per 1K tokens (estimate)
    let completionRate = 0.02 // $0.02 per 1K tokens (estimate)

    // Adjust rates based on model if needed
    const model = this.config.deploymentName || this.config.model || ''

    if (model.includes('gpt-4')) {
      // GPT-4 typically costs more
      promptRate = 0.03
      completionRate = 0.06
    } else if (model.includes('gpt-35')) {
      // GPT-3.5 costs less
      promptRate = 0.001
      completionRate = 0.002
    }

    return (
      (promptTokens / 1000) * promptRate +
      (completionTokens / 1000) * completionRate
    )
  }

  async processPDF(pdfPath: string, prompt: string): Promise<AIResponseFormat> {
    try {
      console.log(
        `[AzureOpenAIProvider] Starting PDF processing for: ${pdfPath}`
      )

      // Check if this model supports vision capabilities
      const modelName = this.config.deploymentName || this.config.model
      const isVisionCapable =
        modelName.includes('gpt-4-vision') ||
        modelName.includes('gpt-4o') ||
        modelName.includes('gpt-4-turbo') ||
        modelName.includes('vision')

      // For non-vision models, immediately use the text extraction fallback
      if (!isVisionCapable) {
        console.log(
          `[AzureOpenAIProvider] Model ${modelName} does not support vision. Using text extraction.`
        )
        return await this.extractAndProcessPDFText(pdfPath, prompt)
      }

      // Continue with image processing for vision-capable models
      console.log(
        `[AzureOpenAIProvider] Using vision capabilities with model ${modelName}`
      )

      // Convert PDF to images first
      console.log(`[AzureOpenAIProvider] Converting PDF to images...`)
      const imageUrls = await this.convertPdfToImages(pdfPath)
      console.log(
        `[AzureOpenAIProvider] Converted PDF to ${imageUrls.length} images`
      )

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

      // Create request parameters, omitting unsupported parameters for certain models
      const requestParams: any = {
        messages: messages,
        model: this.config.model, // Required by OpenAI SDK but ignored by Azure
        max_completion_tokens: this.config.maxTokens || 4096,
      }

      // Only add temperature if it's supported by the model
      if (this.config.temperature !== undefined) {
        try {
          requestParams.temperature = this.config.temperature || 0.2
        } catch (e) {
          console.log(
            `[AzureOpenAIProvider] Temperature parameter not supported, skipping`
          )
        }
      }

      const completion = await this.client.chat.completions.create(
        requestParams
      )

      // Calculate token usage
      const tokenUsage = {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
        estimatedCost: this.estimateAzureCost(
          completion.usage?.prompt_tokens || 0,
          completion.usage?.completion_tokens || 0
        ),
      }

      return {
        text: completion.choices[0]?.message?.content || '',
        tokenUsage,
      }
    } catch (error) {
      console.error('Error processing PDF with Azure OpenAI:', error)

      // Fallback: Try to extract text from PDF first, then process with API
      console.log('Attempting fallback method for PDF processing...')
      try {
        return await this.extractAndProcessPDFText(pdfPath, prompt)
      } catch (fallbackError) {
        console.error('Fallback method failed:', fallbackError)

        // Return a minimal response with error information
        return {
          text: `Error processing PDF: ${error}. Fallback also failed: ${fallbackError}`,
          tokenUsage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            estimatedCost: 0,
          },
        }
      }
    }
  }

  // Helper method to extract text from PDF and process it
  private async extractAndProcessPDFText(
    pdfPath: string,
    prompt: string
  ): Promise<AIResponseFormat> {
    try {
      const dataBuffer = fs.readFileSync(pdfPath)

      // Use a PDF parsing library to extract text
      const pdfjs = require('pdf-parse')
      const pdfData = await pdfjs(dataBuffer)
      const pdfText = pdfData.text

      console.log(
        `[AzureOpenAIProvider] Extracted ${pdfText.length} characters of text from PDF, processing with API`
      )

      // Process the extracted text with Azure OpenAI
      return this.processText(pdfText, prompt)
    } catch (error) {
      console.error('Error in extractAndProcessPDFText:', error)

      // Return a minimal response with error information
      return {
        text: `Error extracting and processing PDF text: ${error}`,
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCost: 0,
        },
      }
    }
  }

  private async convertPdfToImages(pdfPath: string): Promise<string[]> {
    console.log(`[AzureOpenAIProvider] Creating temp directory for PDF images`)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-images-'))
    console.log(`[AzureOpenAIProvider] Temp directory created: ${tempDir}`)

    try {
      // Use pdftoppm to convert PDF to images (requires poppler-utils to be installed)
      console.log(
        `[AzureOpenAIProvider] Executing pdftoppm to convert PDF to images`
      )
      const command = `pdftoppm -png -r 200 "${pdfPath}" "${path.join(
        tempDir,
        'page'
      )}"`
      console.log(`[AzureOpenAIProvider] Command: ${command}`)
      await execAsync(command)

      // Get all generated image files
      const files = fs
        .readdirSync(tempDir)
        .filter((file) => file.endsWith('.png'))
      console.log(
        `[AzureOpenAIProvider] Found ${files.length} image files: ${files.join(
          ', '
        )}`
      )

      const sortedFiles = files.map((file) => path.join(tempDir, file)).sort() // Ensure correct page order
      console.log(
        `[AzureOpenAIProvider] Sorted file paths: ${sortedFiles.join(', ')}`
      )

      // Convert images to base64 data URLs
      console.log(`[AzureOpenAIProvider] Converting images to base64...`)
      const imageUrls = sortedFiles.map((file) => {
        const data = fs.readFileSync(file)
        const base64 = data.toString('base64')
        console.log(
          `[AzureOpenAIProvider] Converted image ${file}, size: ${base64.length} chars`
        )
        return `data:image/png;base64,${base64}`
      })

      console.log(
        `[AzureOpenAIProvider] Returning ${imageUrls.length} base64 image URLs`
      )
      return imageUrls
    } catch (error) {
      console.error('Error converting PDF to images:', error)
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
