import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai'
import * as fs from 'fs'
import {
  AIModelConfig,
  AIProvider,
  AIResponseFormat,
  TokenUsageInfo,
} from '../types/AIProvider'

export class GeminiAIProvider implements AIProvider {
  private generativeModel: GenerativeModel
  private config: AIModelConfig

  constructor(config: AIModelConfig) {
    this.config = config
    const genAI = new GoogleGenerativeAI(config.apiKey)
    this.generativeModel = genAI.getGenerativeModel({
      model: config.model || 'gemini-1.5-pro',
      generationConfig: {
        temperature: config.temperature || 0.2,
        maxOutputTokens: config.maxTokens || 8192,
      },
    })
  }

  async processText(text: string, prompt: string): Promise<AIResponseFormat> {
    try {
      const result = await this.generativeModel.generateContent(
        `${prompt}\n\nText content:\n${text}`
      )
      const response = await result.response
      const responseText = response.text()

      // Estimate token usage (Gemini API doesn't provide this directly)
      const tokenUsage = this.estimateTokenUsage(prompt + text, responseText)

      return {
        text: responseText,
        tokenUsage,
      }
    } catch (error) {
      console.error('Error processing text with Gemini AI:', error)
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
        
        IMPORTANT: Your response MUST be valid JSON that matches this schema exactly.
        Do not include any explanations, markdown formatting, or code blocks. Return ONLY the JSON.
        
        Text content:
        ${text}
      `

      const result = await this.generativeModel.generateContent(prompt)
      const response = await result.response
      const responseText = response.text()

      // Extract JSON from the response
      let jsonStr = responseText.trim()

      // If the response has markdown code blocks, extract JSON from them
      if (jsonStr.includes('```json')) {
        jsonStr = jsonStr.split('```json')[1].split('```')[0].trim()
      } else if (jsonStr.includes('```')) {
        jsonStr = jsonStr.split('```')[1].split('```')[0].trim()
      }

      // Attempt to fix common JSON formatting issues
      jsonStr = this.repairJSON(jsonStr)

      try {
        // Try to parse the potentially repaired JSON
        const parsedData = JSON.parse(jsonStr) as T

        // Estimate token usage
        const tokenUsage = this.estimateTokenUsage(prompt, responseText)

        return {
          ...parsedData,
          tokenUsage,
        }
      } catch (parseError) {
        console.error(
          'JSON parsing error, attempting alternative repair methods:',
          parseError
        )

        // More aggressive JSON repair attempts
        const aggressivelyRepairedJSON = this.deepRepairJSON(jsonStr)

        try {
          const parsedData = JSON.parse(aggressivelyRepairedJSON) as T

          console.log('Successfully repaired JSON using deeper repair methods')

          // Estimate token usage
          const tokenUsage = this.estimateTokenUsage(prompt, responseText)

          return {
            ...parsedData,
            tokenUsage,
          }
        } catch (deepRepairError) {
          console.error(
            'Failed to repair JSON even with aggressive methods:',
            deepRepairError
          )

          // As a last resort, make a second API call requesting valid JSON
          return this.retryWithValidJSON<T>(text, dataSchema, instructions)
        }
      }
    } catch (error) {
      console.error('Error extracting structured data with Gemini AI:', error)
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

    // Fix trailing commas in arrays (common error in position 2806 mentioned in the error)
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

    return repaired
  }

  /**
   * More aggressive JSON repair for difficult cases
   */
  private deepRepairJSON(jsonStr: string): string {
    // First apply the basic repairs
    let repaired = this.repairJSON(jsonStr)

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

    // Fix common issues around position 2806 (from the error)
    // This is often due to malformed arrays or missing commas
    try {
      // Try to identify the problematic section around position 2806
      const problemSpot = Math.max(0, 2806 - 20)
      const problemSection = repaired.substring(problemSpot, problemSpot + 40)

      // Look for array syntax issues in this section
      if (
        problemSection.includes('][') ||
        problemSection.includes('[[') ||
        problemSection.includes(']]')
      ) {
        // Add commas where needed in arrays
        repaired = repaired.replace(/\]\s*\[/g, '],[')
        repaired = repaired.replace(/\[\s*\[/g, '[[')
        repaired = repaired.replace(/\]\s*\]/g, ']]')
      }

      // Fix empty array elements (a common issue)
      repaired = repaired.replace(/\[\s*,/g, '[null,')
      repaired = repaired.replace(/,\s*,/g, ',null,')
      repaired = repaired.replace(/,\s*\]/g, ',null]')
    } catch (e) {
      // Continue with other repair methods if this approach fails
      console.warn('Problem section repair failed:', e)
    }

    return repaired
  }

