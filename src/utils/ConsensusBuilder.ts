import * as fs from 'fs'

/**
 * Interface for consensus results
 */
export interface ConsensusResult {
  consensus: any
  confidence: {
    overall: number
    fields: Record<string, number>
  }
  metadata: {
    providerCount: number
    consensusStrength: number
    generatedAt: string
  }
}

/**
 * The ConsensusBuilder class analyzes multiple CV data extractions
 * and builds a consensus version that represents the most likely correct data.
 */
export class ConsensusBuilder {
  /**
   * Build consensus from multiple CV data files
   */
  public async buildConsensus(dataFiles: string[]): Promise<ConsensusResult> {
    console.log(`Building consensus from ${dataFiles.length} data files...`)

    // Load all data files
    const allData = dataFiles
      .map((file) => {
        try {
          const data = JSON.parse(fs.readFileSync(file, 'utf8'))
          return data
        } catch (error) {
          console.error(`Error loading data file ${file}: ${error}`)
          return null
        }
      })
      .filter((data) => data !== null)

    if (allData.length === 0) {
      throw new Error('No valid data files to build consensus from')
    }

    // Determine if we're dealing with resume array or credits array
    const hasResumeStructure = allData.some(
      (data) => data.resume && Array.isArray(data.resume)
    )
    const hasCreditsStructure = allData.some(
      (data) => data.credits && Array.isArray(data.credits)
    )

    console.log(
      `Data format: ${hasResumeStructure ? 'resume structure' : ''} ${
        hasCreditsStructure ? 'credits structure' : ''
      }`
    )

    let consensus: any
    let confidenceData: Record<string, number> = {}

    // Build consensus based on the structure
    if (hasResumeStructure) {
      const { consensusData, confidence } = this.buildResumeConsensus(allData)
      consensus = consensusData
      confidenceData = confidence
    } else if (hasCreditsStructure) {
      const { consensusData, confidence } = this.buildCreditsConsensus(allData)
      consensus = consensusData
      confidenceData = confidence
    } else {
      throw new Error('Unknown data structure, cannot build consensus')
    }

    // Calculate overall consensus strength
    const confidenceValues = Object.values(confidenceData)
    const consensusStrength =
      confidenceValues.length > 0
        ? confidenceValues.reduce((sum, val) => sum + val, 0) /
          confidenceValues.length
        : 0

    return {
      consensus,
      confidence: {
        overall: Math.round(consensusStrength * 100) / 100,
        fields: confidenceData,
      },
      metadata: {
        providerCount: allData.length,
        consensusStrength: Math.round(consensusStrength * 100) / 100,
        generatedAt: new Date().toISOString(),
      },
    }
  }

  /**
   * Build consensus for resume structure (hierarchical)
   */
  private buildResumeConsensus(allData: any[]): {
    consensusData: any
    confidence: Record<string, number>
  } {
    const result: any = {
      resume: [],
      resume_show_years: this.determineShowYears(allData),
    }

    const confidence: Record<string, number> = {
      resume_show_years: this.calculateConfidence(
        allData.map((data) => data.resume_show_years)
      ),
    }

    // Get all categories from all data
    const allCategories = this.extractAllCategories(allData)

    // For each unique category, build consensus
    for (const categoryName of allCategories) {
      const categoryConsensus = this.buildCategoryConsensus(
        categoryName,
        allData
      )
      if (categoryConsensus.category.credits.length > 0) {
        result.resume.push(categoryConsensus.category)

        // Add confidence scores for this category
        Object.entries(categoryConsensus.confidence).forEach(([key, value]) => {
          confidence[`${categoryName}.${key}`] = value
        })
      }
    }

    return { consensusData: result, confidence }
  }

