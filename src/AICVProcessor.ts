import * as fs from 'fs'
import * as path from 'path'
import { AITextExtractor } from './extractors/AITextExtractor'
import { SectionExtractor } from './extractors/SectionExtractor'
import { CVData, ProcessorOptions } from './types'
import { AIProvider } from './types/AIProvider'

/**
 * AI-powered CV Processor class to extract structured data from PDF resumes
 */
export class AICVProcessor {
  private aiProvider: AIProvider
  private textExtractor: AITextExtractor
  private sectionExtractor: SectionExtractor
  private verbose: boolean

  /**
   * Initialize the AI CV processor
   */
  constructor(aiProvider: AIProvider, options: ProcessorOptions = {}) {
    this.aiProvider = aiProvider
    this.textExtractor = new AITextExtractor(aiProvider)
    this.sectionExtractor = new SectionExtractor()
    this.verbose = options.verbose || false

    if (this.verbose) {
      console.log('AI CV Processor initialized')
    }
  }

  /**
   * Process a CV PDF and extract structured information using AI
   */
  async processCv(pdfPath: string): Promise<CVData> {
    console.log(`Processing CV with AI: ${pdfPath}`)

    // Extract text from PDF using AI
    const text = await this.textExtractor.extractTextFromPDF(pdfPath)

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
      },
    }

    const instructions = `
      You are a CV parser designed to extract structured information from resumes.
      Analyze the provided CV/resume text and extract the following information:
      
      1. Personal information: name, email, phone, location, LinkedIn URL, GitHub URL, and professional summary
      2. Education history: each institution with degree, field of study, dates, GPA if available, and location
      3. Work experience: each position with company name, job title, dates, location, and bullet points of responsibilities/achievements
      4. Skills: categorized as programming languages, frameworks, tools, soft skills, and other relevant skills
      
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

      // Add metadata
      cvData.metadata = {
        processedDate: new Date().toISOString(),
        sourceFile: path.basename(pdfPath),
        ...this.aiProvider.getModelInfo(),
      }

      return cvData
    } catch (error: any) {
      console.error(`Error in AI data extraction: ${error}`)

      // If the result is a string (either JSON string or text with JSON embedded), try to parse it
      if (error.response && typeof error.response === 'string') {
        try {
          // Check if the response is a JSON string
          const jsonData = this.extractJsonFromString(error.response)
          jsonData.metadata = {
            processedDate: new Date().toISOString(),
            sourceFile: path.basename(pdfPath),
            ...this.aiProvider.getModelInfo(),
          }
          return jsonData
        } catch (jsonError) {
          console.error(`Error parsing JSON from AI response: ${jsonError}`)
        }
      }

      throw error
    }
  }

  /**
   * Utility method to extract JSON from a string that might contain markdown or other text
   */
  private extractJsonFromString(text: string): any {
    // First, check if the string is just a JSON object
    try {
      return JSON.parse(text)
    } catch (e) {
      // Not a plain JSON string, continue to other extraction methods
    }

    // Try to extract JSON from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1])
      } catch (e) {
        console.error(`Error parsing JSON from code block: ${e}`)
      }
    }

    // Try to extract any JSON-like structure using regex
    const jsonPattern = /({[\s\S]*})/
    const match = text.match(jsonPattern)
    if (match && match[1]) {
      try {
        return JSON.parse(match[1])
      } catch (e) {
        console.error(`Error parsing JSON from pattern: ${e}`)
      }
    }

    throw new Error('Could not extract valid JSON from response')
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
    } catch (error) {
      console.error(`Error saving JSON file: ${error}`)
      throw error
    }
  }
}
