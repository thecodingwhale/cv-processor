import { exec } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import pdfParse from 'pdf-parse'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Converts a PDF file to base64-encoded PNG images using pdftoppm.
 * Requires poppler-utils to be installed.
 *
 * @param pdfPath - The file path of the PDF to convert
 * @returns A promise that resolves to an array of base64 image data URLs
 */
async function convertPdfToImages(pdfPath: string): Promise<string[]> {
  console.log(`[convertPdfToImages] Creating temp directory for PDF images`)
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-images-'))
  console.log(`[convertPdfToImages] Temp directory created: ${tempDir}`)

  try {
    const command = `pdftoppm -png -r 200 "${pdfPath}" "${path.join(
      tempDir,
      'page'
    )}"`
    console.log(`[convertPdfToImages] Executing command: ${command}`)
    await execAsync(command)

    const files = fs
      .readdirSync(tempDir)
      .filter((file) => file.endsWith('.png'))
    console.log(
      `[convertPdfToImages] Found ${files.length} image files: ${files.join(
        ', '
      )}`
    )

    const sortedFiles = files.map((file) => path.join(tempDir, file)).sort()
    console.log(
      `[convertPdfToImages] Sorted file paths: ${sortedFiles.join(', ')}`
    )

    const imageUrls = sortedFiles.map((file) => {
      const data = fs.readFileSync(file)
      const base64 = data.toString('base64')
      console.log(
        `[convertPdfToImages] Converted image ${file}, size: ${base64.length} chars`
      )
      return `data:image/png;base64,${base64}`
    })

    console.log(
      `[convertPdfToImages] Returning ${imageUrls.length} base64 image URLs`
    )
    return imageUrls
  } catch (error) {
    console.error('[convertPdfToImages] Error converting PDF to images:', error)
    throw error
  }
}

/**
 * Convert PDF to text using pdf-parse
 * @param pdfPath Path to the PDF file
 * @returns Array of text content from each page
 */
export async function convertPdfToTexts(pdfPath: string): Promise<string[]> {
  try {
    // Read the PDF file
    const dataBuffer = fs.readFileSync(pdfPath)

    // Parse the PDF
    const data = await pdfParse(dataBuffer)

    // Split the text into pages
    // Note: pdf-parse doesn't provide direct page separation
    // We'll use a simple heuristic to split pages based on page numbers
    const pages = data.text
      .split(/\n\s*\d+\s*\n/)
      .filter((page: string) => page.trim().length > 0)

    return pages
  } catch (error) {
    console.error('Error converting PDF to text:', error)
    throw error
  }
}

export { convertPdfToImages }
