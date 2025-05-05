import { Skills } from '../types'
import { SkillCategories } from '../utils/patterns'

/**
 * Class for extracting and categorizing skills from CV text
 */
export class SkillsExtractor {
  /**
   * Extract skills from the skills section
   */
  extractSkills(skillsText: string | null): Skills {
    if (!skillsText) {
      return {}
    }

    // Clean and normalize the text
    const cleanedText = skillsText
      .replace(/•/g, '\n')
      .replace(/‣/g, '\n')
      .replace(/>/g, '\n')

    // Split text into lines and extract potential skills
    let skillCandidates: string[] = []

    // 1. Lines with bullet points or newlines
    const lines = cleanedText.split('\n')
    for (const line of lines) {
      const trimmedLine = line.trim().replace(/^[•\-*]\s*/, '')
      if (trimmedLine && trimmedLine.length < 100) {
        // Skills are typically short phrases
        skillCandidates.push(trimmedLine)
      }
    }

    // 2. Skills separated by commas, slashes, or similar separators
    const commaSkills: string[] = []
    for (const candidate of skillCandidates) {
      const splitSkills = candidate
        .split(/,|\|/)
        .map((s) => s.trim())
        .filter((s) => s)
      commaSkills.push(...splitSkills)
    }
    skillCandidates = commaSkills

    // Filter and categorize skills
    const categorizedSkills: Skills = {
      programmingLanguages: [],
      frameworks: [],
      tools: [],
      softSkills: [],
      other: [],
    }

    for (const skill of skillCandidates) {
      const trimmedSkill = skill.trim()
      if (!trimmedSkill || trimmedSkill.length < 2) {
        // Skip too short skills
        continue
      }

      const skillLower = trimmedSkill.toLowerCase()

      // Check which category this skill belongs to
      let categorized = false

      if (
        this.matchesCategory(skillLower, SkillCategories.programmingLanguages)
      ) {
        categorizedSkills.programmingLanguages!.push(trimmedSkill)
        categorized = true
      } else if (this.matchesCategory(skillLower, SkillCategories.frameworks)) {
        categorizedSkills.frameworks!.push(trimmedSkill)
        categorized = true
      } else if (this.matchesCategory(skillLower, SkillCategories.tools)) {
        categorizedSkills.tools!.push(trimmedSkill)
        categorized = true
      } else if (this.matchesCategory(skillLower, SkillCategories.softSkills)) {
        categorizedSkills.softSkills!.push(trimmedSkill)
        categorized = true
      }

      if (!categorized) {
        categorizedSkills.other!.push(trimmedSkill)
      }
    }

    // Remove empty categories
    Object.keys(categorizedSkills).forEach((key) => {
      const typedKey = key as keyof Skills
      if (
        !categorizedSkills[typedKey] ||
        categorizedSkills[typedKey]!.length === 0
      ) {
        delete categorizedSkills[typedKey]
      }
    })

    return categorizedSkills
  }

  /**
   * Check if a skill matches a category
   */
  private matchesCategory(skill: string, categorySkills: Set<string>): boolean {
    // Direct match
    if (categorySkills.has(skill)) {
      return true
    }

    // Partial match
    for (const categorySkill of categorySkills) {
      if (skill.includes(categorySkill) || categorySkill.includes(skill)) {
        return true
      }
    }

    return false
  }
}
