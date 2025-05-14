/**
 * AccuracyScorer - Evaluates the accuracy of extracted CV data
 *
 * This utility helps measure how well the AI extraction performed by:
 * - Checking structural validity (schema compliance)
 * - Measuring field completeness
 * - Validating category/type assignments
 * - Calculating an overall accuracy score
 */

interface AccuracyResult {
  overall: number
  categoryAssignment: number
  completeness: number
  structuralValidity: number
  missingFields: string[]
}

/**
 * The official categories/types that are allowed in the CV
 */
const OFFICIAL_CATEGORIES = [
  'Film',
  'Television',
  'TV',
  'Commercial',
  'Theatre',
  'Theater',
  'Print',
  'Fashion',
  'Training',
  'Voice',
  'Stunt',
  'Corporate',
  'MC',
  'Presenting',
  'Extras',
  'Other',
]

/**
 * Required fields for each credit
 */
const REQUIRED_CREDIT_FIELDS = ['title', 'role', 'year', 'director']

export class AccuracyScorer {
  /**
   * Evaluate the accuracy of CV data extraction
   */
  static evaluateAccuracy(cvData: any): AccuracyResult {
    // Default accuracy result
    const result: AccuracyResult = {
      overall: 0,
      categoryAssignment: 0,
      completeness: 0,
      structuralValidity: 0,
      missingFields: [],
    }

    // Check if the data has the expected structure
    const structuralValidity = this.checkStructuralValidity(cvData)
    result.structuralValidity = structuralValidity

    // If the structure is invalid, return low scores
    if (structuralValidity < 50) {
      result.overall = structuralValidity
      return result
    }

    // Calculate category assignment accuracy
    result.categoryAssignment = this.checkCategoryAssignment(cvData)

    // Calculate field completeness
    const completenessResult = this.checkCompleteness(cvData)
    result.completeness = completenessResult.score
    result.missingFields = completenessResult.missingFields

    // Calculate the overall score
    result.overall = this.calculateOverallScore(result)

    return result
  }

  /**
   * Check the structural validity of the CV data
   * Returns a score from 0-100
   */
  private static checkStructuralValidity(cvData: any): number {
    // Detect format
    const hasResumeStructure = cvData.resume && Array.isArray(cvData.resume)
    const hasCreditsStructure = cvData.credits && Array.isArray(cvData.credits)

    // If neither structure exists, return 0
    if (!hasResumeStructure && !hasCreditsStructure) {
      return 0
    }

    // Check resume structure (hierarchical)
    if (hasResumeStructure) {
      let score = 0

      // Check if resume_show_years is present (bonus points)
      if (typeof cvData.resume_show_years === 'boolean') {
        score += 10
      }

      // Check each resume entry for proper structure
      let totalCategories = cvData.resume.length
      if (totalCategories === 0) {
        return Math.min(score + 40, 50) // Cap at 50 if no categories found
      }

      let validCategories = 0
      let totalCredits = 0
      let validCredits = 0

      for (const category of cvData.resume) {
        if (
          category.category &&
          category.credits &&
          Array.isArray(category.credits)
        ) {
          validCategories++

          // Check credits in each category
          totalCredits += category.credits.length
          for (const credit of category.credits) {
            if (this.isValidCredit(credit)) {
              validCredits++
            }
          }
        }
      }

      // Calculate validity scores
      const categoryScore =
        totalCategories > 0 ? (validCategories / totalCategories) * 100 : 0
      const creditScore =
        totalCredits > 0 ? (validCredits / totalCredits) * 100 : 0

      // Final structural validity score (weighted average)
      return Math.round(score + categoryScore * 0.4 + creditScore * 0.5)
    }

    // Check credits structure (flat)
    if (hasCreditsStructure) {
      // Empty credits array
      if (cvData.credits.length === 0) {
        return 50 // Basic structure exists but no content
      }

      // Check each credit for proper structure
      let validCredits = 0
      for (const credit of cvData.credits) {
        if (this.isValidCredit(credit)) {
          validCredits++
        }
      }

      // Percentage of valid credits
      const creditsScore = (validCredits / cvData.credits.length) * 100
      return Math.round(creditsScore)
    }

    return 0
  }

  /**
   * Check if a credit object has the expected structure
   */
  private static isValidCredit(credit: any): boolean {
    // Must have at least title and role
    if (!credit.title || !credit.role) {
      return false
    }

    return true
  }

