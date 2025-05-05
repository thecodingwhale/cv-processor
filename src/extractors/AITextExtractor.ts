import * as fs from 'fs'
import pdfParse from 'pdf-parse'
import { AIProvider } from '../types/AIProvider'

/**
 * Class for extracting text from PDF documents using AI
 */
export class AITextExtractor {
  private aiProvider: AIProvider

  /**
   * Initialize the AI Text Extractor
   */
  constructor(aiProvider: AIProvider) {
    this.aiProvider = aiProvider
  }

  /**
   * Extract text from a PDF file using the AI provider
   */
  async extractTextFromPDF(pdfPath: string): Promise<string> {
    console.log(`Extracting text from PDF with AI: ${pdfPath}`)

    try {
      // Check if the AI provider has direct PDF processing capabilities
      if (this.aiProvider.processPDF) {
        console.log('Using AI provider with direct PDF processing capability')
        const prompt = `
          Please extract all text content from this PDF while maintaining
          the original structure and formatting. Ensure all headers,
          subheaders, section breaks, bullet points, and tables
          are clearly preserved and represented in a readable
          format. Accuracy and completeness are essential, especially
          for any tabular data or structured content
          relevant to HR documentation.        
        `
        const result = await this.aiProvider.processPDF(pdfPath, prompt)
        return result.text
      }

      // Fallback to PDF parsing and then using AI on the text
      console.log('Using PDF parser and then AI processing')
      const dataBuffer = fs.readFileSync(pdfPath)
      const pdfData = await pdfParse(dataBuffer)
      const rawText = pdfData.text

      // Use AI to improve extracted text
      const prompt = `
        Clean and reformat the extracted text
        from this PDF to enhance clarity and readability.
        Preserve the original section divisions, headers,
        bullet points, and any relevant formatting
        such as bold or italic text. Ensure that the
        final output reflects the document’s intended structure,
        making it suitable for HR review or archival.      
      `
      const result = await this.aiProvider.processText(rawText, prompt)
      return result.text
    } catch (error) {
      console.error(`Error extracting text from PDF with AI: ${error}`)
      throw error
    }
  }
}
