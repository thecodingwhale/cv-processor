import { Education } from '../types'
import { NLPUtils } from '../utils/nlp'
import { Patterns } from '../utils/patterns'

/**
 * Class for extracting education information from CV text
 */
export class EducationExtractor {
  /**
   * Extract education information from the education section text
   */
  extractEducation(educationText: string | null): Education[] {
    if (!educationText) {
      return []
    }

    // Split into education entries (usually separated by double newlines)
    const educationEntries = educationText
      .split(/\n\s*\n/)
      .filter((entry) => entry.trim())

    const entries: Education[] = []
    for (const entryText of educationEntries) {
      const entry: Education = {
        institution: null,
        degree: null,
        fieldOfStudy: null,
        startDate: null,
        endDate: null,
        gpa: null,
        location: null,
      }

      // Extract institution (organization entities)
      const organizations = NLPUtils.extractOrganizations(entryText)
      if (organizations.length > 0) {
        entry.institution = organizations[0]
      }

      // Extract dates
      this.extractDates(entryText, entry)

      // Extract degree
      this.extractDegree(entryText, entry)

      // Extract GPA if present
      const gpaMatch = entryText.match(Patterns.gpa)
      if (gpaMatch && gpaMatch.length > 1) {
        entry.gpa = gpaMatch[1]
      }

      // Extract location
      const locations = NLPUtils.extractLocations(entryText)
      if (locations.length > 0) {
        entry.location = locations[0]
      }

      entries.push(entry)
    }

    return entries
  }

  /**
   * Extract dates from education entry text
   */
  private extractDates(entryText: string, entry: Education): void {
    const dateMatches = entryText.match(Patterns.date)

    if (dateMatches && dateMatches.length > 0) {
      // Check for patterns that indicate current/ongoing education
      const isPresentOrCurrent = /present|current|now/i.test(entryText)

      // Try to find multiple date matches
      const allMatches = [
        ...entryText.matchAll(new RegExp(Patterns.date, 'gi')),
      ]

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
   * Extract degree and field of study from education entry text
   */
  private extractDegree(entryText: string, entry: Education): void {
    // Check each degree pattern
    for (const pattern of Patterns.degreePatterns) {
      const matches = entryText.match(pattern)
      if (matches && matches.length > 0) {
        entry.degree = matches[0].trim()
        break
      }
    }

    // Extract field of study (often after "in" following degree)
    if (entry.degree) {
      const fieldMatch = entryText.match(
        new RegExp(
          `${entry.degree.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}${
            Patterns.fieldOfStudy.source
          }`,
          'i'
        )
      )

      if (fieldMatch && fieldMatch.length > 1) {
        entry.fieldOfStudy = fieldMatch[1].trim()
      }
    }
  }
}
