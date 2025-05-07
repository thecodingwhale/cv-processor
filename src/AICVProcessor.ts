import * as fs from 'fs'
import * as path from 'path'
import { AITextExtractor } from './extractors/AITextExtractor'
import { CVData, ProcessorOptions, TokenUsage } from './types'
import { AIProvider, TokenUsageInfo } from './types/AIProvider'
import { AccuracyCalculator } from './utils/AccuracyCalculator'
import { AIPatternExtractor } from './utils/AIPatternExtractor'

/**
 * AI-powered CV Processor class to extract structured data from PDF resumes
 */
export class AICVProcessor {
  private aiProvider: AIProvider
  private textExtractor: AITextExtractor

  private patternExtractor: AIPatternExtractor
  private accuracyCalculator: AccuracyCalculator
  private verbose: boolean
  private minAccuracyThreshold: number
  private tokenUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
  }
  private industryContext: string // Store industry context for patterns

  /**
   * Initialize the AI CV processor
   */
  constructor(aiProvider: AIProvider, options: ProcessorOptions = {}) {
    this.aiProvider = aiProvider
    this.textExtractor = new AITextExtractor(aiProvider)
    this.patternExtractor = new AIPatternExtractor(aiProvider)
    this.accuracyCalculator = new AccuracyCalculator(options)
    this.verbose = options.verbose || false
    this.minAccuracyThreshold = options.minAccuracyThreshold || 70
    this.industryContext = options.industryContext || 'film and television'

    if (this.verbose) {
      console.log('AI CV Processor initialized')
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

      // Extract text from PDF using AI
      const text = await this.textExtractor.extractTextFromPDF(pdfPath)

      // Track token usage from text extraction if available
      this.addTokenUsageFromResponse(this.textExtractor.getTokenUsage())

      // Get industry-specific patterns if not using static patterns
      if (this.verbose) {
        console.log(
          `Extracting industry-specific patterns for: ${this.industryContext}`
        )
      }
      const patterns = await this.patternExtractor.extractPatterns(
        text,
        this.industryContext
      )

      // Track token usage from pattern extraction
      this.addTokenUsageFromResponse(this.patternExtractor.getTokenUsage())

      // Define the data schema to match our CVData type
      const dataSchema = {
        type: 'object',
        properties: {
          personalInfo: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              location: { type: 'string' },
              website: { type: 'string' }, // actor portfolio or IMDb link
              instagram: { type: 'string' }, // common for actors/models
              representation: {
                type: 'object',
                properties: {
                  agency: { type: 'string' },
                  agentName: { type: 'string' },
                  agentContact: { type: 'string' },
                },
              },
              unionAffiliations: {
                type: 'array',
                items: { type: 'string' }, // e.g., ['SAG-AFTRA', 'AEA']
              },
              summary: { type: 'string' }, // short bio / acting profile
            },
          },
          media: {
            type: 'object',
            properties: {
              headshots: {
                type: 'array',
                items: { type: 'string' }, // image URLs
              },
              demoReels: {
                type: 'array',
                items: { type: 'string' }, // video URLs
              },
              voiceReels: {
                type: 'array',
                items: { type: 'string' }, // for voice actors
              },
            },
          },
          training: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                institution: { type: 'string' },
                program: { type: 'string' },
                coachOrMentor: { type: 'string' },
                focus: { type: 'string' }, // e.g., Meisner, On-Camera, Voice
                startDate: { type: 'string' },
                endDate: { type: 'string' },
                location: { type: 'string' },
              },
            },
          },
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
          skills: {
            type: 'object',
            properties: {
              performanceSkills: {
                type: 'array',
                items: { type: 'string' }, // e.g., 'Improvisation', 'Stage Combat'
              },
              accentsDialects: {
                type: 'array',
                items: { type: 'string' },
              },
              languages: {
                type: 'array',
                items: { type: 'string' },
              },
              instruments: {
                type: 'array',
                items: { type: 'string' },
              },
              dance: {
                type: 'array',
                items: { type: 'string' },
              },
              certifications: {
                type: 'array',
                items: { type: 'string' }, // e.g., 'Stage Combat Certified'
              },
              softSkills: {
                type: 'array',
                items: { type: 'string' }, // e.g., 'Team player', 'Takes direction well'
              },
            },
          },
          physicalAttributes: {
            type: 'object',
            properties: {
              height: { type: 'string' },
              weight: { type: 'string' },
              hairColor: { type: 'string' },
              eyeColor: { type: 'string' },
              bodyType: { type: 'string' },
              clothing: {
                type: 'object',
                properties: {
                  shirt: { type: 'string' },
                  pants: { type: 'string' },
                  dress: { type: 'string' },
                  shoe: { type: 'string' },
                  suit: { type: 'string' },
                },
              },
            },
          },
        },
      }

      // Create a prompt that incorporates industry context and any patterns detected
      const instructions = `
        You are a CV parser specializing in the ${this.industryContext} industry.
        
        Analyze the provided CV/resume and extract structured information for a talent/performer.
        
        Focus on:
        1. Personal information and representation (agent, manager, etc.)
        2. Media links (demo reels, headshots, etc.)
        3. Credits/experience in film, TV, commercials, theater, etc.
        4. Training and education
        5. Skills relevant to performance (acting styles, dialects, instruments, etc.)
        6. Physical attributes (height, measurements, etc.)
        
        Structure the data according to the provided JSON schema and ensure all fields are correctly populated.
        If information is not found, use null for string fields and empty arrays for arrays.
        
        IMPORTANT: Return ONLY the JSON object, with no additional text or markdown formatting.
      `

      try {
        // Use AI to extract structured data
        const cvData = await this.aiProvider.extractStructuredData<CVData>(
          text,
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
   * Set minimum accuracy threshold
   */
  setMinAccuracyThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 100) {
      throw new Error('Accuracy threshold must be between 0 and 100')
    }

    this.minAccuracyThreshold = threshold
  }
}
