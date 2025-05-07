import { AIProvider } from '../types/AIProvider'

/**
 * AIPatternExtractor class
 * Uses AI to dynamically identify and extract patterns from CV text
 * This replaces the static patterns.ts file with context-aware pattern recognition
 */
export class AIPatternExtractor {
  private aiProvider: AIProvider
  private patternCache: Map<string, any> = new Map()
  private tokenUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  }

  constructor(aiProvider: AIProvider) {
    this.aiProvider = aiProvider
  }

  /**
   * Extract industry-specific patterns from CV text
   * @param text The CV text to analyze
   * @param industryContext Additional context about the industry (e.g., "film and TV")
   * @returns An object containing recognized patterns
   */
  async extractPatterns(
    text: string,
    industryContext: string = 'film and television'
  ): Promise<any> {
    try {
      const cacheKey = `${industryContext}-patterns`

      // Check if we have cached patterns for this industry context
      if (this.patternCache.has(cacheKey)) {
        return this.patternCache.get(cacheKey)
      }

      // Create a schema for the patterns we want to extract
      const patternSchema = {
        type: 'object',
        properties: {
          // Contact and social profiles
          contactPatterns: {
            type: 'object',
            properties: {
              email: { type: 'array', items: { type: 'string' } },
              phone: { type: 'array', items: { type: 'string' } },
              social: { type: 'array', items: { type: 'string' } },
            },
          },
          // Industry-specific social and portfolio sites
          industryProfiles: {
            type: 'object',
            properties: {
              imdb: { type: 'array', items: { type: 'string' } },
              spotlight: { type: 'array', items: { type: 'string' } },
              castingNetworks: { type: 'array', items: { type: 'string' } },
              actorsAccess: { type: 'array', items: { type: 'string' } },
              instagram: { type: 'array', items: { type: 'string' } },
              portfolioSites: { type: 'array', items: { type: 'string' } },
            },
          },
          // Media and portfolio links
          mediaPatterns: {
            type: 'object',
            properties: {
              videoReel: { type: 'array', items: { type: 'string' } },
              audioReel: { type: 'array', items: { type: 'string' } },
              headshots: { type: 'array', items: { type: 'string' } },
            },
          },
          // Sections commonly found in entertainment industry CVs
          sectionHeaders: {
            type: 'object',
            properties: {
              credits: { type: 'array', items: { type: 'string' } },
              training: { type: 'array', items: { type: 'string' } },
              skills: { type: 'array', items: { type: 'string' } },
              measurements: { type: 'array', items: { type: 'string' } },
              representation: { type: 'array', items: { type: 'string' } },
            },
          },
          // Film and TV credit patterns
          creditPatterns: {
            type: 'object',
            properties: {
              productionTypes: { type: 'array', items: { type: 'string' } },
              roleTypes: { type: 'array', items: { type: 'string' } },
              creditFormats: { type: 'array', items: { type: 'string' } }, // How credits are typically formatted
            },
          },
          // Physical attributes and measurements
          physicalAttributes: {
            type: 'object',
            properties: {
              height: { type: 'array', items: { type: 'string' } },
              weight: { type: 'array', items: { type: 'string' } },
              sizing: { type: 'array', items: { type: 'string' } }, // Clothing sizes, etc.
              appearance: { type: 'array', items: { type: 'string' } }, // Hair, eyes, etc.
            },
          },
          // Performance skills relevant to the industry
          skillCategories: {
            type: 'object',
            properties: {
              actingStyles: { type: 'array', items: { type: 'string' } },
              dialects: { type: 'array', items: { type: 'string' } },
              performanceSkills: { type: 'array', items: { type: 'string' } },
              movementSkills: { type: 'array', items: { type: 'string' } },
              musicalSkills: { type: 'array', items: { type: 'string' } },
              specializedSkills: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      }

      // Create a prompt for extracting industry-specific patterns
      const instructions = `
        You are an expert in analyzing CV formats in the ${industryContext} industry.
        
        Please identify common patterns and formats used in CVs for this industry. Focus on:
        
        1. How contact information and social profiles are typically formatted
        2. Industry-specific profile sites (like IMDb, Spotlight, etc.)
        3. Media and portfolio link formats for reels, headshots, etc.
        4. Common section headers used in these CVs
        5. How credits are typically formatted (e.g., "Production Title - Role (Director)")
        6. Physical attribute formats (height, weight, measurements, etc.)
        7. Categories of skills relevant to the industry
        
        Don't try to extract specific information from any particular CV, but instead identify general patterns
        that would help parse various CVs in this industry. Return patterns in the format specified by the schema.
        
        Be comprehensive and include variations of patterns that might appear in different CV formats.
      `

      const response = await this.aiProvider.extractStructuredData<any>(
        text.substring(0, 1000), // We just need a sample of the text to identify general patterns
        patternSchema,
        instructions
      )

      // Store token usage if available in the response
      if (response.tokenUsage) {
        this.tokenUsage.promptTokens += response.tokenUsage.promptTokens || 0
        this.tokenUsage.completionTokens +=
          response.tokenUsage.completionTokens || 0
        this.tokenUsage.totalTokens += response.tokenUsage.totalTokens || 0
      }

      // Cache the results for future use
      this.patternCache.set(cacheKey, response)

      return response
    } catch (error) {
      console.error('Error extracting patterns with AI:', error)
      throw error
    }
  }

  /**
   * Extract patterns specific to a section (like skills, credits, etc.)
   * @param sectionText The text of the specific section
   * @param sectionType The type of section (skills, credits, etc.)
   * @returns Extracted patterns relevant to that section
   */
  async extractSectionPatterns(
    sectionText: string,
    sectionType: string
  ): Promise<any> {
    try {
      const cacheKey = `${sectionType}-section`

      // Check if we have cached patterns for this section type
      if (this.patternCache.has(cacheKey)) {
        return this.patternCache.get(cacheKey)
      }

      // Define a schema based on the section type
      let patternSchema: any = {
        type: 'object',
        properties: {},
      }

      let instructions = ''

      // Customize the schema and instructions based on section type
      switch (sectionType.toLowerCase()) {
        case 'skills':
          patternSchema.properties = {
            categories: { type: 'array', items: { type: 'string' } },
            commonSkills: { type: 'array', items: { type: 'string' } },
            formatPatterns: { type: 'array', items: { type: 'string' } },
          }
          instructions = `
            Analyze this skills section from a CV in the entertainment industry.
            Identify:
            1. Categories of skills typically mentioned (acting styles, dialects, etc.)
            2. Common skills listed
            3. How skills are typically formatted (bullet points, comma-separated, etc.)
            
            Return patterns that would help parse similar skills sections, not the specific skills in this CV.
          `
          break

        case 'credits':
          patternSchema.properties = {
            productionTypes: { type: 'array', items: { type: 'string' } },
            roleFormats: { type: 'array', items: { type: 'string' } },
            creditLinePatterns: { type: 'array', items: { type: 'string' } },
          }
          instructions = `
            Analyze this credits/experience section from a CV in the entertainment industry.
            Identify:
            1. Types of productions mentioned (film, TV, theater, etc.)
            2. How roles are typically formatted
            3. Patterns in how credit lines are structured (order of information, separators used, etc.)
            
            Return patterns that would help parse similar credits sections, not the specific credits in this CV.
          `
          break

        // Add more section types as needed...

        default:
          patternSchema.properties = {
            formatPatterns: { type: 'array', items: { type: 'string' } },
            commonTerms: { type: 'array', items: { type: 'string' } },
          }
          instructions = `
            Analyze this ${sectionType} section from a CV in the entertainment industry.
            Identify common formatting patterns and terminology used.
            
            Return patterns that would help parse similar sections, not the specific content in this CV.
          `
      }

      const response = await this.aiProvider.extractStructuredData<any>(
        sectionText,
        patternSchema,
        instructions
      )

      // Store token usage if available
      if (response.tokenUsage) {
        this.tokenUsage.promptTokens += response.tokenUsage.promptTokens || 0
        this.tokenUsage.completionTokens +=
          response.tokenUsage.completionTokens || 0
        this.tokenUsage.totalTokens += response.tokenUsage.totalTokens || 0
      }

      // Cache the results for future use
      this.patternCache.set(cacheKey, response)

      return response
    } catch (error) {
      console.error(`Error extracting ${sectionType} patterns with AI:`, error)
      throw error
    }
  }

  /**
   * Get token usage statistics
   */
  getTokenUsage(): TokenUsage {
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
    }
  }
}

/**
 * Interface for tracking token usage
 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost?: number
}
