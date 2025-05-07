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

export class OpenAIProvider implements AIProvider {
  private openai: OpenAI
  private config: AIModelConfig

  constructor(config: AIModelConfig) {
    this.config = config
    this.openai = new OpenAI({
      apiKey: config.apiKey,
    })
  }

  async processText(text: string, prompt: string): Promise<AIResponseFormat> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.config.model || 'gpt-4o',
        temperature: this.config.temperature || 0.2,
        max_tokens: this.config.maxTokens || 4096,
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
      console.error('Error processing text with OpenAI:', error)
      throw error
    }
  }

  async extractStructuredData<T>(
    text: string,
    dataSchema: object,
    instructions: string
  ): Promise<T> {
    try {
      const prompt = `
        ${instructions}
        
        Extract information from the following text according to this JSON schema:
        ${JSON.stringify(dataSchema, null, 2)}
        
        Your response should be valid JSON that matches this schema.
      `

      const completion = await this.openai.chat.completions.create({
        model: this.config.model || 'gpt-4o',
        temperature: this.config.temperature || 0.2,
        max_tokens: this.config.maxTokens || 4096,
        response_format: { type: 'json_object' },
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

      const responseText = completion.choices[0]?.message?.content || '{}'
      return JSON.parse(responseText) as T
    } catch (error) {
      console.error('Error extracting structured data with OpenAI:', error)
      throw error
    }
  }

  async processPDF(pdfPath: string, prompt: string): Promise<AIResponseFormat> {
    try {
      console.log(`[OpenAIProvider] Starting PDF processing for: ${pdfPath}`)

      // Convert PDF to images first
      console.log(`[OpenAIProvider] Converting PDF to images...`)
      const imageUrls = await this.convertPdfToImages(pdfPath)
      console.log(
        `[OpenAIProvider] Converted PDF to ${imageUrls.length} images`
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

      const completion = await this.openai.chat.completions.create({
        model: this.config.model || 'gpt-4o',
        temperature: this.config.temperature || 0.2,
        max_tokens: this.config.maxTokens || 4096,
        messages: messages,
      })

      return {
        text: completion.choices[0]?.message?.content || '',
      }
    } catch (error) {
      console.error('Error processing PDF with OpenAI:', error)

      // Fallback: Try to extract text from PDF first, then process with API
      console.log('Attempting fallback method for PDF processing...')
      try {
        const dataBuffer = fs.readFileSync(pdfPath)

        // Use a PDF parsing library to extract text
        const pdfjs = require('pdf-parse')
        const pdfData = await pdfjs(dataBuffer)
        const pdfText = pdfData.text

        // Process the extracted text with OpenAI
        return this.processText(pdfText, prompt)
      } catch (fallbackError) {
        console.error('Fallback method failed:', fallbackError)
        throw error // Throw the original error
      }
    }
  }

  private async convertPdfToImages(pdfPath: string): Promise<string[]> {
    console.log(`[OpenAIProvider] Creating temp directory for PDF images`)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-images-'))
    console.log(`[OpenAIProvider] Temp directory created: ${tempDir}`)

    try {
      // Use pdftoppm to convert PDF to images (requires poppler-utils to be installed)
      console.log(
        `[OpenAIProvider] Executing pdftoppm to convert PDF to images`
      )
      const command = `pdftoppm -png -r 200 "${pdfPath}" "${path.join(
        tempDir,
        'page'
      )}"`
      console.log(`[OpenAIProvider] Command: ${command}`)
      await execAsync(command)

      // Get all generated image files
      const files = fs
        .readdirSync(tempDir)
        .filter((file) => file.endsWith('.png'))
      console.log(
        `[OpenAIProvider] Found ${files.length} image files: ${files.join(
          ', '
        )}`
      )

      const sortedFiles = files.map((file) => path.join(tempDir, file)).sort() // Ensure correct page order
      console.log(
        `[OpenAIProvider] Sorted file paths: ${sortedFiles.join(', ')}`
      )

      // Convert images to base64 data URLs
      console.log(`[OpenAIProvider] Converting images to base64...`)
      const imageUrls = sortedFiles.map((file) => {
        const data = fs.readFileSync(file)
        const base64 = data.toString('base64')
        console.log(
          `[OpenAIProvider] Converted image ${file}, size: ${base64.length} chars`
        )
        return `data:image/png;base64,${base64}`
      })

      console.log(
        `[OpenAIProvider] Returning ${imageUrls.length} base64 image URLs`
      )
      return imageUrls
    } catch (error) {
      console.error('Error converting PDF to images:', error)
      throw error
    }
  }

  getModelInfo(): { provider: string; model: string } {
    return {
      provider: 'openai',
      model: this.config.model || 'gpt-4o',
    }
  }
}
