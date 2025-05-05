import { Experience } from '../types'
import { NLPUtils } from '../utils/nlp'
import { Patterns } from '../utils/patterns'

/**
 * Class for extracting work experience information from CV text
 */
export class ExperienceExtractor {
  /**
   * Extract work experience information from the experience section text
   */
  extractWorkExperience(experienceText: string | null): Experience[] {
    if (!experienceText) {
      return []
    }

    // Split by double newlines to separate individual entries
    const experiences = experienceText
      .split(/\n\s*\n/)
      .filter((exp) => exp.trim())

    const entries: Experience[] = []
    for (const expText of experiences) {
      const entry: Experience = {
        company: null,
        position: null,
        startDate: null,
        endDate: null,
        location: null,
        description: [],
      }

      // Extract company (usually an organization entity)
      const organizations = NLPUtils.extractOrganizations(expText)
      if (organizations.length > 0) {
        entry.company = organizations[0]
      }

      // Extract job title
      this.extractJobTitle(expText, entry)

      // Extract dates
      this.extractDates(expText, entry)

      // Extract location
      const locations = NLPUtils.extractLocations(expText)
      if (locations.length > 0) {
        entry.location = locations[0]
      }

      // Extract description (bullet points or paragraph after title)
      this.extractDescription(expText, entry)

      entries.push(entry)
    }

    return entries
  }

  /**
   * Extract job title from experience text
   */
  private extractJobTitle(expText: string, entry: Experience): void {
    for (const pattern of Patterns.titlePatterns) {
      const matches = expText.match(pattern)
      if (matches && matches.length > 1) {
        entry.position = matches[1].trim()
        break
      }
    }
  }

  /**
   * Extract dates from experience text
   */
  private extractDates(expText: string, entry: Experience): void {
    const dateMatches = expText.match(Patterns.date)

    if (dateMatches && dateMatches.length > 0) {
      // Check for patterns that indicate current position
      const isPresentOrCurrent = /present|current|now/i.test(expText)

      // Try to find multiple date matches
      const allMatches = [...expText.matchAll(new RegExp(Patterns.date, 'gi'))]

      if (allMatches.length >= 2) {
        // Assume first is start date, second is end date
        entry.startDate = allMatches[0][0]
        entry.endDate = allMatches[1][0]
      } else if (allMatches.length === 1) {
        if (isPresentOrCurrent) {
          entry.startDate = allMatches[0][0]
          entry.endDate = 'Present'
        } else {
          // Just one date, assume it's the end date
          entry.endDate = allMatches[0][0]
        }
      }
    }
  }

  /**
   * Extract job description from experience text
   */
  private extractDescription(expText: string, entry: Experience): void {
    const lines = expText.split('\n')
    let descriptionStarted = false

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) {
        continue
      }

      // Skip the line with company name, title, and dates
      if (
        (entry.company && trimmedLine.includes(entry.company)) ||
        (entry.position && trimmedLine.includes(entry.position))
      ) {
        continue
      }

      // Look for bullet points or narrative descriptions
      if (
        trimmedLine.startsWith('•') ||
        trimmedLine.startsWith('-') ||
        trimmedLine.startsWith('*') ||
        descriptionStarted
      ) {
        descriptionStarted = true
        // Clean bullet points
        const cleanLine = trimmedLine.replace(Patterns.bulletPoint, '').trim()
        if (cleanLine && cleanLine.length > 10) {
          // Minimum meaningful description
          entry.description.push(cleanLine)
        }
      }
    }
  }
}
