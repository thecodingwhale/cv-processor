import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { exec } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'
import {
  AIModelConfig,
  AIProvider,
  AIResponseFormat,
} from '../types/AIProvider'

const execAsync = promisify(exec)

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

  private formatPromptForModel(prompt: string, text: string): any {
    const modelId = this.config.model || 'apac.amazon.nova-micro-v1:0'
    console.log(`[AWSBedrockProvider] Formatting prompt for model: ${modelId}`)

    // Amazon Titan models
    if (modelId.startsWith('amazon.titan')) {
      return {
        inputText: `${prompt}\n\n${text}`,
        textGenerationConfig: {
          maxTokenCount: this.config.maxTokens || 4096,
          temperature: this.config.temperature || 0.2,
        },
      }
      // Cohere models
    } else if (modelId.startsWith('cohere.command')) {
      return {
        prompt: `${prompt}\n\n${text}`,
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0.2,
      }
      // APAC Nova model
    } else if (modelId.includes('apac') && modelId.includes('nova')) {
      // APAC Nova models expect content as an array of objects with 'text' field
      return {
        messages: [
          {
            role: 'user',
            content: [
              {
                text: `${prompt}\n\n${text}`,
              },
            ],
          },
        ],
      }
      // Regular Nova model
    } else if (modelId.includes('nova')) {
      return {
        messages: [
          {
            role: 'user',
            content: [
              {
                text: `${prompt}\n\n${text}`,
              },
            ],
          },
        ],
      }
      // Default format
    } else {
      return {
        prompt: `${prompt}\n\n${text}`,
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0.2,
      }
    }
  }

  private parseResponseFromModel(modelId: string, data: any): string {
    const parsedData = JSON.parse(data)
    console.log(
      `[AWSBedrockProvider] Response structure:`,
      Object.keys(parsedData)
    )

    let responseText = ''

    if (modelId.startsWith('amazon.titan')) {
      responseText = parsedData.results[0]?.outputText || ''
    } else if (modelId.startsWith('cohere.command')) {
      responseText = parsedData.generations[0]?.text || ''
    } else if (modelId.includes('apac') && modelId.includes('nova')) {
      console.log('[AWSBedrockProvider] Parsing APAC Nova response')
      // APAC Nova models return data in a nested structure
      if (
        parsedData.output &&
        parsedData.output.message &&
        parsedData.output.message.content
      ) {
        // Extract the content text from the first message content item
        responseText = parsedData.output.message.content[0]?.text || ''
        console.log(
          '[AWSBedrockProvider] Raw APAC Nova response text:',
          responseText
        )
      } else if (parsedData.outputText) {
        responseText = parsedData.outputText
      } else if (parsedData.outputs && parsedData.outputs.length > 0) {
        responseText =
          parsedData.outputs[0].text || JSON.stringify(parsedData.outputs[0])
      } else if (parsedData.results && parsedData.results.length > 0) {
        responseText =
          parsedData.results[0].outputText ||
          JSON.stringify(parsedData.results[0])
      } else if (parsedData.text) {
        responseText = parsedData.text
      } else {
        console.warn(
          '[AWSBedrockProvider] Could not find expected response format for APAC Nova:',
          parsedData
        )
        responseText = JSON.stringify(parsedData)
      }

      // Extract JSON from markdown code block if present
      const jsonMatch = responseText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
      if (jsonMatch && jsonMatch[1]) {
        console.log(
          '[AWSBedrockProvider] Found JSON in code block, extracting...'
        )
        responseText = jsonMatch[1]
      }
    } else if (modelId.includes('nova')) {
      responseText =
        parsedData.output ||
        parsedData.message?.content ||
        parsedData.completion ||
        ''
    } else {
      responseText = parsedData?.text || parsedData?.output || ''
    }

    return responseText
  }

  async processText(text: string, prompt: string): Promise<AIResponseFormat> {
    try {
      console.log(`[AWSBedrockProvider] Processing text with AWS Bedrock`)

      const modelId = this.config.model || 'apac.amazon.nova-micro-v1:0'
      const requestBody = this.formatPromptForModel(prompt, text)

      console.log(
        `[AWSBedrockProvider] Request format for ${modelId}:`,
        JSON.stringify(requestBody, null, 2)
      )
      console.log(
        `[AWSBedrockProvider] Request format has keys:`,
        Object.keys(requestBody)
      )

      if (modelId.includes('apac') && modelId.includes('nova')) {
        console.log(
          `[AWSBedrockProvider] Checking messages format:`,
          JSON.stringify(requestBody.messages, null, 2)
        )
        console.log(
          `[AWSBedrockProvider] Message content structure:`,
          typeof requestBody.messages[0].content
        )
        if (Array.isArray(requestBody.messages[0].content)) {
          console.log(
            `[AWSBedrockProvider] Content is an array with ${requestBody.messages[0].content.length} items`
          )
          console.log(
            `[AWSBedrockProvider] First content item:`,
            JSON.stringify(requestBody.messages[0].content[0])
          )
          console.log(
            `[AWSBedrockProvider] First content item type:`,
            typeof requestBody.messages[0].content[0]
          )
        }
      }

      // For Nova models, we may need to use a provisioned throughput profile
      const inferenceProfileArn = process.env.AWS_BEDROCK_INFERENCE_PROFILE_ARN

      if (modelId.includes('nova') && inferenceProfileArn) {
        console.log(
          `[AWSBedrockProvider] Using inference profile ARN: ${inferenceProfileArn}`
        )
      } else if (modelId.includes('nova')) {
        console.warn(
          `[AWSBedrockProvider] Warning: Nova model without inference profile ARN`
        )
      }

      const command = new InvokeModelCommand({
        modelId,
        body: JSON.stringify(requestBody),
        contentType: 'application/json',
        accept: 'application/json',
        ...(inferenceProfileArn && modelId.includes('nova')
          ? { inferenceProfileArn }
          : {}),
      })

      const response = await this.client.send(command)

      // Convert response body to string
      const responseBody = Buffer.from(response.body).toString('utf-8')
      console.log(`[AWSBedrockProvider] Raw response:`, responseBody)

      const responseText = this.parseResponseFromModel(modelId, responseBody)

      return {
        text: responseText,
      }
    } catch (error) {
      console.error('Error processing text with AWS Bedrock:', error)
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
        `[AWSBedrockProvider] Extracting structured data with AWS Bedrock`
      )

      const prompt = `
        ${instructions}
        
        Extract information from the following text according to this JSON schema:
        ${JSON.stringify(dataSchema, null, 2)}
        
        Your response should be valid JSON that matches this schema.
        IMPORTANT: Return ONLY the JSON object, with no additional text or markdown formatting.
      `

      const response = await this.processText(text, prompt)

      try {
        // Try to parse the response as JSON directly
        return JSON.parse(response.text) as T
      } catch (jsonError) {
        console.error(
          'Error parsing JSON from AWS Bedrock response:',
          jsonError
        )
        console.log('Trying to extract JSON from text response...')

        // Try to find and extract JSON from the response text

        // First try extracting from markdown code blocks
        const codeBlockMatch = response.text.match(
          /```(?:json)?\s*\n([\s\S]*?)\n```/
        )
        if (codeBlockMatch && codeBlockMatch[1]) {
          try {
            console.log(
              '[AWSBedrockProvider] Found JSON in code block, extracting...'
            )
            return JSON.parse(codeBlockMatch[1]) as T
          } catch (e) {
            console.error('Failed to parse JSON from code block:', e)
          }
        }

        // Then try to find any JSON-like structure
        const jsonMatch = response.text.match(/({[\s\S]*})/)
        if (jsonMatch && jsonMatch[1]) {
          try {
            console.log(
              '[AWSBedrockProvider] Found JSON pattern in text, extracting...'
            )
            return JSON.parse(jsonMatch[1]) as T
          } catch (e) {
            console.error('Failed to parse extracted JSON pattern:', e)
          }
        }

        // If we got this far, we couldn't extract valid JSON
        throw new Error(
          'Could not extract valid JSON from AWS Bedrock response'
        )
      }
    } catch (error) {
      console.error('Error extracting structured data with AWS Bedrock:', error)
      throw error
    }
  }

  async processPDF(pdfPath: string, prompt: string): Promise<AIResponseFormat> {
    try {
      console.log(
        `[AWSBedrockProvider] Starting PDF processing for: ${pdfPath}`
      )

      // Check if the model supports vision capabilities
      const modelId = this.config.model || 'apac.amazon.nova-micro-v1:0'
      const isVisionCapable = modelId.includes('vision')

      // For non-vision models, immediately use the text extraction fallback
      if (!isVisionCapable) {
        console.log(
          `[AWSBedrockProvider] Model ${modelId} does not support vision. Using text extraction.`
        )
        return await this.extractAndProcessPDFText(pdfPath, prompt)
      }

      // Vision-capable models
      console.log(
        `[AWSBedrockProvider] Using vision capabilities with model ${modelId}`
      )

      // Convert PDF to images first
      console.log(`[AWSBedrockProvider] Converting PDF to images...`)
      const imageUrls = await this.convertPdfToImages(pdfPath)
      console.log(
        `[AWSBedrockProvider] Converted PDF to ${imageUrls.length} images`
      )

      // For vision models, this would need to be adapted based on their specific API
      throw new Error(
        `Vision capabilities not implemented for model: ${modelId}`
      )
    } catch (error) {
      console.error('Error processing PDF with AWS Bedrock:', error)

      // Fallback: Try to extract text from PDF first, then process with API
      console.log('Attempting fallback method for PDF processing...')
      try {
        return await this.extractAndProcessPDFText(pdfPath, prompt)
      } catch (fallbackError) {
        console.error('Fallback method failed:', fallbackError)
        console.log(
          'AWS Bedrock processing failed. Trying to extract text directly...'
        )

        // Last resort fallback: just extract text without AI processing
        try {
          const dataBuffer = fs.readFileSync(pdfPath)
          const pdfjs = require('pdf-parse')
          const pdfData = await pdfjs(dataBuffer)

          return {
            text: pdfData.text || 'Failed to extract text from PDF',
          }
        } catch (lastError) {
          console.error('All fallback methods failed:', lastError)
          throw error // Throw the original error
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

      // Process the extracted text
      return this.processText(pdfText, prompt)
    } catch (error) {
      console.error('Error in extractAndProcessPDFText:', error)

      // If AWS Bedrock isn't working, we'll extract the text and return it directly
      const pdfjs = require('pdf-parse')
      const dataBuffer = fs.readFileSync(pdfPath)
      const pdfData = await pdfjs(dataBuffer)

      return {
        text: pdfData.text || 'Failed to extract text from PDF',
      }
    }
  }

  private async convertPdfToImages(pdfPath: string): Promise<string[]> {
    console.log(`[AWSBedrockProvider] Creating temp directory for PDF images`)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-images-'))
    console.log(`[AWSBedrockProvider] Temp directory created: ${tempDir}`)

    try {
      // Use pdftoppm to convert PDF to images (requires poppler-utils to be installed)
      console.log(
        `[AWSBedrockProvider] Executing pdftoppm to convert PDF to images`
      )
      const command = `pdftoppm -png -r 200 "${pdfPath}" "${path.join(
        tempDir,
        'page'
      )}"`
      console.log(`[AWSBedrockProvider] Command: ${command}`)
      await execAsync(command)

      // Get all generated image files
      const files = fs
        .readdirSync(tempDir)
        .filter((file) => file.endsWith('.png'))
      console.log(
        `[AWSBedrockProvider] Found ${files.length} image files: ${files.join(
          ', '
        )}`
      )

      const sortedFiles = files.map((file) => path.join(tempDir, file)).sort() // Ensure correct page order
      console.log(
        `[AWSBedrockProvider] Sorted file paths: ${sortedFiles.join(', ')}`
      )

      // Convert images to base64 data URLs
      console.log(`[AWSBedrockProvider] Converting images to base64...`)
      const imageUrls = sortedFiles.map((file) => {
        const data = fs.readFileSync(file)
        const base64 = data.toString('base64')
        console.log(
          `[AWSBedrockProvider] Converted image ${file}, size: ${base64.length} chars`
        )
        return `data:image/png;base64,${base64}`
      })

      console.log(
        `[AWSBedrockProvider] Returning ${imageUrls.length} base64 image URLs`
      )
      return imageUrls
    } catch (error) {
      console.error('Error converting PDF to images:', error)
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
