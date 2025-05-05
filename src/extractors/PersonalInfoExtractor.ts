import { PersonalInfo } from '../types'
import { NLPUtils } from '../utils/nlp'
import { Patterns } from '../utils/patterns'

/**
 * Class for extracting personal information from CV text
 */
export class PersonalInfoExtractor {
  /**
   * Extract personal information from the text
   */
  extractPersonalInfo(text: string): PersonalInfo {
    // Use the first ~1000 chars for personal info (usually at the top)
    const topText = text.substring(0, 1000)

    // Extract name (usually one of the first person entities)
    const personEntities = NLPUtils.extractNames(topText)
    const name = personEntities.length > 0 ? personEntities[0] : null

    // Extract email
    const emailMatches = text.match(Patterns.email)
    const email =
      emailMatches && emailMatches.length > 0 ? emailMatches[0] : null

    // Extract phone
    const phoneMatches = text.match(Patterns.phone)
    const phone =
      phoneMatches && phoneMatches.length > 0 ? phoneMatches[0] : null

    // Extract LinkedIn profile
    const linkedinMatches = text.match(Patterns.linkedin)
    let linkedin =
      linkedinMatches && linkedinMatches.length > 0 ? linkedinMatches[0] : null
    if (linkedin && !linkedin.startsWith('http')) {
      linkedin = `https://${linkedin}`
    }

    // Extract GitHub profile
    const githubMatches = text.match(Patterns.github)
    let github =
      githubMatches && githubMatches.length > 0 ? githubMatches[0] : null
    if (github && !github.startsWith('http')) {
      github = `https://${github}`
    }

    // Extract location (usually a GPE entity near the top)
    const locations = NLPUtils.extractLocations(topText)
    const location = locations.length > 0 ? locations[0] : null

    return {
      name,
      email,
      phone,
      location,
      linkedin,
      github,
    }
  }

  /**
   * Extract and clean the summary/profile section
   */
  extractSummary(summaryText: string | null): string | null {
    if (!summaryText) {
      return null
    }

    // Clean up the summary text
    const cleanSummary = summaryText.trim()

    // Limit to 500 characters if too long
    if (cleanSummary.length > 500) {
      // Try to find a good break point (end of sentence)
      const breakPoint = NLPUtils.findSentenceBreak(cleanSummary, 500)
      return cleanSummary.substring(0, breakPoint)
    }

    return cleanSummary
  }
}
