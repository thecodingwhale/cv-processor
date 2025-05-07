import { AccuracyScore, CVData, ProcessorOptions } from '../types'

/**
 * Utility class to calculate accuracy scores for CV data based on null values
 * The fewer null values, the higher the accuracy score
 */
export class NullBasedAccuracyCalculator {
  private minAccuracyThreshold: number
  private fieldWeights: Record<string, number>

  constructor(options: ProcessorOptions = {}) {
    this.minAccuracyThreshold = options.minAccuracyThreshold || 70 // Default 70% minimum threshold

    // Define field weights - critical fields have higher weights
    this.fieldWeights = {
      // Personal info weights
      'personalInfo.name': 3.0, // Critical
      'personalInfo.email': 2.0, // Critical
      'personalInfo.phone': 2.0, // Critical
      'personalInfo.location': 1.0, // Standard
      'personalInfo.linkedin': 1.0, // Standard
      'personalInfo.github': 0.8, // Less critical
      'personalInfo.summary': 1.5, // Important but not critical

      // Education entry weights (applied to each entry)
      'education.institution': 2.0, // Critical
      'education.degree': 1.5, // Important
      'education.fieldOfStudy': 1.5, // Important
      'education.startDate': 1.0, // Standard
      'education.endDate': 1.0, // Standard
      'education.gpa': 0.5, // Optional
      'education.location': 0.5, // Optional

      // Experience entry weights (applied to each entry)
      'experience.company': 2.5, // Critical
      'experience.position': 2.5, // Critical
      'experience.startDate': 1.0, // Standard
      'experience.endDate': 1.0, // Standard
      'experience.location': 0.7, // Less important
      'experience.description': 2.0, // Important for details

      // Skills section weights (existence of non-empty arrays)
      'skills.programmingLanguages': 1.5, // Important for technical roles
      'skills.frameworks': 1.2, // Important for technical roles
      'skills.tools': 1.0, // Standard
      'skills.softSkills': 1.0, // Standard
      'skills.other': 0.8, // Less critical
    }
  }