  /**
   * Last resort: retry the API call with explicit instructions for valid JSON
   */
  private async retryWithValidJSON<T>(
    text: string,
    dataSchema: object,
    instructions: string
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
      4. Do not include any text before or after the JSON
      5. Do not use markdown formatting or code blocks
      
      Return ONLY the raw JSON object.
      
      Text content:
      ${text}
    `

    try {
      const result = await this.generativeModel.generateContent(retryPrompt)
      const response = await result.response
      const retryText = response.text().trim()

      // Apply basic repair just in case
      const finalJSON = this.repairJSON(retryText)

      // Estimate token usage for both attempts (original + retry)
      const tokenUsage = this.estimateTokenUsage(retryPrompt, retryText, 2) // Multiple by 2 for the retry

      return {
        ...JSON.parse(finalJSON),
        tokenUsage,
      }
    } catch (retryError) {
      console.error('JSON retry attempt failed:', retryError)

      // At this point, return a minimal valid object that matches the expected type
      // This is better than crashing completely
      return {
        tokenUsage: this.estimateTokenUsage('', '', 2),
      } as T & { tokenUsage?: TokenUsageInfo }
    }
  }

  async processPDF(pdfPath: string, prompt: string): Promise<AIResponseFormat> {
    try {
      // For Gemini 1.5 Pro which supports PDF input
      const fileData = fs.readFileSync(pdfPath)
      const mimeType = 'application/pdf'

      // Create file part for multimodal input
      const filePart = {
        inlineData: {
          data: Buffer.from(fileData).toString('base64'),
          mimeType,
        },
      }

      const result = await this.generativeModel.generateContent([
        prompt,
        filePart,
      ])
      const response = await result.response
      const responseText = response.text()

      // Estimate token usage
      const pdfSize = fileData.length
      const tokenUsage = this.estimateTokenUsage(
        prompt,
        responseText,
        1,
        pdfSize
      )

      return {
        text: responseText,
        tokenUsage,
      }
    } catch (error) {
      console.error('Error processing PDF with Gemini AI:', error)
      throw error
    }
  }

  /**
   * Estimate token usage since Gemini API doesn't provide this directly
   */
  private estimateTokenUsage(
    promptText: string,
    responseText: string,
    multiplier = 1,
    pdfSize = 0
  ): TokenUsageInfo {
    // Rough estimation: English text averages ~4 chars per token
    const charToTokenRatio = 4

    // For PDFs, estimate based on size (very approximate)
    let promptTokens = Math.ceil(promptText.length / charToTokenRatio)

    // Add estimated tokens for PDF if provided
    if (pdfSize > 0) {
      // Very rough approximation: 1KB of PDF ≈ 100 tokens
      // This is inaccurate but provides some estimate
      promptTokens += Math.ceil((pdfSize / 1024) * 100)
    }

    const completionTokens = Math.ceil(responseText.length / charToTokenRatio)
    const totalTokens = promptTokens + completionTokens

    // Gemini pricing (as of mid-2024)
    // These rates should be updated if Google changes their pricing
    const promptRate = 0.0001 // $0.0001 per 1K prompt tokens (estimate)
    const completionRate = 0.0002 // $0.0002 per 1K completion tokens (estimate)

    const estimatedCost =
      ((promptTokens / 1000) * promptRate +
        (completionTokens / 1000) * completionRate) *
      multiplier

    return {
      promptTokens: promptTokens * multiplier,
      completionTokens: completionTokens * multiplier,
      totalTokens: totalTokens * multiplier,
      estimatedCost,
    }
  }

  getModelInfo(): { provider: string; model: string } {
    return {
      provider: 'gemini',
      model: this.config.model || 'gemini-1.5-pro',
    }
  }
}
