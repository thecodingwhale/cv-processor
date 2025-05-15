import * as fs from 'fs'
import * as path from 'path'

/**
 * Interface for consensus accuracy results
 */
export interface ConsensusAccuracyResult {
  overall: number
  fieldAccuracy: number
  structuralFidelity: number
  completeness: number
  missingFields: string[]
  metadata: {
    consensusSource: string
    consensusStrength: number
    comparedFields: number
  }
}

/**
 * The ConsensusAccuracyScorer evaluates extracted CV data against
 * established consensus baseline data.
 */
export class ConsensusAccuracyScorer {
  private baseMetrics: any
  private baseMetricsFile: string

  /**
   * Initialize the consensus accuracy scorer
   */
  constructor(cacheDir?: string) {
    this.baseMetricsFile = path.join(
      cacheDir || path.join(process.cwd(), 'cache'),
      'baseMetrics.json'
    )
    this.loadBaseMetrics()
  }

  /**
   * Load base metrics from cache
   */
  private loadBaseMetrics(): void {
    try {
      if (fs.existsSync(this.baseMetricsFile)) {
        this.baseMetrics = JSON.parse(
          fs.readFileSync(this.baseMetricsFile, 'utf8')
        )
        console.log(`Loaded base metrics from ${this.baseMetricsFile}`)
        console.log(
          `Base metrics contain ${
            Object.keys(this.baseMetrics.metrics).length
          } CV templates`
        )
      } else {
        console.warn(`Base metrics file not found: ${this.baseMetricsFile}`)
        this.baseMetrics = null
      }
    } catch (error) {
      console.error(`Error loading base metrics: ${error}`)
      this.baseMetrics = null
    }
  }

  /**
   * Find the best matching consensus for a CV
   */
  private findBestMatchingConsensus(
    cvData: any
  ): { consensus: any; baseCV: string; confidence: any } | null {
    if (!this.baseMetrics || !this.baseMetrics.metrics) {
      return null
    }

    // For now, just use simple matching based on CV filename
    // In a real implementation, this would use more sophisticated matching
    const cvName = cvData.metadata?.sourceFile
    if (cvName && this.baseMetrics.metrics[cvName]) {
      return {
        consensus: this.baseMetrics.metrics[cvName].consensus,
        baseCV: cvName,
        confidence: this.baseMetrics.metrics[cvName].confidence,
      }
    }

    // If no exact match, could implement fuzzy matching here
    // For now, just return null
    return null
  }

  /**
   * Evaluate accuracy against consensus
   */
  public evaluateAccuracy(cvData: any): ConsensusAccuracyResult {
    // Default accuracy result
    const result: ConsensusAccuracyResult = {
      overall: 0,
      fieldAccuracy: 0,
      structuralFidelity: 0,
      completeness: 0,
      missingFields: [],
      metadata: {
        consensusSource: 'none',
        consensusStrength: 0,
        comparedFields: 0,
      },
    }

    // Find matching consensus
    const consensusMatch = this.findBestMatchingConsensus(cvData)
    if (!consensusMatch) {
      console.warn('No matching consensus found for this CV')
      return result
    }

    const { consensus, baseCV, confidence } = consensusMatch

    // Determine if we're dealing with resume array or credits array
    const hasResumeStructure = cvData.resume && Array.isArray(cvData.resume)
    const hasCreditsStructure = cvData.credits && Array.isArray(cvData.credits)

    const consensusHasResumeStructure =
      consensus.resume && Array.isArray(consensus.resume)
    const consensusHasCreditsStructure =
      consensus.credits && Array.isArray(consensus.credits)

    // Make sure structures match between consensus and data
    const structuresMatch =
      (hasResumeStructure && consensusHasResumeStructure) ||
      (hasCreditsStructure && consensusHasCreditsStructure)

    if (!structuresMatch) {
      console.warn('Data structure does not match consensus structure')
      result.structuralFidelity = 30 // Partial credit for having some structure
      result.overall = 30
      return result
    }

    // Calculate structural fidelity
    const structuralFidelity = this.calculateStructuralFidelity(
      cvData,
      consensus
    )
    result.structuralFidelity = structuralFidelity

    // Calculate field accuracy and completeness
    const fieldResults = this.calculateFieldAccuracy(
      cvData,
      consensus,
      confidence
    )
    result.fieldAccuracy = fieldResults.accuracy
    result.completeness = fieldResults.completeness
    result.missingFields = fieldResults.missingFields

    // Calculate overall score
    result.overall = Math.round(
      result.structuralFidelity * 0.3 +
        result.fieldAccuracy * 0.4 +
        result.completeness * 0.3
    )

    // Add metadata
    result.metadata = {
      consensusSource: baseCV,
      consensusStrength: confidence.overall || 0,
      comparedFields: fieldResults.comparedFields,
    }

    return result
  }

