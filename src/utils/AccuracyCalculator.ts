import { AccuracyScore, CVData, ProcessorOptions } from '../types'

/**
 * Utility class to calculate accuracy scores for CV data extraction
 */
export class AccuracyCalculator {
  private minAccuracyThreshold: number
  private weights: {
    personalInfo: number
    education: number
    experience: number
    skills: number
  }

  constructor(options: ProcessorOptions = {}) {
    // Default weights for different sections (can be customized)
    this.weights = {
      personalInfo: options.accuracyWeights?.personalInfo || 0.25,
      education: options.accuracyWeights?.education || 0.25,
      experience: options.accuracyWeights?.experience || 0.3,
      skills: options.accuracyWeights?.skills || 0.2,
    }
    this.minAccuracyThreshold = options.minAccuracyThreshold || 70 // Default 70% minimum threshold
  }

  /**
   * Calculate accuracy score for the extracted CV data
   */
  calculateAccuracy(cvData: CVData): AccuracyScore {
    // Ensure all required objects exist
    if (!cvData.personalInfo)
      cvData.personalInfo = {
        name: null,
        email: null,
        phone: null,
        location: null,
        linkedin: null,
        github: null,
      }
    if (!cvData.education) cvData.education = []
    if (!cvData.experience) cvData.experience = []
    if (!cvData.skills) cvData.skills = {}
    if (!cvData.metadata)
      cvData.metadata = {
        processedDate: new Date().toISOString(),
        sourceFile: 'unknown',
      }

    const missingFields: string[] = []

    // Calculate scores for each section
    const personalInfoScore = this.calculatePersonalInfoScore(
      cvData.personalInfo,
      missingFields
    )
    const educationScore = this.calculateEducationScore(
      cvData.education,
      missingFields
    )
    const experienceScore = this.calculateExperienceScore(
      cvData.experience,
      missingFields
    )
    const skillsScore = this.calculateSkillsScore(cvData.skills, missingFields)

    // Calculate weighted overall score
    const fieldScores = {
      personalInfo: Math.round(personalInfoScore * 100),
      education: Math.round(educationScore * 100),
      experience: Math.round(experienceScore * 100),
      skills: Math.round(skillsScore * 100),
    }

    const overallScore =
      personalInfoScore * this.weights.personalInfo +
      educationScore * this.weights.education +
      experienceScore * this.weights.experience +
      skillsScore * this.weights.skills

    // Calculate completeness based on required fields
    const completeness = this.calculateCompleteness(cvData, missingFields)

    // For confidence, we can use a heuristic based on null values and field consistency
    const confidence = this.calculateConfidence(cvData)

    return {
      score: Math.round(overallScore * 100), // Convert to percentage
      completeness: Math.round(completeness * 100), // Convert to percentage
      confidence: Math.round(confidence * 100), // Convert to percentage
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
   * Calculate score for personal information section
   */
  private calculatePersonalInfoScore(
    personalInfo: CVData['personalInfo'],
    missingFields: string[]
  ): number {
    // Ensure personalInfo object exists
    if (!personalInfo) {
      missingFields.push('personalInfo')
      return 0
    }

    let score = 0
    let totalFields = 0

    // Required fields with higher weight
    const requiredFields: Array<keyof typeof personalInfo> = [
      'name',
      'email',
      'phone',
    ]
    const optionalFields: Array<keyof typeof personalInfo> = [
      'location',
      'linkedin',
      'github',
      'summary',
    ]

    // Check required fields (70% of score)
    requiredFields.forEach((field) => {
      totalFields++
      if (personalInfo[field]) {
        score += 0.7 / requiredFields.length
      } else {
        missingFields.push(`personalInfo.${field}`)
      }
    })

    // Check optional fields (30% of score)
    optionalFields.forEach((field) => {
      totalFields++
      if (personalInfo[field]) {
        score += 0.3 / optionalFields.length
      }
    })

    return score
  }

  /**
   * Calculate score for education section
   */
  private calculateEducationScore(
    education: CVData['education'],
    missingFields: string[]
  ): number {
    if (!education || education.length === 0) {
      missingFields.push('education')
      return 0
    }

    let totalScore = 0

    // Score each education entry
    education.forEach((edu, index) => {
      let entryScore = 0
      let requiredFieldsCount = 0

      // Check required fields
      const requiredFields: Array<keyof typeof edu> = [
        'institution',
        'degree',
        'fieldOfStudy',
      ]
      const optionalFields: Array<keyof typeof edu> = [
        'startDate',
        'endDate',
        'gpa',
        'location',
      ]

      // Required fields (75% of score)
      requiredFields.forEach((field) => {
        requiredFieldsCount++
        if (edu[field]) {
          entryScore += 0.75 / requiredFields.length
        } else {
          missingFields.push(`education[${index}].${field}`)
        }
      })

      // Optional fields (25% of score)
      optionalFields.forEach((field) => {
        if (edu[field]) {
          entryScore += 0.25 / optionalFields.length
        }
      })

      totalScore += entryScore
    })

    // Average score across all education entries
    return Math.min(1, totalScore / Math.max(1, education.length))
  }

  /**
   * Calculate score for experience section
   */
  private calculateExperienceScore(
    experience: CVData['experience'],
    missingFields: string[]
  ): number {
    if (!experience || experience.length === 0) {
      missingFields.push('experience')
      return 0
    }

    let totalScore = 0

    // Score each experience entry
    experience.forEach((exp, index) => {
      let entryScore = 0

      // Check required fields
      const requiredFields: Array<keyof typeof exp> = ['company', 'position']
      const dateFields: Array<keyof typeof exp> = ['startDate', 'endDate']
      const otherFields: Array<keyof typeof exp> = ['location']

      // Required fields (60% of score)
      requiredFields.forEach((field) => {
        if (exp[field]) {
          entryScore += 0.6 / requiredFields.length
        } else {
          missingFields.push(`experience[${index}].${field}`)
        }
      })

      // Date fields (30% of score)
      dateFields.forEach((field) => {
        if (exp[field]) {
          entryScore += 0.3 / dateFields.length
        }
      })

      // Other fields (10% of score)
      otherFields.forEach((field) => {
        if (exp[field]) {
          entryScore += 0.1 / otherFields.length
        }
      })

      // Check for description content
      if (exp.description && exp.description.length > 0) {
        // Bonus for having comprehensive descriptions
        entryScore *= 1 + Math.min(0.2, exp.description.length * 0.02)
      } else {
        missingFields.push(`experience[${index}].description`)
      }

      totalScore += entryScore
    })

    // Average score across all experience entries, capped at 1.0
    return Math.min(1, totalScore / Math.max(1, experience.length))
  }

  /**
   * Calculate score for skills section
   */
  private calculateSkillsScore(
    skills: CVData['skills'],
    missingFields: string[]
  ): number {
    // Ensure skills object exists
    if (!skills) {
      missingFields.push('skills')
      return 0
    }

    let score = 0
    const skillSections: Array<keyof typeof skills> = [
      'programmingLanguages',
      'frameworks',
      'tools',
      'softSkills',
      'other',
    ]

    // Check if at least one skill section has content
    let hasAnySkills = false
    let populatedSections = 0

    skillSections.forEach((section) => {
      if (skills[section] && skills[section]!.length > 0) {
        hasAnySkills = true
        populatedSections++

        // Bonus for more comprehensive skill lists
        if (skills[section]!.length >= 5) {
          score += 0.2
        } else {
          score += 0.1
        }
      }
    })

    if (!hasAnySkills) {
      missingFields.push('skills')
      return 0
    }

    // Base score from populated sections ratio
    const baseScore = populatedSections / skillSections.length

    // Combine base score and bonuses, but cap at 1.0
    return Math.min(1, baseScore + score * 0.5)
  }

  /**
   * Calculate overall completeness of CV data
   */
  private calculateCompleteness(
    cvData: CVData,
    missingFields: string[]
  ): number {
    const totalFields = this.countTotalFields(cvData)
    const populatedFields = totalFields - missingFields.length

    return populatedFields / totalFields
  }

  /**
   * Count total number of fields in the CV data
   */
  private countTotalFields(cvData: CVData): number {
    // This is a simplified calculation
    let count = 0

    // Personal info fields
    count += 7

    // Education fields (per entry)
    const eduFieldsPerEntry = 7
    count += (cvData.education || []).length * eduFieldsPerEntry

    // Experience fields (per entry)
    const expFieldsPerEntry = 6
    count += (cvData.experience || []).length * expFieldsPerEntry

    // Skills sections
    count += 5

    return count
  }

  /**
   * Calculate confidence in the extracted data
   */
  private calculateConfidence(cvData: CVData): number {
    // This is a heuristic calculation
    let confidence = 0.8 // Start with a base confidence

    // Reduce confidence for AI-extracted data (less verifiable)
    if (cvData.metadata?.provider?.toLowerCase().includes('ai')) {
      confidence *= 0.9
    }

    // Check for data consistency
    if (this.hasConsistentDates(cvData)) {
      confidence *= 1.1
    }

    // Check for reasonable data lengths
    if (this.hasReasonableDataLengths(cvData)) {
      confidence *= 1.1
    }

    return Math.min(1, confidence)
  }

  /**
   * Check if dates in the CV are consistent (e.g., no education ending before it starts)
   */
  private hasConsistentDates(cvData: CVData): boolean {
    // Check education dates
    for (const edu of cvData.education || []) {
      if (edu.startDate && edu.endDate) {
        const start = new Date(edu.startDate)
        const end = new Date(edu.endDate)

        if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start > end) {
          return false
        }
      }
    }

    // Check experience dates
    for (const exp of cvData.experience || []) {
      if (exp.startDate && exp.endDate) {
        const start = new Date(exp.startDate)
        const end = new Date(exp.endDate)

        if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start > end) {
          return false
        }
      }
    }

    return true
  }

  /**
   * Check if data field lengths are reasonable
   */
  private hasReasonableDataLengths(cvData: CVData): boolean {
    // Check personal info
    if (cvData.personalInfo?.name && cvData.personalInfo.name.length > 100) {
      return false
    }

    if (cvData.personalInfo?.email && cvData.personalInfo.email.length > 100) {
      return false
    }

    // Check education
    for (const edu of cvData.education || []) {
      if (edu.institution && edu.institution.length > 200) {
        return false
      }

      if (edu.degree && edu.degree.length > 200) {
        return false
      }
    }

    return true
  }
}
