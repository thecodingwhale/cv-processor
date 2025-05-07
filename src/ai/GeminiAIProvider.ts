import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai'
import * as fs from 'fs'
import {
  AIModelConfig,
  AIProvider,
  AIResponseFormat,
} from '../types/AIProvider'

export class GeminiAIProvider implements AIProvider {
  private generativeModel: GenerativeModel
  private config: AIModelConfig

  constructor(config: AIModelConfig) {
    this.config = config
    const genAI = new GoogleGenerativeAI(config.apiKey)
    this.generativeModel = genAI.getGenerativeModel({
      model: config.model || 'gemini-1.5-pro',
      generationConfig: {
        temperature: config.temperature || 0.2,
        maxOutputTokens: config.maxTokens || 8192,
      },
    })
  }

  async processText(text: string, prompt: string): Promise<AIResponseFormat> {
    try {
      const result = await this.generativeModel.generateContent(
        `${prompt}\n\nText content:\n${text}`
      )
      const response = await result.response
      const responseText = response.text()

      return {
        text: responseText,
      }
    } catch (error) {
      console.error('Error processing text with Gemini AI:', error)
      throw error
    }
  }

  async extractStructuredData<T>(
    text: string,
    dataSchema: object,
    instructions: string
  ): Promise<T> {
    try {
      const prompt = `
        ${instructions}
        
        Extract information from the following text according to this JSON schema:
        ${JSON.stringify(dataSchema, null, 2)}
        
        Your response should be valid JSON that matches this schema.
        
        Text content:
        ${text}
      `

      const result = await this.generativeModel.generateContent(prompt)
      const response = await result.response
      const responseText = response.text()

      // Extract JSON from the response
      let jsonStr = responseText

      // If the response has markdown code blocks, extract JSON from them
      if (responseText.includes('```json')) {
        jsonStr = responseText.split('```json')[1].split('```')[0].trim()
      } else if (responseText.includes('```')) {
        jsonStr = responseText.split('```')[1].split('```')[0].trim()
      }

      return JSON.parse(jsonStr) as T
    } catch (error) {
      console.error('Error extracting structured data with Gemini AI:', error)
      throw error
    }
  }

  async processPDF(pdfPath: string, prompt: string): Promise<AIResponseFormat> {
    try {
      // For Gemini 1.5 Pro which supports PDF input
      const fileData = fs.readFileSync(pdfPath)
      const mimeType = 'application/pdf'

      // Create file part for multimodal input
      const filePart = {
        inlineData: {
          data: Buffer.from(fileData).toString('base64'),
          mimeType,
        },
      }

      const result = await this.generativeModel.generateContent([
        prompt,
        filePart,
      ])
      const response = await result.response
      const responseText = response.text()

      return {
        text: responseText,
      }
    } catch (error) {
      console.error('Error processing PDF with Gemini AI:', error)
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
