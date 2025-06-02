export interface AIModelConfig {
  apiKey: string
  model: string
  temperature?: number
  maxTokens?: number
}

export enum ConversionType {
  PdfToImages = 'PdfToImages',
  PdfToTexts = 'PdfToTexts',
  UrlToTexts = 'UrlToTexts',
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
   * Extract structured data from images using the AI model
   */
  extractStructuredDataFromImages<T>(
    imageUrls: string[],
    dataSchema: object,
    instructions: string
  ): Promise<T & { tokenUsage?: TokenUsageInfo }>

  /**
   * Extract structured data from text using the AI model
   */
  extractStructuredDataFromText<T>(
    texts: string[],
    dataSchema: object,
    instructions: string
  ): Promise<T & { tokenUsage?: TokenUsageInfo }>

  /**
   * Get model information
   */
  getModelInfo(): { provider: string; model: string }
}