  /**
   * Calculate accuracy score for the extracted CV data based on null values
   */
  calculateAccuracy(cvData: CVData): AccuracyScore {
    // Ensure all required objects exist
    if (!cvData.personalInfo) {
      cvData.personalInfo = {
        name: null,
        email: null,
        phone: null,
        location: null,
        linkedin: null,
        github: null,
      }
    }
    if (!cvData.education) cvData.education = []
    if (!cvData.experience) cvData.experience = []
    if (!cvData.skills) cvData.skills = {}

    const missingFields: string[] = []

    // Calculate total fields, weighted fields, and populated fields
    let totalFieldsCount = 0
    let weightedTotal = 0
    let weightedPopulated = 0

    // 1. Check personal info
    Object.entries(cvData.personalInfo).forEach(([field, value]) => {
      const fieldKey = `personalInfo.${field}`
      const weight = this.fieldWeights[fieldKey] || 1.0

      totalFieldsCount++
      weightedTotal += weight

      if (value === null || value === undefined || value === '') {
        missingFields.push(fieldKey)
      } else {
        weightedPopulated += weight
      }
    })

    // 2. Check education entries
    const educationFieldKeys = [
      'institution',
      'degree',
      'fieldOfStudy',
      'startDate',
      'endDate',
      'gpa',
      'location',
    ]

    cvData.education.forEach((edu, eduIndex) => {
      educationFieldKeys.forEach((field) => {
        const fieldKey = `education.${field}`
        const weight = this.fieldWeights[fieldKey] || 1.0

        totalFieldsCount++
        weightedTotal += weight

        if (
          edu[field as keyof typeof edu] === null ||
          edu[field as keyof typeof edu] === undefined ||
          edu[field as keyof typeof edu] === ''
        ) {
          missingFields.push(`education[${eduIndex}].${field}`)
        } else {
          weightedPopulated += weight
        }
      })
    })

    // 3. Check experience entries
    const experienceFieldKeys = [
      'company',
      'position',
      'startDate',
      'endDate',
      'location',
    ]

    cvData.experience.forEach((exp, expIndex) => {
      experienceFieldKeys.forEach((field) => {
        const fieldKey = `experience.${field}`
        const weight = this.fieldWeights[fieldKey] || 1.0

        totalFieldsCount++
        weightedTotal += weight

        if (
          exp[field as keyof typeof exp] === null ||
          exp[field as keyof typeof exp] === undefined ||
          exp[field as keyof typeof exp] === ''
        ) {
          missingFields.push(`experience[${expIndex}].${field}`)
        } else {
          weightedPopulated += weight
        }
      })

      // Check description array specially
      const descWeight = this.fieldWeights['experience.description'] || 1.0
      totalFieldsCount++
      weightedTotal += descWeight

      if (!exp.description || exp.description.length === 0) {
        missingFields.push(`experience[${expIndex}].description`)
      } else {
        // Add bonus for detailed descriptions (up to 50% more)
        const descriptionBonus = Math.min(0.5, exp.description.length * 0.1)
        weightedPopulated += descWeight * (1 + descriptionBonus)
      }
    })

    // 4. Check skills - for each skill section, we check if the array exists and has items
    const skillCategories = [
      'programmingLanguages',
      'frameworks',
      'tools',
      'softSkills',
      'other',
    ]

    skillCategories.forEach((category) => {
      const fieldKey = `skills.${category}`
      const weight = this.fieldWeights[fieldKey] || 1.0

      totalFieldsCount++
      weightedTotal += weight

      if (
        !cvData.skills[category as keyof typeof cvData.skills] ||
        (cvData.skills[category as keyof typeof cvData.skills] as any[])
          .length === 0
      ) {
        missingFields.push(fieldKey)
      } else {
        // Add bonus for comprehensive skill lists (up to 30% more)
        const skillCount = (
          cvData.skills[category as keyof typeof cvData.skills] as any[]
        ).length
        const skillBonus = Math.min(0.3, skillCount * 0.06) // 5% per skill up to 30%
        weightedPopulated += weight * (1 + skillBonus)
      }
    })

    // Calculate scores
    const weightedScore =
      weightedTotal > 0 ? (weightedPopulated / weightedTotal) * 100 : 0

    const completeness =
      totalFieldsCount > 0
        ? ((totalFieldsCount - missingFields.length) / totalFieldsCount) * 100
        : 0

    // Calculate confidence based on key fields and consistency
    const confidence = this.calculateConfidence(cvData, weightedScore)

    // Calculate section-specific scores
    const fieldScores = this.calculateSectionScores(cvData, missingFields)

    return {
      score: Math.round(weightedScore * 10) / 10, // Round to 1 decimal place
      completeness: Math.round(completeness * 10) / 10,
      confidence: Math.round(confidence * 10) / 10,
      fieldScores,
      missingFields,
    }
  }

  /**
   * Check if CV meets the minimum accuracy threshold
   */
  meetsThreshold(accuracy: AccuracyScore): boolean {
    return accuracy.score >= this.minAccuracyThreshold
  }

  /**
   * Calculate confidence based on key fields and data consistency
   */
  private calculateConfidence(cvData: CVData, baseScore: number): number {
    // Start with a base confidence related to the score but not identical
    let confidence = Math.min(95, baseScore * 0.9)

    // Critical fields check - if missing critical fields, reduce confidence
    if (!cvData.personalInfo.name || !cvData.personalInfo.email) {
      confidence *= 0.8 // 20% reduction if missing critical personal info
    }

    // Experience check - if no experience entries, reduce confidence
    if (cvData.experience.length === 0) {
      confidence *= 0.9 // 10% reduction if no experience
    } else {
      // Check for critical experience fields
      const hasValidExperience = cvData.experience.some(
        (exp) => exp.company && exp.position
      )
      if (!hasValidExperience) {
        confidence *= 0.85 // 15% reduction if no valid experience entries
      }
    }

    // Date consistency check
    if (this.hasInconsistentDates(cvData)) {
      confidence *= 0.85 // 15% reduction for inconsistent dates
    }

    // Reasonable field length check
    if (this.hasUnreasonableFieldLengths(cvData)) {
      confidence *= 0.9 // 10% reduction for unreasonable field lengths
    }

    return Math.min(100, confidence) // Cap at 100%
  }

