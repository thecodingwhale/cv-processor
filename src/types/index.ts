export interface CVData {
  metadata: {
    processedDate: string
    sourceFile: string
    model?: string
    provider?: string
    error?: string // Add optional error property
    processingTime?: number // Time in seconds it took to process
  }
}

export interface ProcessorOptions {
  verbose?: boolean
  outputPath?: string
  instructionsPath?: string // Path to custom instructions file
}
