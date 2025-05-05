import { Section } from '../types'
import { Patterns } from '../utils/patterns'

/**
 * Class for extracting sections from CV text
 */
export class SectionExtractor {
  /**
   * Split CV text into sections based on common section headers
   */
  segmentCVIntoSections(text: string): Section {
    // Split text into lines for processing
    const lines = text.split('\n')
    let currentSection = 'header'
    const sections: { [key: string]: string[] } = { [currentSection]: [] }

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) {
        continue
      }

      // Check if this line is a section header
      let sectionFound = false
      for (const [sectionName, pattern] of Object.entries(Patterns.sections)) {
        if (pattern.test(trimmedLine) && trimmedLine.length < 50) {
          // Section headers are usually short
          currentSection = sectionName
          if (!sections[currentSection]) {
            sections[currentSection] = []
          }
          sectionFound = true
          break
        }
      }

      if (!sectionFound) {
        sections[currentSection].push(trimmedLine)
      }
    }

    // Combine lines in each section
    const result: Section = {}
    for (const [section, lines] of Object.entries(sections)) {
      result[section] = lines.join('\n')
    }

    return result
  }
}