  /**
   * Calculate scores for individual sections
   */
  private calculateSectionScores(
    cvData: CVData,
    missingFields: string[]
  ): AccuracyScore['fieldScores'] {
    // Count fields and missing fields by section
    const personalInfoFields = Object.keys(cvData.personalInfo).length
    const personalInfoMissing = missingFields.filter((f) =>
      f.startsWith('personalInfo.')
    ).length

    // Education fields - count per entry
    const eduFieldsPerEntry = 7 // Number of fields per education entry
    const totalEduFields = cvData.education.length * eduFieldsPerEntry
    const eduMissing = missingFields.filter((f) =>
      f.startsWith('education')
    ).length

    // Experience fields - count per entry (including description)
    const expFieldsPerEntry = 6 // Number of fields per experience entry
    const totalExpFields = cvData.experience.length * expFieldsPerEntry
    const expMissing = missingFields.filter((f) =>
      f.startsWith('experience')
    ).length

    // Skills fields - we count the categories
    const skillFields = 5 // Number of skill categories
    const skillsMissing = missingFields.filter((f) =>
      f.startsWith('skills')
    ).length

    // Calculate scores as percentages
    const personalInfoScore =
      personalInfoFields > 0
        ? 100 * (1 - personalInfoMissing / personalInfoFields)
        : 0

    const educationScore =
      totalEduFields > 0
        ? 100 * (1 - eduMissing / totalEduFields)
        : cvData.education.length > 0
        ? 50
        : 0 // Give partial credit if array exists

    const experienceScore =
      totalExpFields > 0
        ? 100 * (1 - expMissing / totalExpFields)
        : cvData.experience.length > 0
        ? 50
        : 0 // Give partial credit if array exists

    const skillsScore =
      skillFields > 0
        ? 100 * (1 - skillsMissing / skillFields)
        : Object.keys(cvData.skills).length > 0
        ? 50
        : 0 // Give partial credit if object has keys

    return {
      personalInfo: Math.round(personalInfoScore),
      education: Math.round(educationScore),
      experience: Math.round(experienceScore),
      skills: Math.round(skillsScore),
    }
  }

  /**
   * Check if CV has inconsistent dates
   */
  private hasInconsistentDates(cvData: CVData): boolean {
    // Check education dates
    for (const edu of cvData.education || []) {
      if (edu.startDate && edu.endDate && edu.endDate !== 'Present') {
        const startYear = parseInt(edu.startDate.toString().substring(0, 4))
        const endYear = parseInt(edu.endDate.toString().substring(0, 4))

        // Check if the parsing succeeded and end is before start
        if (!isNaN(startYear) && !isNaN(endYear) && startYear > endYear) {
          return true // Inconsistent dates found
        }
      }
    }

    // Check experience dates
    for (const exp of cvData.experience || []) {
      if (exp.startDate && exp.endDate && exp.endDate !== 'Present') {
        const startYear = parseInt(exp.startDate.toString().substring(0, 4))
        const endYear = parseInt(exp.endDate.toString().substring(0, 4))

        // Check if the parsing succeeded and end is before start
        if (!isNaN(startYear) && !isNaN(endYear) && startYear > endYear) {
          return true // Inconsistent dates found
        }
      }
    }

    return false // No inconsistencies found
  }

  /**
   * Check if CV has unreasonable field lengths
   */
  private hasUnreasonableFieldLengths(cvData: CVData): boolean {
    // Check personal info field lengths
    if (cvData.personalInfo.name && cvData.personalInfo.name.length > 100) {
      return true // Name too long
    }

    if (cvData.personalInfo.email && cvData.personalInfo.email.length > 100) {
      return true // Email too long
    }

    // Check for extremely long institutions or companies
    for (const edu of cvData.education) {
      if (edu.institution && edu.institution.length > 200) {
        return true // Institution name too long
      }
    }

    for (const exp of cvData.experience) {
      if (exp.company && exp.company.length > 200) {
        return true // Company name too long
      }

      // Check for extremely long position titles
      if (exp.position && exp.position.length > 200) {
        return true // Position title too long
      }
    }

    return false // All field lengths are reasonable
  }
}
