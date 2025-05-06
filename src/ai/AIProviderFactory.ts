import { AIModelConfig, AIProvider } from '../types/AIProvider'
import { AWSBedrockConfig, AWSBedrockProvider } from './AWSBedrockProvider'
import { AzureOpenAIConfig, AzureOpenAIProvider } from './AzureOpenAIProvider'
import { GeminiAIProvider } from './GeminiAIProvider'
import { GrokAIConfig, GrokAIProvider } from './GrokAIProvider'
import { OpenAIProvider } from './OpenAIProvider'

export type AIProviderType = 'gemini' | 'openai' | 'azure' | 'grok' | 'aws'

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
      case 'openai':
        return new OpenAIProvider(config)
      case 'azure':
        if (!('endpoint' in config)) {
          throw new Error('Azure OpenAI provider requires an endpoint')
        }
        return new AzureOpenAIProvider(config as AzureOpenAIConfig)
      case 'grok':
        return new GrokAIProvider(config as GrokAIConfig)
      case 'aws':
        return new AWSBedrockProvider(config as AWSBedrockConfig)
      // Add more providers as needed
      default:
        throw new Error(`AI provider type ${type} not supported`)
    }
  }
}
