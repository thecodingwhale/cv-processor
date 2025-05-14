import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai'
import { jsonrepair } from 'jsonrepair'
import { AIModelConfig, AIProvider, TokenUsageInfo } from '../types/AIProvider'
import { replaceUUIDv4Placeholders } from '../utils/data'

export class GeminiAIProvider implements AIProvider {
  private generativeModel: GenerativeModel
  private config: AIModelConfig

  constructor(config: AIModelConfig) {
    this.config = config
    const genAI = new GoogleGenerativeAI(config.apiKey)
    this.generativeModel = genAI.getGenerativeModel({
      model: config.model || 'gemini-1.5-pro',
      generationConfig: {
        temperature: config.temperature || 0,
        maxOutputTokens: config.maxTokens || 8192,
        topP: 1,
        topK: 50,
        candidateCount: 1,
      },
    })
  }

  async extractStructuredData<T>(
    imageUrls: string[],
    dataSchema: object,
    instructions: string
  ): Promise<T & { tokenUsage?: TokenUsageInfo }> {
    try {
      const prompt = `
        ${instructions}
        
        Extract information from the following document according to this JSON schema:
        ${JSON.stringify(dataSchema, null, 2)}
                
        Images
        ${imageUrls}

        Your response should be valid JSON that matches this schema.
      `

      const result = await this.generativeModel.generateContent(prompt)
      const response = await result.response
      const responseText = response.text()

      try {
        let fixedJson
        try {
          fixedJson = jsonrepair(responseText)
        } catch (err) {
          console.error('❌ Could not repair JSON:', err)
          throw new Error(`AI returned invalid JSON: ${err}`)
        }

        const parsedJson = JSON.parse(fixedJson)

        return {
          ...replaceUUIDv4Placeholders(parsedJson),
        }
      } catch (jsonError) {
        console.error('Error parsing JSON from OpenAI response:', jsonError)
        throw jsonError
      }
    } catch (error) {
      console.error('Error extracting structured data with Gemini AI:', error)
      throw error
    }
  }

  getModelInfo(): { provider: string; model: string } {
    return {
      provider: 'gemini',
      model: this.config.model || 'gemini-1.5-pro',
    }
  }
}