  /**
   * Calculate structural fidelity against consensus
   */
  private calculateStructuralFidelity(cvData: any, consensus: any): number {
    // If resume structure
    if (cvData.resume && consensus.resume) {
      // Check if categories match
      const consensusCategories = new Set(
        consensus.resume.map((cat: any) => cat.category)
      )
      const dataCategories = new Set(
        cvData.resume.map((cat: any) => cat.category)
      )

      // Calculate category match percentage
      const categoriesInBoth = new Set(
        [...consensusCategories].filter((cat) => dataCategories.has(cat))
      )

      const categoryScore =
        consensusCategories.size > 0
          ? (categoriesInBoth.size / consensusCategories.size) * 100
          : 0

      // Check if credits structure in each category matches
      let creditsScore = 0
      let totalCategories = 0

      for (const category of consensus.resume) {
        const dataCategory = cvData.resume.find(
          (cat: any) => cat.category === category.category
        )
        if (dataCategory) {
          totalCategories++
          const consensusCreditsCount = category.credits.length
          const dataCreditsCount = dataCategory.credits.length

          // Calculate similarity in credits count
          const countSimilarity =
            Math.min(dataCreditsCount, consensusCreditsCount) /
            Math.max(dataCreditsCount, consensusCreditsCount)

          creditsScore += countSimilarity * 100
        }
      }

      const averageCreditsScore =
        totalCategories > 0 ? creditsScore / totalCategories : 0

      // Calculate overall structural fidelity
      return Math.round(categoryScore * 0.6 + averageCreditsScore * 0.4)
    }

    // If credits structure
    if (cvData.credits && consensus.credits) {
      const consensusCreditsCount = consensus.credits.length
      const dataCreditsCount = cvData.credits.length

      // Calculate similarity in credits count
      const countSimilarity =
        Math.min(dataCreditsCount, consensusCreditsCount) /
        Math.max(dataCreditsCount, consensusCreditsCount)

      return Math.round(countSimilarity * 100)
    }

    return 0
  }

