import { Skills } from '../types'
import { AIProvider, TokenUsageInfo } from '../types/AIProvider'
import { AIPatternExtractor } from '../utils/AIPatternExtractor'

/**
 * Class for extracting and categorizing skills from CV text using AI
 */
export class AISkillsExtractor {
  private aiProvider: AIProvider
  private patternExtractor: AIPatternExtractor
  private tokenUsage: TokenUsageInfo = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
  }

  constructor(aiProvider: AIProvider) {
    this.aiProvider = aiProvider
    this.patternExtractor = new AIPatternExtractor(aiProvider)
  }

  /**
   * Extract skills from CV text using AI
   * @param skillsText The skills section text from the CV
   * @param industryContext Optional industry context for better extraction
   * @returns Structured Skills object
   */
  async extractSkills(
    skillsText: string | null,
    industryContext: string = 'film and television'
  ): Promise<Skills & { tokenUsage?: TokenUsageInfo }> {
    if (!skillsText) {
      return {}
    }

    try {
      // Define a schema for skills extraction that matches the Skills interface
      // but adds industry-specific categories
      const skillsSchema = {
        type: 'object',
        properties: {
          // Standard skill categories
          programmingLanguages: { type: 'array', items: { type: 'string' } },
          frameworks: { type: 'array', items: { type: 'string' } },
          tools: { type: 'array', items: { type: 'string' } },
          softSkills: { type: 'array', items: { type: 'string' } },

          // Entertainment industry skill categories
          actingStyles: { type: 'array', items: { type: 'string' } },
          dialects: { type: 'array', items: { type: 'string' } },
          languages: { type: 'array', items: { type: 'string' } },
          performanceSkills: { type: 'array', items: { type: 'string' } },
          movementSkills: { type: 'array', items: { type: 'string' } },
          musicalAbilities: { type: 'array', items: { type: 'string' } },
          danceStyles: { type: 'array', items: { type: 'string' } },
          combatSkills: { type: 'array', items: { type: 'string' } },
          specializedSkills: { type: 'array', items: { type: 'string' } },

          // Catch-all category
          other: { type: 'array', items: { type: 'string' } },
        },
      }

      // Create a prompt that's specific to the entertainment industry
      const instructions = `
        You are a CV parser specializing in the ${industryContext} industry.
        
        Extract and categorize skills from the following skills section text. Focus on:
        
        1. Acting styles and techniques (method, classical, improv, etc.)
        2. Dialects and accents the person can perform
        3. Languages they speak
        4. Performance skills (stage combat, singing, etc.)
        5. Movement skills (dance, physical theater, etc.)
        6. Musical abilities (instruments, vocal range, etc.)
        7. Dance styles they're proficient in
        8. Combat/stunts capabilities
        9. Any other specialized skills relevant to ${industryContext}
        
        Only include skills actually mentioned in the text, not every possible skill.
        Categorize each skill appropriately. If a skill doesn't fit in a specific category, put it in "other".
        Return only valid categories that have at least one skill.
      `

      // Get skills using AI extraction
      const extractedSkills =
        await this.aiProvider.extractStructuredData<Skills>(
          skillsText,
          skillsSchema,
          instructions
        )

      // Track token usage
      if (extractedSkills.tokenUsage) {
        this.addTokenUsage(extractedSkills.tokenUsage)
      }

      // Remove empty categories
      Object.keys(extractedSkills).forEach((key) => {
        if (key === 'tokenUsage') return

        const typedKey = key as keyof Skills
        if (
          !extractedSkills[typedKey] ||
          (Array.isArray(extractedSkills[typedKey]) &&
            (extractedSkills[typedKey] as string[]).length === 0)
        ) {
          delete extractedSkills[typedKey]
        }
      })

      // Return skills with token usage
      return {
        ...extractedSkills,
        tokenUsage: this.tokenUsage,
      }
    } catch (error) {
      console.error('Error extracting skills with AI:', error)

      // Fallback to empty skills object with token usage info
      return { tokenUsage: this.tokenUsage }
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
