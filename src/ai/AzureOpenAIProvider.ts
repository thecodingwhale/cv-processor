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

      return {
        text: completion.choices[0]?.message?.content || '',
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
  ): Promise<T> {
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

      const responseText = completion.choices[0]?.message?.content || '{}'
      return JSON.parse(responseText) as T
    } catch (error) {
      console.error(
        'Error extracting structured data with Azure OpenAI:',
        error
      )
      throw error
    }
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

      return {
        text: completion.choices[0]?.message?.content || '',
      }
    } catch (error) {
      console.error('Error processing PDF with Azure OpenAI:', error)

      // Fallback: Try to extract text from PDF first, then process with API
      console.log('Attempting fallback method for PDF processing...')
      try {
        return await this.extractAndProcessPDFText(pdfPath, prompt)
      } catch (fallbackError) {
        console.error('Fallback method failed:', fallbackError)
        throw error // Throw the original error
      }
    }
  }

  // Helper method to extract text from PDF and process it
  private async extractAndProcessPDFText(
    pdfPath: string,
    prompt: string
  ): Promise<AIResponseFormat> {
    const dataBuffer = fs.readFileSync(pdfPath)

    // Use a PDF parsing library to extract text
    const pdfjs = require('pdf-parse')
    const pdfData = await pdfjs(dataBuffer)
    const pdfText = pdfData.text

    // Process the extracted text with OpenAI
    return this.processText(pdfText, prompt)
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
}