  /**
   * Build consensus for credits structure (flat)
   */
  private buildCreditsConsensus(allData: any[]): {
    consensusData: any
    confidence: Record<string, number>
  } {
    const result: any = {
      credits: [],
    }

    const confidence: Record<string, number> = {}

    // Collect all credits from all data
    const allCredits: any[] = []
    allData.forEach((data) => {
      if (data.credits && Array.isArray(data.credits)) {
        allCredits.push(...data.credits)
      }
    })

    // Group similar credits
    const groupedCredits = this.groupSimilarCredits(allCredits)

    // For each group, build consensus credit
    for (const [groupKey, creditsGroup] of Object.entries(groupedCredits)) {
      const consensusCredit = this.buildCreditConsensus(creditsGroup)
      result.credits.push(consensusCredit.credit)

      // Add confidence scores for this credit
      Object.entries(consensusCredit.confidence).forEach(([key, value]) => {
        confidence[`credits[${groupKey}].${key}`] = value
      })
    }

    return { consensusData: result, confidence }
  }

  /**
   * Extract all unique categories from all data
   */
  private extractAllCategories(allData: any[]): string[] {
    const categories = new Set<string>()

    allData.forEach((data) => {
      if (data.resume && Array.isArray(data.resume)) {
        data.resume.forEach((category: any) => {
          if (category.category) {
            categories.add(category.category)
          }
        })
      }
    })

    return Array.from(categories)
  }

  /**
   * Build consensus for a specific category
   */
  private buildCategoryConsensus(
    categoryName: string,
    allData: any[]
  ): { category: any; confidence: Record<string, number> } {
    // Extract all credits for this category
    const allCategoryCredits: any[] = []
    allData.forEach((data) => {
      if (data.resume && Array.isArray(data.resume)) {
        const categoryData = data.resume.find(
          (cat: any) => cat.category === categoryName
        )
        if (
          categoryData &&
          categoryData.credits &&
          Array.isArray(categoryData.credits)
        ) {
          allCategoryCredits.push(...categoryData.credits)
        }
      }
    })

    // Group similar credits
    const groupedCredits = this.groupSimilarCredits(allCategoryCredits)

    // Build consensus credits
    const consensusCredits: any[] = []
    const confidence: Record<string, number> = {
      category: 1.0, // Category name has perfect confidence as it's our grouping key
    }

    for (const [groupKey, creditsGroup] of Object.entries(groupedCredits)) {
      const consensusCredit = this.buildCreditConsensus(creditsGroup)
      consensusCredits.push(consensusCredit.credit)

      // Add confidence scores for this credit
      Object.entries(consensusCredit.confidence).forEach(([key, value]) => {
        confidence[`credits[${groupKey}].${key}`] = value
      })
    }

    return {
      category: {
        category: categoryName,
        category_id: this.generateConsistentId(categoryName),
        credits: consensusCredits,
      },
      confidence,
    }
  }

  /**
   * Build consensus for a specific credit from similar credits
   */
  private buildCreditConsensus(credits: any[]): {
    credit: any
    confidence: Record<string, number>
  } {
    const fields = ['title', 'role', 'year', 'director', 'id']
    const result: any = {}
    const confidence: Record<string, number> = {}

    // For each field, find the most common value
    for (const field of fields) {
      const fieldValues = credits.map((credit) => credit[field]).filter(Boolean)
      const { value, confidence: fieldConfidence } =
        this.findConsensusValue(fieldValues)

      if (value !== null) {
        result[field] = value
        confidence[field] = fieldConfidence
      } else if (field === 'id') {
        // Generate a consistent ID if none exists
        result[field] = this.generateConsistentId(JSON.stringify(result))
        confidence[field] = 1.0
      }
    }

    // Add attached_media if present
    result.attached_media = []
    confidence['attached_media'] = 1.0

    return { credit: result, confidence }
  }

