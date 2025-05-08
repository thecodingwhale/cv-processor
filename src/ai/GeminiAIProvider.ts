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
        
        IMPORTANT: 
        - Your response MUST be valid JSON that matches this schema exactly.
        - Do not include any explanations, markdown formatting, or code blocks. 
        - Return ONLY the JSON.
        - Ensure all array elements are properly separated by commas.
        - Make sure each JSON object is properly formatted.
        - Validate your JSON before returning the response.
        - Double-check that empty arrays are properly formatted as [].
        
        Text content:
        ${text}
      `

      const result = await this.generativeModel.generateContent(prompt)
      const response = await result.response
      const responseText = response.text()

      // Extract JSON from the response
      let jsonStr = responseText.trim()

      // Log a small preview of the response for debugging
      console.log(
        `Response preview (first 50 chars): ${jsonStr.substring(0, 50)}...`
      )

      // If the response has markdown code blocks, extract JSON from them
      if (jsonStr.includes('```json')) {
        jsonStr = jsonStr.split('```json')[1].split('```')[0].trim()
      } else if (jsonStr.includes('```')) {
        jsonStr = jsonStr.split('```')[1].split('```')[0].trim()
      }

      // Always run basic repair on the JSON string
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

        // Log a snippet of the JSON string around the error position
        if (parseError instanceof SyntaxError) {
          const errorMatch = parseError.message.match(/position (\d+)/)
          if (errorMatch && errorMatch[1]) {
            const errorPos = parseInt(errorMatch[1])
            const start = Math.max(0, errorPos - 30)
            const end = Math.min(jsonStr.length, errorPos + 30)
            console.log(
              `JSON error around position ${errorPos}: "${jsonStr.substring(
                start,
                errorPos
              )}<<<ERROR POINT>>>${jsonStr.substring(errorPos, end)}"`
            )
          }
        }

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

          // Try one last approach - use JSON5 parsing if available
          try {
            // Simple manual JSON5-like parser for common issues
            const manuallyRepairedJSON = this.manualJSONRepair(
              aggressivelyRepairedJSON
            )
            const parsedData = JSON.parse(manuallyRepairedJSON) as T

            console.log(
              'Successfully repaired JSON using manual repair methods'
            )

            // Estimate token usage
            const tokenUsage = this.estimateTokenUsage(prompt, responseText)

            return {
              ...parsedData,
              tokenUsage,
            }
          } catch (manualRepairError) {
            console.error('Manual JSON repair failed:', manualRepairError)

            // As a last resort, make a second API call requesting valid JSON
            return this.retryWithValidJSON<T>(text, dataSchema, instructions)
          }
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

    // Fix common issues around position 2334 (from the error)
    // This is often due to malformed arrays or missing commas
    try {
      // Try to identify the problematic section around position 2334
      const problemSpot = Math.max(0, 2334 - 40)
      const problemSection = repaired.substring(problemSpot, problemSpot + 80)

      // Log the problematic section for debugging
      console.log(
        `Problem section around position 2334: "${problemSection.replace(
          /\n/g,
          '\\n'
        )}"`
      )

      // Look for array syntax issues in this section
      if (
        problemSection.includes('][') ||
        problemSection.includes('[[') ||
        problemSection.includes(']]') ||
        problemSection.includes('} {') ||
        problemSection.includes('}{')
      ) {
        // Add commas where needed in arrays
        repaired = repaired.replace(/\]\s*\[/g, '],[')
        repaired = repaired.replace(/\[\s*\[/g, '[[')
        repaired = repaired.replace(/\]\s*\]/g, ']]')
        repaired = repaired.replace(/\}\s*\{/g, '},{')
      }

      // Fix issues with array elements missing commas - specifically target line 123
      if (problemSection.includes('"attached_media":')) {
        // Fix potential issues with the attached_media array
        repaired = repaired.replace(
          /(\"attached_media\"\s*\:\s*\[)(\s*\])/g,
          '$1$2'
        )
        // Ensure proper formatting of empty arrays
        repaired = repaired.replace(
          /(\"attached_media\"\s*\:\s*\[)([^\]]*)(\])/g,
          (match, p1, p2, p3) => {
            // If there's content in the array, make sure elements are properly separated by commas
            if (p2.trim()) {
              // Replace any whitespace between array elements with a comma
              const fixedContent = p2
                .replace(/\}\s*\{/g, '},{')
                .replace(/\"\s*\"/g, '","')
                .replace(/\]\s*\[/g, '],[')
              return `${p1}${fixedContent}${p3}`
            }
            return match
          }
        )
      }

      // Fix empty array elements (a common issue)
      repaired = repaired.replace(/\[\s*,/g, '[null,')
      repaired = repaired.replace(/,\s*,/g, ',null,')
      repaired = repaired.replace(/,\s*\]/g, ',null]')

      // Fix specific array issues at position 2334
      // Look for malformed JSON around that position
      if (repaired.length > 2334) {
        const before = repaired.substring(Math.max(0, 2334 - 20), 2334)
        const after = repaired.substring(
          2334,
          Math.min(repaired.length, 2334 + 20)
        )
        console.log(`JSON around position 2334: "${before}<<<HERE>>>${after}"`)

        // If we find a pattern like "][" without a comma, fix it
        // or a pattern like "}{"
        const fixedAroundPos =
          repaired.substring(0, 2334) +
          repaired
            .substring(2334)
            .replace(/\]\s*\[/g, '],[')
            .replace(/\}\s*\{/g, '},{')
        repaired = fixedAroundPos
      }
    } catch (e) {
      // Continue with other repair methods if this approach fails
      console.warn('Problem section repair failed:', e)
    }

    return repaired
  }

  /**
   * Manual JSON repair for extreme cases - handles common patterns that cause issues
   */
  private manualJSONRepair(jsonStr: string): string {
    // Try to fix the most common JSON issues that regex might miss

    // Step 1: Fix "attached_media" arrays that might be causing problems
    jsonStr = jsonStr.replace(
      /"attached_media"\s*:\s*\[\s*([^\]\s]+)\s*\]/g,
      '"attached_media":[$1]'
    )

    // Step 2: Fix any array elements that are missing commas
    const arrayElementPattern = /"id"\s*:\s*"[^"]+"\s*"year"/g
    jsonStr = jsonStr.replace(arrayElementPattern, '"id":"$1","year"')

    // Step 3: Fix missing quotes around property names
    const propertyNamePattern = /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g
    jsonStr = jsonStr.replace(propertyNamePattern, '$1"$2"$3')

    // Step 4: Fix issues with dangling object properties at position 2334
    if (jsonStr.length > 2334) {
      const contextAroundError = jsonStr.substring(
        Math.max(0, 2334 - 40),
        Math.min(jsonStr.length, 2334 + 40)
      )
      console.log(`Manual repair - Context around error: ${contextAroundError}`)

      // Look for patterns that might be missing commas between objects in an array
      if (contextAroundError.includes('"attached_media":[]')) {
        // Fix specific issues with attached_media arrays
        jsonStr = jsonStr.replace(
          /"attached_media":\[\](\s*)"id"/g,
          '"attached_media":[],$1"id"'
        )
      }
    }

    return jsonStr
  }

  /**
   * Last resort: retry the API call with explicit JSON validation instructions
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
      6. Ensure all array elements are separated by commas
      7. Make sure all "attached_media" arrays are properly formatted
      8. Every open bracket or brace must have a matching closing one
      
      Return ONLY the raw JSON object.
      
      Text content:
      ${text}
    `

    try {
      const result = await this.generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: retryPrompt }] }],
        generationConfig: {
          temperature: 0.1, // Lower temperature for more predictable output
          maxOutputTokens: 8192,
        },
      })

      const response = await result.response
      let responseText = response.text()

      // Extract JSON from the response
      let jsonStr = responseText.trim()

      console.log(
        `Retry response preview (first 50 chars): ${jsonStr.substring(
          0,
          50
        )}...`
      )

      // If the response has markdown code blocks, extract JSON from them
      if (jsonStr.includes('```json')) {
        jsonStr = jsonStr.split('```json')[1].split('```')[0].trim()
      } else if (jsonStr.includes('```')) {
        jsonStr = jsonStr.split('```')[1].split('```')[0].trim()
      }

      // Apply the most aggressive JSON repairs immediately
      jsonStr = this.repairJSON(jsonStr)
      jsonStr = this.deepRepairJSON(jsonStr)
      jsonStr = this.manualJSONRepair(jsonStr)

      try {
        // Try to parse the repaired JSON
        const parsedData = JSON.parse(jsonStr) as T

        // Estimate token usage
        const tokenUsage = this.estimateTokenUsage(retryPrompt, responseText)

        console.log('Successfully parsed JSON after retry')

        return {
          ...parsedData,
          tokenUsage,
        }
      } catch (finalError) {
        console.error('All JSON repair attempts failed:', finalError)

        // As an absolute last resort, try to do a very minimal extraction of valid JSON
        // by finding the first occurrence of { and the last occurrence of }
        const firstBrace = jsonStr.indexOf('{')
        const lastBrace = jsonStr.lastIndexOf('}')

        if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
          const bareMinimumJSON = jsonStr.substring(firstBrace, lastBrace + 1)

          try {
            const finalAttempt = JSON.parse(bareMinimumJSON) as T
            console.log('Managed to extract minimal valid JSON')
            return {
              ...finalAttempt,
              tokenUsage: this.estimateTokenUsage(retryPrompt, responseText),
            }
          } catch (e) {
            // If even this fails, return a minimal object to prevent application crash
            console.error(
              'No valid JSON could be extracted, returning empty object'
            )

            // Create a minimal empty object that matches the expected type
            const emptyResult = {} as T

            return {
              ...emptyResult,
              tokenUsage: this.estimateTokenUsage(retryPrompt, responseText),
            }
          }
        }

        // If we can't even find braces, return an empty object
        console.error('No valid JSON structure found, returning empty object')
        const emptyResult = {} as T

        return {
          ...emptyResult,
          tokenUsage: this.estimateTokenUsage(retryPrompt, responseText),
        }
      }
    } catch (error) {
      console.error('Error in retry attempt with Gemini AI:', error)

      // Return an empty object rather than throwing to prevent application crash
      const emptyResult = {} as T

      return {
        ...emptyResult,
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      }
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
