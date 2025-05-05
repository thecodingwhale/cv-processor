export interface AIModelConfig {
  apiKey: string
  model: string
  temperature?: number
  maxTokens?: number
}

export interface AIResponseFormat {
  text: string
  structuredData?: any
}

export interface AIProvider {
  /**
   * Process text using the AI model
   */
  processText(text: string, prompt: string): Promise<AIResponseFormat>

  /**
   * Extract structured data from text using the AI model
   */
  extractStructuredData<T>(
    text: string,
    dataSchema: object,
    instructions: string
  ): Promise<T>

  /**
   * Process PDF directly using the AI model (if supported)
   */
  processPDF?(pdfPath: string, prompt: string): Promise<AIResponseFormat>
}