  /**
   * Group similar credits based on title and role similarity
   */
  private groupSimilarCredits(credits: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {}

    credits.forEach((credit) => {
      if (!credit.title) return

      // Create a key based on normalized title
      const normalizedTitle = credit.title
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ') // normalize whitespace
        .replace(/[^\w\s]/g, '') // remove special characters

      // Try to find an existing group that's similar
      let foundGroup = false
      for (const [groupKey, groupCredits] of Object.entries(groups)) {
        const firstCredit = groupCredits[0]
        const similarity = this.calculateStringSimilarity(
          normalizedTitle,
          firstCredit.title
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s]/g, '')
        )

        if (similarity > 0.8) {
          // 80% similarity threshold
          groups[groupKey].push(credit)
          foundGroup = true
          break
        }
      }

      // Create a new group if no match found
      if (!foundGroup) {
        const groupKey = Object.keys(groups).length.toString()
        groups[groupKey] = [credit]
      }
    })

    return groups
  }

  /**
   * Find the consensus value from a list of values
   */
  private findConsensusValue(values: any[]): {
    value: any
    confidence: number
  } {
    if (values.length === 0) {
      return { value: null, confidence: 0 }
    }

    // Count occurrences of each value
    const valueCounts: Record<string, number> = {}
    values.forEach((value) => {
      const valueStr = String(value).toLowerCase().trim()
      valueCounts[valueStr] = (valueCounts[valueStr] || 0) + 1
    })

    // Find the most common value
    let mostCommonValue = null
    let highestCount = 0

    for (const [value, count] of Object.entries(valueCounts)) {
      if (count > highestCount) {
        mostCommonValue = value
        highestCount = count
      }
    }

    // Find the original case version of the value
    const originalValue = values.find(
      (v) => String(v).toLowerCase().trim() === mostCommonValue
    )

    // Calculate confidence as the percentage of agreement
    const confidence = highestCount / values.length

    return {
      value: originalValue || null,
      confidence,
    }
  }

  /**
   * Calculate similarity between two strings (Jaccard similarity)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0

    // Create sets of words
    const words1 = new Set(str1.split(/\s+/))
    const words2 = new Set(str2.split(/\s+/))

    // Calculate intersection
    const intersection = new Set([...words1].filter((word) => words2.has(word)))

    // Calculate union
    const union = new Set([...words1, ...words2])

    // Return Jaccard similarity
    return intersection.size / union.size
  }

  /**
   * Determine if years should be shown based on majority
   */
  private determineShowYears(allData: any[]): boolean {
    const values = allData
      .filter((data) => typeof data.resume_show_years === 'boolean')
      .map((data) => data.resume_show_years)

    if (values.length === 0) {
      return true // Default to true if no data
    }

    const trueCount = values.filter(Boolean).length
    return trueCount >= values.length / 2
  }

  /**
   * Calculate confidence score for a list of values
   */
  private calculateConfidence(values: any[]): number {
    if (!values || values.length === 0) return 0

    const filteredValues = values.filter((v) => v !== undefined && v !== null)
    if (filteredValues.length === 0) return 0

    // For boolean values
    if (typeof filteredValues[0] === 'boolean') {
      const trueCount = filteredValues.filter(Boolean).length
      const falseCount = filteredValues.length - trueCount
      return Math.max(trueCount, falseCount) / filteredValues.length
    }

    // For string or number values
    const valueCounts: Record<string, number> = {}
    filteredValues.forEach((value) => {
      const valueStr = String(value).toLowerCase().trim()
      valueCounts[valueStr] = (valueCounts[valueStr] || 0) + 1
    })

    const highestCount = Math.max(...Object.values(valueCounts))
    return highestCount / filteredValues.length
  }

  /**
   * Generate a consistent ID from input data
   */
  private generateConsistentId(input: string): string {
    // Simple hash function for demonstration
    let hash = 0
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32bit integer
    }

    // Format as a UUID-like string
    const hashStr = Math.abs(hash).toString(16).padStart(8, '0')
    return `${hashStr}-${hashStr.substr(0, 4)}-${hashStr.substr(
      4,
      4
    )}-${hashStr.substr(0, 4)}-${hashStr.substr(0, 12)}`
  }
}
