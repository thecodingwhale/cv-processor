import * as fs from 'fs'
import { AIProvider, TokenUsageInfo } from '../types/AIProvider'

/**
 * Class for extracting text from PDFs using AI models
 */
export class AITextExtractor {
  private aiProvider: AIProvider
  private tokenUsage: TokenUsageInfo = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
  }

  /**
   * Initialize the AI Text Extractor
   */
  constructor(aiProvider: AIProvider) {
    this.aiProvider = aiProvider
  }

  /**
   * Extract text from PDF file using AI
   */
  async extractTextFromPDF(pdfPath: string): Promise<string> {
    try {
      // Check if file exists
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file does not exist: ${pdfPath}`)
      }

      // Set up a prompt for CV extraction
      const prompt = `
        Extract all text from this PDF CV/resume. 
        Preserve the structure and formatting as much as possible.
        Include all sections, headings, dates, job titles, companies, skills, education, etc.
        Maintain the hierarchical structure of the document.
      `

      // Check if provider supports direct PDF processing
      if (this.aiProvider.processPDF) {
        console.log('Using direct PDF processing with AI provider')
        const response = await this.aiProvider.processPDF(pdfPath, prompt)

        // Track token usage
        if (response.tokenUsage) {
          this.addTokenUsage(response.tokenUsage)
        }

        return response.text
      }

      // If we get here, we need to use a fallback approach
      throw new Error('PDF processing not supported by this AI provider')
    } catch (error) {
      console.error(`Error in extractTextFromPDF: ${error}`)
      throw error
    }
  }

  /**
   * Add token usage from a response to the running total
   */
  private addTokenUsage(usage: TokenUsageInfo): void {
    this.tokenUsage.promptTokens += usage.promptTokens || 0
    this.tokenUsage.completionTokens += usage.completionTokens || 0
    this.tokenUsage.totalTokens += usage.totalTokens || 0
    this.tokenUsage.estimatedCost =
      (this.tokenUsage.estimatedCost || 0) + (usage.estimatedCost || 0)
  }

  /**
   * Get token usage statistics
   */
  getTokenUsage(): TokenUsageInfo {
    return { ...this.tokenUsage }
  }

  /**
   * Reset token usage statistics
   */
  resetTokenUsage(): void {
    this.tokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
    }
  }
}
