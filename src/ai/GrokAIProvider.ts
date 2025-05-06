import { exec } from 'child_process'
import * as fs from 'fs'
import { OpenAI } from 'openai'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'
import {
  AIModelConfig,
  AIProvider,
  AIResponseFormat,
} from '../types/AIProvider'

const execAsync = promisify(exec)

export interface GrokAIConfig extends AIModelConfig {
  // No additional config needed beyond apiKey and model
}

export class GrokAIProvider implements AIProvider {
  private client: OpenAI
  private config: GrokAIConfig

  constructor(config: GrokAIConfig) {
    this.config = config

    console.log(
      `[GrokAIProvider] Initializing with model: ${
        config.model || 'grok-3-mini-beta'
      }`
    )

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://api.x.ai/v1',
    })
  }

  async processText(text: string, prompt: string): Promise<AIResponseFormat> {
    try {
      console.log(`[GrokAIProvider] Processing text with Grok AI`)

      const completion = await this.client.chat.completions.create({
        model: this.config.model || 'grok-3-mini-beta',
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
      })

      return {
        text: completion.choices[0]?.message?.content || '',
      }
    } catch (error) {
      console.error('Error processing text with Grok AI:', error)
      throw error
    }
  }

  async extractStructuredData<T>(
    text: string,
    dataSchema: object,
    instructions: string
  ): Promise<T> {
    try {
      console.log(`[GrokAIProvider] Extracting structured data with Grok AI`)

      const prompt = `
        ${instructions}
        
        Extract information from the following text according to this JSON schema:
        ${JSON.stringify(dataSchema, null, 2)}
        
        Your response should be valid JSON that matches this schema.
      `

      const completion = await this.client.chat.completions.create({
        model: this.config.model || 'grok-3-mini-beta',
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
        response_format: { type: 'json_object' },
      })

      const responseText = completion.choices[0]?.message?.content || '{}'
      return JSON.parse(responseText) as T
    } catch (error) {
      console.error('Error extracting structured data with Grok AI:', error)
      throw error
    }
  }

  async processPDF(pdfPath: string, prompt: string): Promise<AIResponseFormat> {
    try {
      console.log(`[GrokAIProvider] Starting PDF processing for: ${pdfPath}`)

      // Check if the model supports vision capabilities
      const modelName = this.config.model || 'grok-3-mini-beta'
      const isVisionCapable = modelName.includes('vision')

      // For non-vision models, immediately use the text extraction fallback
      if (!isVisionCapable) {
        console.log(
          `[GrokAIProvider] Model ${modelName} does not support vision. Using text extraction.`
        )
        return await this.extractAndProcessPDFText(pdfPath, prompt)
      }

      // Continue with image processing for vision-capable models
      console.log(
        `[GrokAIProvider] Using vision capabilities with model ${modelName}`
      )

      // Convert PDF to images first
      console.log(`[GrokAIProvider] Converting PDF to images...`)
      const imageUrls = await this.convertPdfToImages(pdfPath)
      console.log(
        `[GrokAIProvider] Converted PDF to ${imageUrls.length} images`
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

      const completion = await this.client.chat.completions.create({
        model: this.config.model || 'grok-3-mini-beta',
        messages: messages,
      })

      return {
        text: completion.choices[0]?.message?.content || '',
      }
    } catch (error) {
      console.error('Error processing PDF with Grok AI:', error)

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
    console.log(`[GrokAIProvider] Creating temp directory for PDF images`)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-images-'))
    console.log(`[GrokAIProvider] Temp directory created: ${tempDir}`)

    try {
      // Use pdftoppm to convert PDF to images (requires poppler-utils to be installed)
      console.log(
        `[GrokAIProvider] Executing pdftoppm to convert PDF to images`
      )
      const command = `pdftoppm -png -r 200 "${pdfPath}" "${path.join(
        tempDir,
        'page'
      )}"`
      console.log(`[GrokAIProvider] Command: ${command}`)
      await execAsync(command)

      // Get all generated image files
      const files = fs
        .readdirSync(tempDir)
        .filter((file) => file.endsWith('.png'))
      console.log(
        `[GrokAIProvider] Found ${files.length} image files: ${files.join(
          ', '
        )}`
      )

      const sortedFiles = files.map((file) => path.join(tempDir, file)).sort() // Ensure correct page order
      console.log(
        `[GrokAIProvider] Sorted file paths: ${sortedFiles.join(', ')}`
      )

      // Convert images to base64 data URLs
      console.log(`[GrokAIProvider] Converting images to base64...`)
      const imageUrls = sortedFiles.map((file) => {
        const data = fs.readFileSync(file)
        const base64 = data.toString('base64')
        console.log(
          `[GrokAIProvider] Converted image ${file}, size: ${base64.length} chars`
        )
        return `data:image/png;base64,${base64}`
      })

      console.log(
        `[GrokAIProvider] Returning ${imageUrls.length} base64 image URLs`
      )
      return imageUrls
    } catch (error) {
      console.error('Error converting PDF to images:', error)
      throw error
    }
  }
}
