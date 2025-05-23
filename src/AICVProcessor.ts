import * as fs from 'fs'
import * as path from 'path'
import { CVData, ProcessorOptions } from './types'
import { AIProvider, ConversionType } from './types/AIProvider'
import { ConsensusAccuracyScorer } from './utils/ConsensusAccuracyScorer'
import { EmptinessPercentageCalculator } from './utils/EmptinessPercentageCalculator'
import { convertPdfToImages, convertPdfToTexts } from './utils/document'
import { ReportGenerator } from './utils/reportGenerator'

/**
 * AI-powered CV Processor class to extract structured data from PDF resumes
 */
export class AICVProcessor {
  private aiProvider: AIProvider
  private verbose: boolean
  private instructionsPath: string
  private expectedTotalFields?: number

  // private industryContext: string // Store industry context for patterns

  /**
   * Initialize the AI CV processor
   */
  constructor(aiProvider: AIProvider, options: ProcessorOptions = {}) {
    this.aiProvider = aiProvider
    this.verbose = options.verbose || false
    this.instructionsPath =
      options.instructionsPath || path.join(process.cwd(), 'instructions.txt')
    this.expectedTotalFields = options.expectedTotalFields

    if (this.verbose) {
      console.log('AI CV Processor initialized')
      console.log(`Using instructions from: ${this.instructionsPath}`)
      if (this.expectedTotalFields) {
        console.log(`Expected total fields: ${this.expectedTotalFields}`)
      }
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
   * Estimate token count based on text content
   * This is a fallback when actual token counts aren't available
   */
  private estimateTokenCount(text: string): number {
    // Simple estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4)
  }

  /**
   * Process a CV PDF and extract structured information using AI
   */
  async processCv(
    pdfPath: string,
    conversionType: ConversionType = ConversionType.PdfToImages
  ): Promise<CVData> {
    console.log(`Processing CV with AI: ${pdfPath} (${conversionType})`)

    // Track start time for processing
    const startTime = new Date().getTime()

    try {
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

      let cvData: CVData
      let inputData: string[]

      if (conversionType === ConversionType.PdfToImages) {
        // Convert PDF to images
        inputData = await convertPdfToImages(pdfPath)

        // Use AI to extract structured data from images
        cvData = await this.aiProvider.extractStructuredDataFromImages<CVData>(
          inputData,
          dataSchema,
          instructions
        )
      } else {
        // Convert PDF to text
        inputData = await convertPdfToTexts(pdfPath)

        // Use AI to extract structured data from text
        cvData = await this.aiProvider.extractStructuredDataFromText<CVData>(
          inputData,
          dataSchema,
          instructions
        )
      }

      // Calculate processing time
      const processingTime = (new Date().getTime() - startTime) / 1000
      console.log(
        `[AICVProcessor] Processing completed in ${processingTime.toFixed(
          2
        )} seconds`
      )

      // Add metadata before accuracy evaluation
      cvData.metadata = {
        processedDate: new Date().toISOString(),
        sourceFile: path.basename(pdfPath),
        processingTime: processingTime,
        conversionType: conversionType,
        ...this.aiProvider.getModelInfo(),
      }

      // Add token usage information if available from AI provider
      if (cvData.tokenUsage) {
        cvData.metadata.tokenUsage = {
          inputTokens: cvData.tokenUsage.promptTokens,
          outputTokens: cvData.tokenUsage.completionTokens,
          totalTokens: cvData.tokenUsage.totalTokens,
          estimatedCost: cvData.tokenUsage.estimatedCost,
        }

        if (this.verbose) {
          console.log(
            `[AICVProcessor] Token usage:`,
            cvData.metadata.tokenUsage
          )
        }
      } else {
        // Estimate tokens if not provided by the AI provider
        const estimatedInputTokens = this.estimateTokenCount(
          instructions + JSON.stringify(inputData)
        )
        const estimatedOutputTokens = this.estimateTokenCount(
          JSON.stringify(cvData)
        )

        cvData.metadata.tokenUsage = {
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          totalTokens: estimatedInputTokens + estimatedOutputTokens,
        }

        if (this.verbose) {
          console.log(
            `[AICVProcessor] Estimated token usage:`,
            cvData.metadata.tokenUsage
          )
        }
      }

      // Try to use consensus-based scoring if available
      const consensusScorer = new ConsensusAccuracyScorer()
      const consensusResult = consensusScorer.evaluateAccuracy(cvData)

      console.log(`[AICVProcessor] Accuracy score: ${consensusResult.overall}%`)

      if (this.verbose) {
        console.log(
          `[AICVProcessor] Using consensus-based accuracy from: ${consensusResult.metadata.consensusSource}`
        )
        console.log(
          `[AICVProcessor] Field accuracy: ${consensusResult.fieldAccuracy}%`
        )
        console.log(
          `[AICVProcessor] Completeness: ${consensusResult.completeness}%`
        )
        console.log(
          `[AICVProcessor] Structural fidelity: ${consensusResult.structuralFidelity}%`
        )
      }

      // Use consensus-based accuracy metrics
      cvData.metadata.accuracy = {
        overall: consensusResult.overall,
        fieldAccuracy: consensusResult.fieldAccuracy,
        completeness: consensusResult.completeness,
        structuralFidelity: consensusResult.structuralFidelity,
        missingFields: consensusResult.missingFields,
        consensusSource: consensusResult.metadata.consensusSource,
      }

      // Calculate emptiness percentage
      const emptinessResult =
        EmptinessPercentageCalculator.calculateEmptinessPercentage(
          cvData,
          this.expectedTotalFields
        )
      cvData.metadata.emptinessPercentage = emptinessResult

      // Add standard log message for emptiness percentage score (not conditional on verbose)
      console.log(
        `[AICVProcessor] Emptiness Percentage score: ${emptinessResult.percentage}%`
      )

      if (this.verbose) {
        console.log(
          `[AICVProcessor] Emptiness percentage: ${emptinessResult.percentage}%`
        )
        console.log(
          `[AICVProcessor] Total fields: ${emptinessResult.totalFields}, Non-empty fields: ${emptinessResult.nonEmptyFields}`
        )
        if (emptinessResult.expectedTotalFields) {
          console.log(
            `[AICVProcessor] Expected emptiness percentage: ${emptinessResult.expectedPercentage}% (based on ${emptinessResult.expectedTotalFields} expected fields)`
          )
        }
      }

      return cvData
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

      // Create directory for output if it doesn't exist
      const resultDir = path.join(
        outputDir,
        `${outputBaseName}_${timestamp.split('T')[0]}`
      )
      if (!fs.existsSync(resultDir)) {
        fs.mkdirSync(resultDir, { recursive: true })
      }

      // Save to the directory
      const finalOutputPath = path.join(
        resultDir,
        `${providerName}_${modelName}${processingTime}${outputExt}`
      )

      fs.writeFileSync(finalOutputPath, JSON.stringify(cvData, null, 2))
      console.log(`Results saved to ${finalOutputPath}`)

      // Generate and save a report for this directory
      ReportGenerator.generateAndSaveReport(resultDir, this.verbose)
        .then(() => {
          console.log(`Report generated for ${resultDir}`)
        })
        .catch((error) => {
          console.error(`Error generating report: ${error}`)
        })
    } catch (error) {
      console.error(`Error saving JSON file: ${error}`)
      throw error
    }
  }
}
