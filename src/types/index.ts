import { ConversionType } from './AIProvider'

export interface CVData {
  credits: Array<{
    projectTitle: string
    type: string
    role: string
    productionCompany: string
    director: string
    year: string
    location: string
    link?: string
  }>
  metadata?: {
    processedDate: string
    sourceFile: string
    model?: string
    provider?: string
    error?: string // Add optional error property
    processingTime?: number // Time in seconds it took to process
    conversionType?: ConversionType
    accuracy?: {
      overall: number
      categoryAssignment?: number
      fieldAccuracy?: number
      completeness: number
      structuralValidity?: number
      structuralFidelity: number
      missingFields: string[]
      consensusSource?: string
    }
    emptinessPercentage?: {
      percentage: number
      totalFields: number
      nonEmptyFields: number
      expectedTotalFields?: number
      expectedPercentage?: number
    }
    tokenUsage?: {
      inputTokens: number
      outputTokens: number
      totalTokens: number
      estimatedCost?: number
    }
  }
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    estimatedCost?: number
  }
}

export interface ProcessorOptions {
  verbose?: boolean
  outputPath?: string
  instructionsPath?: string // Path to custom instructions file
  expectedTotalFields?: number // Expected total number of fields for emptiness calculation
  categories?: object[]
}
