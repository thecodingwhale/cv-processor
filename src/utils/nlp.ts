import nlp from 'compromise'

/**
 * NLP utility functions using compromise.js
 */
export class NLPUtils {
  /**
   * Extract person names from text
   */
  static extractNames(text: string): string[] {
    const doc = nlp(text)
    return doc.people().out('array')
  }

  /**
   * Extract organization names from text
   */
  static extractOrganizations(text: string): string[] {
    const doc = nlp(text)
    return doc.organizations().out('array')
  }

  /**
   * Extract places/locations from text
   */
  static extractLocations(text: string): string[] {
    const doc = nlp(text)
    return doc.places().out('array')
  }

  /**
   * Extract dates from text
   */
  static extractDates(text: string): string[] {
    const doc = nlp(text)
    // Use match('#Date') instead of dates() which isn't available in the type definitions
    return doc.match('#Date').out('array')
  }

  /**
   * Find potential sentence breaks for summary truncation
   */
  static findSentenceBreak(text: string, maxLength: number): number {
    if (text.length <= maxLength) return text.length

    const truncated = text.substring(0, maxLength)
    const lastPeriod = truncated.lastIndexOf('.')

    if (lastPeriod > maxLength * 0.6) {
      // Only truncate if it's a significant portion
      return lastPeriod + 1
    }

    return maxLength
  }
}
