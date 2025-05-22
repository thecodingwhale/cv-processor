/**
 * Interface for emptiness percentage results
 */
export interface EmptinessPercentageResult {
  percentage: number
  totalFields: number
  nonEmptyFields: number
  expectedTotalFields?: number
  expectedPercentage?: number
}

/**
 * Calculates the percentage of non-empty fields in the CV data
 */
export class EmptinessPercentageCalculator {
  /**
   * Calculate the emptiness percentage for CV data
   * Returns the percentage of non-empty fields as a value between 0-100
   */
  public static calculateEmptinessPercentage(
    data: any,
    expectedTotalFields?: number
  ): EmptinessPercentageResult {
    const counts = this.countFieldsRecursive(data)

    // Calculate percentage of non-empty fields
    const percentage =
      counts.totalFields > 0
        ? Math.round((counts.nonEmptyFields / counts.totalFields) * 100)
        : 0

    // Create result object
    const result: EmptinessPercentageResult = {
      percentage,
      totalFields: counts.totalFields,
      nonEmptyFields: counts.nonEmptyFields,
    }

    // Calculate expected percentage if expectedTotalFields is provided
    if (expectedTotalFields !== undefined) {
      result.expectedTotalFields = expectedTotalFields
      result.expectedPercentage =
        expectedTotalFields > 0
          ? Math.round((counts.nonEmptyFields / expectedTotalFields) * 100)
          : 0
    }

    return result
  }

  /**
   * Recursively count total fields and non-empty fields
   */
  private static countFieldsRecursive(obj: any): {
    totalFields: number
    nonEmptyFields: number
  } {
    // Initialize counts
    let totalFields = 0
    let nonEmptyFields = 0

    // Skip if null or undefined
    if (obj === null || obj === undefined) {
      return { totalFields, nonEmptyFields }
    }

    // Handle different data types
    if (typeof obj === 'object') {
      if (Array.isArray(obj)) {
        // For arrays, process each item
        for (const item of obj) {
          const result = this.countFieldsRecursive(item)
          totalFields += result.totalFields
          nonEmptyFields += result.nonEmptyFields
        }
      } else {
        // For objects, process each property
        for (const key in obj) {
          // Skip metadata and certain properties that shouldn't be counted
          if (key === 'metadata' || key === 'tokenUsage') {
            continue
          }

          const value = obj[key]
          if (typeof value === 'object' && value !== null) {
            // Recursively process nested objects
            const result = this.countFieldsRecursive(value)
            totalFields += result.totalFields
            nonEmptyFields += result.nonEmptyFields
          } else {
            // Count leaf nodes (fields with primitive values)
            totalFields++
            if (this.isNonEmptyValue(value)) {
              nonEmptyFields++
            }
          }
        }
      }
    } else {
      // For primitive values, count as a single field
      totalFields++
      if (this.isNonEmptyValue(obj)) {
        nonEmptyFields++
      }
    }

    return { totalFields, nonEmptyFields }
  }

  /**
   * Check if a value is considered non-empty
   */
  private static isNonEmptyValue(value: any): boolean {
    // Handle different types of emptiness
    if (value === undefined || value === null) {
      return false
    }

    if (typeof value === 'string' && value.trim() === '') {
      return false
    }

    if (
      Array.isArray(value) &&
      (value.length === 0 || value.every((item) => !this.isNonEmptyValue(item)))
    ) {
      return false
    }

    return true
  }
}
