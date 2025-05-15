export interface CVData {
  metadata: {
    processedDate: string
    sourceFile: string
    model?: string
    provider?: string
    error?: string // Add optional error property
    processingTime?: number // Time in seconds it took to process
    accuracy?: {
      overall: number
      categoryAssignment?: number
      fieldAccuracy?: number
      completeness: number
      structuralValidity?: number
      structuralFidelity?: number
      missingFields: string[]
      consensusSource?: string
    }
  }
}

export interface ProcessorOptions {
  verbose?: boolean
  outputPath?: string
  instructionsPath?: string // Path to custom instructions file
}