  /**
   * Check how well categories are assigned based on official categories
   * Returns a score from 0-100
   */
  private static checkCategoryAssignment(cvData: any): number {
    // Detect format
    const hasResumeStructure = cvData.resume && Array.isArray(cvData.resume)
    const hasCreditsStructure = cvData.credits && Array.isArray(cvData.credits)

    // Check resume structure (hierarchical)
    if (hasResumeStructure) {
      let totalCategories = cvData.resume.length
      if (totalCategories === 0) {
        return 0
      }

      let validCategories = 0
      for (const category of cvData.resume) {
        if (category.category && this.isValidCategoryName(category.category)) {
          validCategories++
        }
      }

      return Math.round((validCategories / totalCategories) * 100)
    }

    // Check credits structure (flat)
    if (hasCreditsStructure) {
      let totalCredits = cvData.credits.length
      if (totalCredits === 0) {
        return 0
      }

      let validCategories = 0
      for (const credit of cvData.credits) {
        if (credit.type && this.isValidCategoryName(credit.type)) {
          validCategories++
        }
      }

      return Math.round((validCategories / totalCredits) * 100)
    }

    return 0
  }

  /**
   * Check if a category string is valid by comparing to official categories
   * Uses partial matching to handle variations
   */
  private static isValidCategoryName(category: string): boolean {
    if (!category || typeof category !== 'string') {
      return false
    }

    // Normalize the category for comparison
    const normalizedCategory = category.toLowerCase().trim()

    // Check if any official category is contained in this category string
    return OFFICIAL_CATEGORIES.some((officialCat) =>
      normalizedCategory.includes(officialCat.toLowerCase())
    )
  }

  /**
   * Check completeness of fields in the CV data
   * Returns a score from 0-100 and a list of missing fields
   */
  private static checkCompleteness(cvData: any): {
    score: number
    missingFields: string[]
  } {
    // Detect format
    const hasResumeStructure = cvData.resume && Array.isArray(cvData.resume)
    const hasCreditsStructure = cvData.credits && Array.isArray(cvData.credits)

    const missingFields: string[] = []
    let totalFields = 0
    let filledFields = 0

    // Check resume structure (hierarchical)
    if (hasResumeStructure) {
      for (const category of cvData.resume) {
        if (!Array.isArray(category.credits)) {
          missingFields.push(
            `credits array missing in ${
              category.category || 'unknown'
            } category`
          )
          continue
        }

        for (const credit of category.credits) {
          for (const field of REQUIRED_CREDIT_FIELDS) {
            totalFields++

            if (credit[field] && String(credit[field]).trim() !== '') {
              filledFields++
            } else {
              missingFields.push(
                `${field} in ${category.category || 'unknown'} category`
              )
            }
          }
        }
      }
    }

    // Check credits structure (flat)
    if (hasCreditsStructure) {
      for (const credit of cvData.credits) {
        for (const field of REQUIRED_CREDIT_FIELDS) {
          totalFields++

          if (credit[field] && String(credit[field]).trim() !== '') {
            filledFields++
          } else {
            missingFields.push(
              `${field} in credit titled "${credit.title || 'unknown'}"`
            )
          }
        }

        // Check type/category field
        totalFields++
        if (credit.type && String(credit.type).trim() !== '') {
          filledFields++
        } else {
          missingFields.push(
            `type in credit titled "${credit.title || 'unknown'}"`
          )
        }

        // Check optional fields (just for counting completeness)
        const optionalFields = ['productionCompany', 'location', 'link']
        for (const field of optionalFields) {
          if (credit[field] && String(credit[field]).trim() !== '') {
            filledFields++
            totalFields++
          }
        }
      }
    }

    const score =
      totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0

    // Limit the number of missing fields reported
    const uniqueMissingFields = [...new Set(missingFields)]
    const topMissingFields = uniqueMissingFields.slice(0, 10)

    return {
      score,
      missingFields: topMissingFields,
    }
  }

  /**
   * Calculate the overall accuracy score from component scores
   */
  private static calculateOverallScore(result: AccuracyResult): number {
    // Weighted average of component scores
    const score =
      result.structuralValidity * 0.4 +
      result.categoryAssignment * 0.3 +
      result.completeness * 0.3

    return Math.round(score)
  }
}