  /**
   * Calculate field accuracy and completeness against consensus
   */
  private calculateFieldAccuracy(
    cvData: any,
    consensus: any,
    confidence: any
  ): {
    accuracy: number
    completeness: number
    missingFields: string[]
    comparedFields: number
  } {
    let totalFields = 0
    let matchedFields = 0
    let totalExpectedFields = 0
    let presentExpectedFields = 0
    const missingFields: string[] = []

    // If resume structure
    if (cvData.resume && consensus.resume) {
      // For each category in consensus
      for (const consensusCategory of consensus.resume) {
        const dataCategory = cvData.resume.find(
          (cat: any) => cat.category === consensusCategory.category
        )

        if (!dataCategory) {
          // Missing category
          missingFields.push(`Category: ${consensusCategory.category}`)
          totalExpectedFields += consensusCategory.credits.length * 4 // approximate fields
          continue
        }

        // For each credit in consensus category
        for (const consensusCredit of consensusCategory.credits) {
          // Find matching credit in data
          const matchingCredit = this.findMatchingCredit(
            consensusCredit,
            dataCategory.credits
          )

          if (!matchingCredit) {
            // Missing credit
            missingFields.push(
              `Credit: ${consensusCredit.title} in ${consensusCategory.category}`
            )
            totalExpectedFields += 4 // approximate fields
            continue
          }

          // Compare fields
          const fields = ['title', 'role', 'year', 'director']
          fields.forEach((field) => {
            totalExpectedFields++

            if (matchingCredit[field]) {
              presentExpectedFields++

              // Compare field values
              totalFields++
              const similarity = this.calculateFieldSimilarity(
                consensusCredit[field],
                matchingCredit[field]
              )

              // Apply confidence weighting
              const fieldConfidence =
                confidence.fields[
                  `${consensusCategory.category}.credits[0].${field}`
                ] || 0.5
              matchedFields += similarity * fieldConfidence
            } else {
              missingFields.push(`${field} in ${consensusCredit.title}`)
            }
          })
        }
      }
    }

    // If credits structure
    if (cvData.credits && consensus.credits) {
      // For each credit in consensus
      for (const consensusCredit of consensus.credits) {
        // Find matching credit in data
        const matchingCredit = this.findMatchingCredit(
          consensusCredit,
          cvData.credits
        )

        if (!matchingCredit) {
          // Missing credit
          missingFields.push(`Credit: ${consensusCredit.title}`)
          totalExpectedFields += 4 // approximate fields
          continue
        }

        // Compare fields
        const fields = ['title', 'role', 'year', 'director', 'type']
        fields.forEach((field) => {
          totalExpectedFields++

          if (matchingCredit[field]) {
            presentExpectedFields++

            // Compare field values
            totalFields++
            const similarity = this.calculateFieldSimilarity(
              consensusCredit[field],
              matchingCredit[field]
            )

            // Apply confidence weighting
            const fieldConfidence =
              confidence.fields[`credits[0].${field}`] || 0.5
            matchedFields += similarity * fieldConfidence
          } else {
            missingFields.push(`${field} in ${consensusCredit.title}`)
          }
        })
      }
    }

    // Calculate scores
    const accuracy =
      totalFields > 0 ? Math.round((matchedFields / totalFields) * 100) : 0

    const completeness =
      totalExpectedFields > 0
        ? Math.round((presentExpectedFields / totalExpectedFields) * 100)
        : 0

    // Limit the number of missing fields reported
    const uniqueMissingFields = [...new Set(missingFields)]
    const topMissingFields = uniqueMissingFields.slice(0, 10)

    return {
      accuracy,
      completeness,
      missingFields: topMissingFields,
      comparedFields: totalFields,
    }
  }

  /**
   * Find matching credit by title similarity
   */
  private findMatchingCredit(consensusCredit: any, credits: any[]): any {
    if (!credits || !Array.isArray(credits)) {
      return null
    }

    // Try to find by exact title match first
    const exactMatch = credits.find(
      (credit) => credit.title === consensusCredit.title
    )

    if (exactMatch) {
      return exactMatch
    }

    // Try to find by title similarity
    let bestMatch = null
    let bestSimilarity = 0

    for (const credit of credits) {
      if (!credit.title || !consensusCredit.title) continue

      const similarity = this.calculateStringSimilarity(
        credit.title,
        consensusCredit.title
      )

      if (similarity > bestSimilarity && similarity > 0.6) {
        // 60% threshold
        bestMatch = credit
        bestSimilarity = similarity
      }
    }

    return bestMatch
  }

  /**
   * Calculate similarity between two field values
   */
  private calculateFieldSimilarity(value1: any, value2: any): number {
    if (value1 === value2) {
      return 1.0 // Perfect match
    }

    if (typeof value1 === 'string' && typeof value2 === 'string') {
      // String similarity for text fields
      return this.calculateStringSimilarity(value1, value2)
    }

    // For other types, return 0 or 1
    return 0
  }

  /**
   * Calculate string similarity (case-insensitive)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0

    // Normalize strings
    const norm1 = str1.toLowerCase().trim().replace(/\s+/g, ' ')
    const norm2 = str2.toLowerCase().trim().replace(/\s+/g, ' ')

    if (norm1 === norm2) {
      return 1.0 // Perfect match after normalization
    }

    // Simple Jaccard similarity for word overlap
    const words1 = new Set(norm1.split(/\s+/))
    const words2 = new Set(norm2.split(/\s+/))

    const intersection = new Set([...words1].filter((word) => words2.has(word)))
    const union = new Set([...words1, ...words2])

    return intersection.size / union.size
  }
}
