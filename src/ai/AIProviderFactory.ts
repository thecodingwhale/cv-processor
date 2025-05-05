import { AIModelConfig, AIProvider } from '../types/AIProvider'
import { GeminiAIProvider } from './GeminiAIProvider'

export type AIProviderType = 'gemini' | 'openai' | 'anthropic'

export class AIProviderFactory {
  /**
   * Create an AI provider instance based on the specified type
   */
  static createProvider(
    type: AIProviderType,
    config: AIModelConfig
  ): AIProvider {
    switch (type) {
      case 'gemini':
        return new GeminiAIProvider(config)
      // Add more providers as needed
      // case 'openai':
      //   return new OpenAIProvider(config);
      // case 'anthropic':
      //   return new AnthropicProvider(config);
      default:
        throw new Error(`AI provider type ${type} not supported`)
    }
  }
}
