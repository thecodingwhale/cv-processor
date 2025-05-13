export interface AIModelConfig {
  apiKey: string
  model: string
  temperature?: number
  maxTokens?: number
}

/**
 * Token usage information returned by AI providers
 */
export interface TokenUsageInfo {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost?: number
}

export interface AIResponseFormat {
  text: string
  structuredData?: any
  tokenUsage?: TokenUsageInfo
}

export interface AIProvider {
  /**
   * Extract structured data from text using the AI model
   */
  extractStructuredData<T>(
    imageUrls: string[],
    dataSchema: object,
    instructions: string
  ): Promise<T & { tokenUsage?: TokenUsageInfo }>

  /**
   * Process PDF directly using the AI model (if supported)
   */
  processPDF?(pdfPath: string, prompt: string): Promise<AIResponseFormat>

  /**
   * Get model information
   */
  getModelInfo(): { provider: string; model: string }
}
