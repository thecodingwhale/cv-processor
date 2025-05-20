import { AIProviderType } from '../ai/AIProviderFactory'
import { AzureOpenAIConfig } from '../ai/AzureOpenAIProvider'
import { AIModelConfig } from '../types/AIProvider'

/**
 * Get AI configuration based on provider type and model
 * @param providerType The type of AI provider to use
 * @param aiModel Optional specific model to use
 * @returns AI configuration object
 */
export function getAIConfig(
  providerType: AIProviderType,
  aiModel?: string
): AIModelConfig | AzureOpenAIConfig {
  // Get API key from environment variables
  const apiKeyEnvVar =
    providerType === 'aws'
      ? 'AWS_ACCESS_KEY_ID'
      : `${providerType.toUpperCase()}_API_KEY`
  const apiKey = process.env[apiKeyEnvVar]

  if (!apiKey) {
    console.error(
      `Error: API key not found in environment variables (${apiKeyEnvVar})`
    )
    console.error('Please set it in your .env file or environment')
    process.exit(1)
  }

  // Configure AI model
  let aiConfig: AIModelConfig | AzureOpenAIConfig = {
    apiKey,
    model: aiModel || getDefaultModelForProvider(providerType),
  }

  // Add Azure OpenAI specific configuration
  if (providerType === 'azure') {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT
    if (!endpoint) {
      console.error(
        'Error: AZURE_OPENAI_ENDPOINT not found in environment variables'
      )
      console.error('Please set it in your .env file or environment')
      process.exit(1)
    }

    const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME

    // Set sensible defaults for Azure OpenAI config
    aiConfig = {
      ...aiConfig,
      endpoint,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-04-01-preview',
      deploymentName,
    } as AzureOpenAIConfig

    // For deployments like o3-mini that don't support temperature
    if (
      deploymentName &&
      (deploymentName.includes('mini') || deploymentName.includes('o3'))
    ) {
      console.log(`Using model-specific configuration for ${deploymentName}`)
      delete (aiConfig as any).temperature
    }
  }
  // Add AWS Bedrock specific configuration
  else if (providerType === 'aws') {
    // AWS credentials can come from environment variables AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
    // or from the ~/.aws/credentials file

    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION

    // Check for inference profile ARN
    if (process.env.AWS_BEDROCK_INFERENCE_PROFILE_ARN) {
      console.log(
        `Using AWS Bedrock inference profile: ${process.env.AWS_BEDROCK_INFERENCE_PROFILE_ARN}`
      )
    } else if (aiModel && aiModel.includes('nova')) {
      console.warn('Warning: Nova models may require an inference profile ARN')
      console.warn('Set AWS_BEDROCK_INFERENCE_PROFILE_ARN environment variable')
    }

    // Set sensible defaults for AWS Bedrock config
    aiConfig = {
      apiKey, // Pass through the API key we already retrieved
      model: aiModel || getDefaultModelForProvider(providerType),
      region: region || 'us-east-1',
    } as unknown as AIModelConfig

    console.log(`Using AWS Bedrock with model: ${aiConfig.model}`)
  }

  return aiConfig
}

/**
 * Get the default model name for a given AI provider
 */
export function getDefaultModelForProvider(provider: AIProviderType): string {
  switch (provider) {
    case 'gemini':
      return 'gemini-1.5-pro'
    case 'openai':
      return 'gpt-4o'
    case 'azure':
      return 'gpt-4o' // Or the deployment name will be used
    case 'grok':
      return 'grok-2-vision-1212'
    case 'aws':
      return 'apac.amazon.nova-lite-v1:0' // May need inference profile ARN
    default:
      return 'gemini-1.5-pro'
  }
}
