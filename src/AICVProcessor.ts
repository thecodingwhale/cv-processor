import * as fs from 'fs'
import * as path from 'path'
import { CVData, ProcessorOptions } from './types'
import { AIProvider } from './types/AIProvider'
import { AccuracyScorer } from './utils/AccuracyScorer'
import { convertPdfToImages } from './utils/document'

/**
 * AI-powered CV Processor class to extract structured data from PDF resumes
 */
export class AICVProcessor {
  private aiProvider: AIProvider
  private verbose: boolean
  private instructionsPath: string

  // private industryContext: string // Store industry context for patterns

  /**
   * Initialize the AI CV processor
   */
  constructor(aiProvider: AIProvider, options: ProcessorOptions = {}) {
    this.aiProvider = aiProvider
    this.verbose = options.verbose || false
    this.instructionsPath =
      options.instructionsPath || path.join(process.cwd(), 'instructions.txt')

    if (this.verbose) {
      console.log('AI CV Processor initialized')
      console.log(`Using instructions from: ${this.instructionsPath}`)
    }
  }

  /**
   * Load instructions from the specified file
   * Falls back to default instructions if file cannot be read
   */
  private async loadInstructions(): Promise<string | null> {
    try {
      // Check if instructions file exists
      if (fs.existsSync(this.instructionsPath)) {
        const instructions = await fs.promises.readFile(
          this.instructionsPath,
          'utf8'
        )
        if (this.verbose) {
          console.log(
            `Successfully loaded instructions from ${this.instructionsPath}`
          )
        }
        return instructions
      } else {
        console.warn(`Instructions file not found: ${this.instructionsPath}`)
        return null
      }
    } catch (error) {
      console.error(`Error loading instructions file: ${error}`)
      return null
    }
  }

  /**
   * Process a CV PDF and extract structured information using AI
   */
  async processCv(pdfPath: string): Promise<CVData> {
    console.log(`Processing CV with AI: ${pdfPath}`)

    // Track start time for processing
    const startTime = new Date().getTime()

    try {
      const imageUrls = await convertPdfToImages(pdfPath)

      // Define the data schema to match our CVData type
      const dataSchema = {
        type: 'object',
        properties: {
          credits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                projectTitle: { type: 'string' },
                type: { type: 'string' }, // e.g., 'Film', 'TV', 'Commercial', 'Theatre'
                role: { type: 'string' },
                productionCompany: { type: 'string' },
                director: { type: 'string' },
                year: { type: 'string' },
                location: { type: 'string' },
                link: { type: 'string' }, // optional trailer or scene
              },
            },
          },
        },
      }

      // Load instructions from file
      const instructions = await this.loadInstructions()
      if (!instructions) {
        throw new Error('No instructions found')
      }

      try {
        // Use AI to extract structured data
        const cvData = await this.aiProvider.extractStructuredData<CVData>(
          imageUrls,
          dataSchema,
          instructions
        )

        // Calculate processing time
        const processingTime = (new Date().getTime() - startTime) / 1000
        console.log(
          `[AICVProcessor] Processing completed in ${processingTime.toFixed(
            2
          )} seconds`
        )

        // Evaluate accuracy of the extracted data
        const accuracyResult = AccuracyScorer.evaluateAccuracy(cvData)
        console.log(
          `[AICVProcessor] Accuracy score: ${accuracyResult.overall}%`
        )

        if (this.verbose) {
          console.log(
            `[AICVProcessor] Category assignment: ${accuracyResult.categoryAssignment}%`
          )
          console.log(
            `[AICVProcessor] Completeness: ${accuracyResult.completeness}%`
          )
          console.log(
            `[AICVProcessor] Structural validity: ${accuracyResult.structuralValidity}%`
          )
          if (accuracyResult.missingFields.length > 0) {
            console.log(
              `[AICVProcessor] Missing fields: ${accuracyResult.missingFields.join(
                ', '
              )}`
            )
          }
        }

        // Add metadata
        cvData.metadata = {
          processedDate: new Date().toISOString(),
          sourceFile: path.basename(pdfPath),
          processingTime: processingTime,
          accuracy: accuracyResult,
          ...this.aiProvider.getModelInfo(),
        }

        return cvData
      } catch (error) {
        console.error(`Error processing CV: ${error}`)
        throw error
      }
    } catch (error) {
      console.error(`Error processing CV: ${error}`)
      throw error
    }
  }

  /**
   * Save CV data to a JSON file
   */
  saveToJson(cvData: CVData, outputPath: string): void {
    try {
      // Generate a filename that includes provider, model, and timestamp
      const timestamp = new Date()
        .toISOString()
        .replace(/:/g, '-')
        .replace(/\./g, '-')
      const providerName = cvData.metadata?.provider || 'unknown'
      const modelName = cvData.metadata?.model || 'unknown'
      const processingTime = cvData.metadata?.processingTime
        ? `_${cvData.metadata.processingTime.toFixed(2)}s`
        : ''

      // Extract base path and extension
      const outputDir = path.dirname(outputPath)
      const outputBaseName = path.basename(outputPath, path.extname(outputPath))
      const outputExt = path.extname(outputPath)

      // Create filename with provider, model, timestamp and processing time
      const newOutputPath = path.join(
        outputDir,
        `${outputBaseName}_${providerName}_${modelName}${processingTime}_${timestamp}${outputExt}`
      )

      fs.writeFileSync(newOutputPath, JSON.stringify(cvData, null, 2))
      console.log(`Results saved to ${newOutputPath}`)
    } catch (error) {
      console.error(`Error saving JSON file: ${error}`)
      throw error
    }
  }
}
