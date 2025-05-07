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
  TokenUsageInfo,
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

      // Calculate token usage and estimated cost
      const tokenUsage = this.calculateTokenUsage(
        completion.usage?.prompt_tokens || 0,
        completion.usage?.completion_tokens || 0
      )

      return {
        text: completion.choices[0]?.message?.content || '',
        tokenUsage,
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
  ): Promise<T & { tokenUsage?: TokenUsageInfo }> {
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

      // Calculate token usage and estimated cost
      const tokenUsage = this.calculateTokenUsage(
        completion.usage?.prompt_tokens || 0,
        completion.usage?.completion_tokens || 0
      )

      try {
        // Try to parse the JSON response
        const parsedResponse = JSON.parse(responseText) as T

        return {
          ...parsedResponse,
          tokenUsage,
        }
      } catch (jsonError) {
        console.error('Error parsing JSON from OpenAI response:', jsonError)

        // Try to repair the JSON
        const repairedJson = this.repairJSON(responseText)

        try {
          // Try to parse the repaired JSON
          const parsedResponse = JSON.parse(repairedJson) as T
          console.log('Successfully repaired JSON response')

          return {
            ...parsedResponse,
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

      // Calculate token usage
      const tokenUsage = this.calculateTokenUsage(
        completion.usage?.prompt_tokens || 0,
        completion.usage?.completion_tokens || 0
      )

      return {
        text: completion.choices[0]?.message?.content || '',
        tokenUsage,
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
        console.log(
          `[OpenAIProvider] Extracted ${pdfText.length} characters of text from PDF, processing with API`
        )
        return this.processText(pdfText, prompt)
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

  /**
   * Calculate token usage and estimated cost
   * @param promptTokens Number of tokens in the prompt
   * @param completionTokens Number of tokens in the completion
   * @returns TokenUsageInfo object with usage details
   */
  private calculateTokenUsage(
    promptTokens: number,
    completionTokens: number
  ): TokenUsageInfo {
    const totalTokens = promptTokens + completionTokens

    // Calculate estimated cost based on the model
    // These rates should be updated if OpenAI changes their pricing
    let estimatedCost = 0
    const model = this.config.model || 'gpt-4o'

    if (model.includes('gpt-4o')) {
      // GPT-4o pricing (as of mid-2024)
      estimatedCost =
        (promptTokens / 1000) * 0.005 + (completionTokens / 1000) * 0.015
    } else if (model.includes('gpt-4')) {
      // GPT-4 pricing
      estimatedCost =
        (promptTokens / 1000) * 0.03 + (completionTokens / 1000) * 0.06
    } else if (model.includes('gpt-3.5')) {
      // GPT-3.5 pricing
      estimatedCost =
        (promptTokens / 1000) * 0.0005 + (completionTokens / 1000) * 0.0015
    }

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost,
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
   * Last resort: retry the API call with explicit instructions for valid JSON
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
      const completion = await this.openai.chat.completions.create({
        model: this.config.model || 'gpt-4o',
        temperature: this.config.temperature || 0.1, // Lower temperature for more precise output
        max_tokens: this.config.maxTokens || 4096,
        response_format: { type: 'json_object' },
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
      })

      const retryText = completion.choices[0]?.message?.content || '{}'

      // Calculate token usage for the retry request
      const retryTokenUsage = this.calculateTokenUsage(
        completion.usage?.prompt_tokens || 0,
        completion.usage?.completion_tokens || 0
      )

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
}
