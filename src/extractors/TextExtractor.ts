import * as fs from 'fs'
import * as path from 'path'
import pdfParse from 'pdf-parse'
import * as Tesseract from 'tesseract.js'

/**
 * Class for extracting text from PDF documents
 */
export class TextExtractor {
  /**
   * Extract text from a PDF file, with OCR fallback if needed
   */
  async extractTextFromPDF(pdfPath: string): Promise<string> {
    console.log(`Extracting text from PDF: ${pdfPath}`)

    try {
      // Read the PDF file
      const dataBuffer = fs.readFileSync(pdfPath)

      // Parse the PDF
      const pdfData = await pdfParse(dataBuffer)
      const text = pdfData.text

      // Check if we got meaningful text (more than just whitespace)
      if (text.trim().length > 100) {
        // Assuming a CV would have at least 100 chars
        console.log('Successfully extracted text from PDF')
        return text
      }

      // If not much text was extracted, try OCR
      console.log('Not enough text extracted, trying OCR...')
      return this.extractTextWithOCR(pdfPath)
    } catch (error) {
      console.error(`Error extracting text from PDF: ${error}`)
      // Fallback to OCR
      console.log('Falling back to OCR due to error')
      return this.extractTextWithOCR(pdfPath)
    }
  }

  /**
   * Extract text using OCR with Tesseract.js
   * Note: This is a simplified implementation as converting PDF pages to images
   * is more complex in Node.js than in Python
   */
  private async extractTextWithOCR(pdfPath: string): Promise<string> {
    console.log('Starting OCR processing...')

    try {
      // For a production implementation, you would:
      // 1. Convert PDF pages to images using a library like pdf2pic or pdf-poppler
      // 2. Process each image with Tesseract
      // 3. Combine the results

      // This is a simplified placeholder that assumes you have already converted
      // the first page to an image (a full implementation would loop through all pages)
      const pdfName = path.basename(pdfPath, path.extname(pdfPath))
      const imagePath = `${pdfName}_page_1.png`

      // Check if the image exists (in a real implementation, you'd generate this)
      if (!fs.existsSync(imagePath)) {
        console.warn(
          `Image ${imagePath} not found for OCR. Would need PDF to image conversion first.`
        )
        return 'Error: PDF to image conversion required for OCR.'
      }

      // Perform OCR on the image
      const { data } = await Tesseract.recognize(imagePath, 'eng')

      console.log('OCR processing completed')
      return data.text
    } catch (error) {
      console.error(`Error extracting text with OCR: ${error}`)
      return 'Error: Could not extract text from PDF.'
    }
  }
}
