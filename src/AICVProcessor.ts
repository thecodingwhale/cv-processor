import * as fs from 'fs'
import * as path from 'path'
import { CVData, ProcessorOptions, TokenUsage } from './types'
import { AIProvider, TokenUsageInfo } from './types/AIProvider'
import { AccuracyCalculator } from './utils/AccuracyCalculator'
import { NullBasedAccuracyCalculator } from './utils/NullBasedAccuracyCalculator'
import { convertPdfToImages } from './utils/document'

// Define the type for accuracy calculator
type AccuracyCalculatorType = 'traditional' | 'null-based'

/**
 * AI-powered CV Processor class to extract structured data from PDF resumes
 */
export class AICVProcessor {
  private aiProvider: AIProvider

  private accuracyCalculator: AccuracyCalculator | NullBasedAccuracyCalculator
  private verbose: boolean
  private minAccuracyThreshold: number
  private tokenUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
  }
  // private industryContext: string // Store industry context for patterns

  /**
   * Initialize the AI CV processor
   */
  constructor(
    aiProvider: AIProvider,
    options: ProcessorOptions & {
      accuracyCalculatorType?: AccuracyCalculatorType
    } = {}
  ) {
    this.aiProvider = aiProvider

    // Initialize the appropriate accuracy calculator
    if (options.accuracyCalculatorType === 'null-based') {
      this.accuracyCalculator = new NullBasedAccuracyCalculator(options)
    } else {
      this.accuracyCalculator = new AccuracyCalculator(options)
    }
    this.verbose = options.verbose || false
    this.minAccuracyThreshold = options.minAccuracyThreshold || 70

    if (this.verbose) {
      console.log('AI CV Processor initialized')
      console.log(
        `Using ${
          options.accuracyCalculatorType || 'traditional'
        } accuracy calculator`
      )
    }
  }

  /**
   * Process a CV PDF and extract structured information using AI
   */
  async processCv(pdfPath: string): Promise<CVData> {
    console.log(`Processing CV with AI: ${pdfPath}`)

    try {
      // Reset token usage for this processing job
      this.resetTokenUsage()

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

      // Create a prompt that incorporates industry context and any patterns detected
      const instructions = `
        You are an AI data extractor for an actor's resume system. I will provide you the full text of an actor's resume (from PDF). Your task is to extract and convert the credits into a structured JSON object matching this schema:

        {
          "resume": [
            {
              "category": "<Category>", // MUST be one of these official categories
              "category_id": "<UUIDv4>", // always generate a new UUIDv4 for each unique category
              "credits": [
                {
                  "id": "<UUIDv4>", // always generate a new UUIDv4 for each credit
                  "year": "YYYY",
                  "title": "<Title of Production>",
                  "role": "<Role>",
                  "director": "<Director Name>",
                  "attached_media": [] // leave as empty array
                }
              ]
            },
            ...
          ],
          "resume_show_years": true
        }

        ✅ Official allowed categories:
        ["Commercial", "Film", "Television", "Theatre", "Print / Fashion", "Training", "Voice", "Stunt", "Corporate", "MC/Presenting", "Extras", "Other"]

        Categorization rules:

        - Only classify credits under these official categories.
        - Map synonyms, similar phrases, and related wording **logically to the closest matching official category.** For example:
          (e.g., "Voice Over" → "Voice", "Feature Film" → "Film", "Stage" → "Theatre", "Presenter" → "MC/Presenting")
        - Always prioritize semantic meaning over literal wording.
        - If a credit cannot be confidently mapped → assign it under "Other".
        - Never invent a new category outside the official list.

        ✅ Extraction rules:

        - Extract **only credits (roles and productions)** → ignore sections like Profile, Notes, Skills, Memberships.
        - Group credits under their respective categories.
        - Each unique category must have its own unique 'category_id' (UUIDv4).
        - Each credit must have its own unique 'id' (UUIDv4).
        - If director name is missing → set '"director": ""'.
        - Remove duplicate credits.
        - Keep credits **grouped by category** and in chronological order (if possible).
        - Do not include empty categories (categories with no credits).

        Example input from resume:
        2023
        Voice Over Narrator Aussie Truck Rehab Discovery Channel Roger Power

        Expected output:
        {
        "category": "Voice",
        "category_id": "f70d3ec4-3e90-4238-b129-032de7f0aa9d",
        "credits": [
        {
        "id": "b493c51b-7fbd-4f6a-83d7-5f4238f7ee4a",
        "year": "2023",
        "title": "Aussie Truck Rehab",
        "role": "Narrator",
        "director": "Roger Power",
        "attached_media": []
        }
        ]
        }

        ✅ Final output: a **single JSON object following the schema**, containing all credits grouped per category, all IDs generated as UUIDv4.
      `

      try {
        // Use AI to extract structured data
        const cvData = await this.aiProvider.extractStructuredData<CVData>(
          imageUrls,
          dataSchema,
          instructions
        )

        // Add token usage from the main extraction
        if (cvData.tokenUsage) {
          this.addTokenUsageFromResponse(cvData.tokenUsage)
          delete cvData.tokenUsage // Remove it from the cvData as we'll add our aggregated version
        }

        // Create default objects if any are missing
        if (!cvData.personalInfo)
          cvData.personalInfo = {
            name: null,
            email: null,
            phone: null,
            location: null,
            linkedin: null,
            github: null,
          }
        if (!cvData.education) cvData.education = []
        if (!cvData.experience) cvData.experience = []
        if (!cvData.skills) cvData.skills = {}

        // Add metadata
        cvData.metadata = {
          processedDate: new Date().toISOString(),
          sourceFile: path.basename(pdfPath),
          ...this.aiProvider.getModelInfo(),
        }

        // Add token usage information to the result
        cvData.tokenUsage = this.getTokenUsage()

        // NOTE: Accuracy calculation moved to saveToJson method
        // to ensure it's calculated on the final processed data

        return cvData
      } catch (error) {
        if (this.verbose) {
          console.error('Error parsing JSON response:', error)
        }
        return {
          personalInfo: {
            name: null,
            email: null,
            phone: null,
            location: null,
            linkedin: null,
            github: null,
          },
          education: [],
          experience: [],
          skills: {},
          tokenUsage: this.getTokenUsage(),
          metadata: {
            processedDate: new Date().toISOString(),
            sourceFile: path.basename(pdfPath),
            ...this.aiProvider.getModelInfo(),
            error: error instanceof Error ? error.message : String(error),
          },
        }
      }
    } catch (error) {
      console.error(`Error processing CV: ${error}`)
      return {
        personalInfo: {
          name: null,
          email: null,
          phone: null,
          location: null,
          linkedin: null,
          github: null,
        },
        education: [],
        experience: [],
        skills: {},
        tokenUsage: this.getTokenUsage(),
        metadata: {
          processedDate: new Date().toISOString(),
          sourceFile: path.basename(pdfPath),
          error: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }

  /**
   * Add token usage from a response to the running total
   */
  private addTokenUsageFromResponse(usage?: TokenUsageInfo): void {
    if (!usage) return
    this.tokenUsage.promptTokens += usage.promptTokens || 0
    this.tokenUsage.completionTokens += usage.completionTokens || 0
    this.tokenUsage.totalTokens += usage.totalTokens || 0
    this.tokenUsage.estimatedCost =
      (this.tokenUsage.estimatedCost || 0) + (usage.estimatedCost || 0)
  }

  /**
   * Reset token usage statistics
   */
  private resetTokenUsage(): void {
    this.tokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
    }
  }

  /**
   * Get current token usage
   */
  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage }
  }

  /**
   * Save CV data to a JSON file
   */
  saveToJson(cvData: CVData, outputPath: string): void {
    try {
      // Calculate accuracy score on the final processed data
      // This ensures the accuracy reflects the data as it will be saved
      cvData.accuracy = this.accuracyCalculator.calculateAccuracy(cvData)

      // Test if it meets accuracy threshold
      const meetsThreshold = this.meetsAccuracyThreshold(cvData)
      if (!meetsThreshold && this.verbose) {
        console.warn(
          `CV does not meet minimum accuracy threshold of ${this.minAccuracyThreshold}%`
        )
      }

      // Generate a filename that includes provider, model, and timestamp
      const timestamp = new Date()
        .toISOString()
        .replace(/:/g, '-')
        .replace(/\./g, '-')
      const providerName = cvData.metadata?.provider || 'unknown'
      const modelName = cvData.metadata?.model || 'unknown'

      // Extract base path and extension
      const outputDir = path.dirname(outputPath)
      const outputBaseName = path.basename(outputPath, path.extname(outputPath))
      const outputExt = path.extname(outputPath)

      // Create filename with provider, model, and timestamp
      const newOutputPath = path.join(
        outputDir,
        `${outputBaseName}_${providerName}_${modelName}_${timestamp}${outputExt}`
      )

      fs.writeFileSync(newOutputPath, JSON.stringify(cvData, null, 2))
      console.log(`Results saved to ${newOutputPath}`)

      // Log accuracy information if available
      if (cvData.accuracy) {
        console.log(`CV Accuracy: ${cvData.accuracy.score}%`)
        if (!this.accuracyCalculator.meetsThreshold(cvData.accuracy)) {
          console.warn(
            `Warning: This CV scored below the minimum accuracy threshold (${this.minAccuracyThreshold}%)`
          )
        }
      }
    } catch (error) {
      console.error(`Error saving JSON file: ${error}`)
      throw error
    }
  }

  /**
   * Check if the CV meets the minimum accuracy threshold
   */
  meetsAccuracyThreshold(cvData: CVData): boolean {
    if (!cvData.accuracy) {
      return false
    }

    return this.accuracyCalculator.meetsThreshold(cvData.accuracy)
  }

  /**
   * Set the minimum accuracy threshold
   */
  setMinAccuracyThreshold(threshold: number): void {
    this.minAccuracyThreshold = threshold
  }

  /**
   * Change the accuracy calculator type
   */
  changeAccuracyCalculator(
    type: AccuracyCalculatorType,
    options: ProcessorOptions = {}
  ): void {
    const calculatorOptions = {
      ...options,
      minAccuracyThreshold:
        options.minAccuracyThreshold || this.minAccuracyThreshold,
      accuracyWeights: options.accuracyWeights,
    }

    if (type === 'null-based') {
      this.accuracyCalculator = new NullBasedAccuracyCalculator(
        calculatorOptions
      )
    } else {
      this.accuracyCalculator = new AccuracyCalculator(calculatorOptions)
    }

    if (this.verbose) {
      console.log(`Changed to ${type} accuracy calculator`)
    }
  }
}
