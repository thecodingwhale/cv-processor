#!/usr/bin/env node
/**
 * CV Processor CLI - Extract structured data from CV/resume PDFs
 *
 * Usage:
 *   npx cv-processor-ts input.pdf
 *
 * Output:
 *   Creates a JSON file with the same name (input.json) containing the extracted CV data
 */

import { Command } from 'commander'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { AICVProcessor } from './AICVProcessor'
import { AIProviderFactory, AIProviderType } from './ai/AIProviderFactory'
import { AzureOpenAIConfig } from './ai/AzureOpenAIProvider'
import { AIModelConfig } from './types/AIProvider'

// Load environment variables
dotenv.config()

// Configure CLI
const program = new Command()

program
  .name('cv-processor-ts')
  .description('Extract structured data from CV/resume PDF')
  .version('1.0.0')
  .argument('<pdf-file>', 'Path to the CV/resume PDF file')
  .option(
    '-o, --output <file>',
    'Output JSON file (defaults to input filename with .json extension)'
  )
  .option('-v, --verbose', 'Verbose output')
  .option(
    '--use-ai [provider]',
    'Use AI for processing (gemini, openai, azure, grok, aws)',
    'gemini'
  )
  .option('--ai-model <model>', 'AI model to use (default depends on provider)')
  .option(
    '--accuracy-calculator [type]',
    'Type of accuracy calculator to use (traditional, null-based)',
    'traditional'
  )
  .action(async (pdfFile, options) => {
    try {
      // Validate input file
      if (!fs.existsSync(pdfFile)) {
        console.error(`Error: Input file not found: ${pdfFile}`)
        process.exit(1)
      }

      // Determine output file
      const outputFile =
        options.output ||
        `${path.basename(pdfFile, path.extname(pdfFile))}.json`

      // Process CV
      const startTime = new Date()
      console.log(`Starting CV processing at ${startTime.toISOString()}`)

      // Use AI processing
      const providerType = options.useAi as AIProviderType
      console.log(`Using AI processing with provider: ${providerType}`)

      // Validate accuracy calculator type
      const accuracyCalculatorType =
        options.accuracyCalculator === 'null-based'
          ? 'null-based'
          : 'traditional'
      console.log(`Using ${accuracyCalculatorType} accuracy calculator`)

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
        model: options.aiModel || getDefaultModelForProvider(providerType),
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
          apiVersion:
            process.env.AZURE_OPENAI_API_VERSION || '2024-04-01-preview',
          deploymentName,
        } as AzureOpenAIConfig

        // For deployments like o3-mini that don't support temperature
        if (
          deploymentName &&
          (deploymentName.includes('mini') || deploymentName.includes('o3'))
        ) {
          console.log(
            `Using model-specific configuration for ${deploymentName}`
          )
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
        } else if (options.aiModel && options.aiModel.includes('nova')) {
          console.warn(
            'Warning: Nova models may require an inference profile ARN'
          )
          console.warn(
            'Set AWS_BEDROCK_INFERENCE_PROFILE_ARN environment variable'
          )
        }

        // Set sensible defaults for AWS Bedrock config
        aiConfig = {
          apiKey, // Pass through the API key we already retrieved
          model: options.aiModel || getDefaultModelForProvider(providerType),
          region: region || 'us-east-1',
        } as unknown as AIModelConfig

        console.log(`Using AWS Bedrock with model: ${aiConfig.model}`)
      }

      // Create AI provider and processor
      const aiProvider = AIProviderFactory.createProvider(
        providerType,
        aiConfig
      )
      const processor = new AICVProcessor(aiProvider, {
        verbose: options.verbose,
        accuracyCalculatorType: accuracyCalculatorType,
      })

      const cvData = await processor.processCv(pdfFile)
      processor.saveToJson(cvData, outputFile)

      const processingTime = (new Date().getTime() - startTime.getTime()) / 1000
      console.log(
        `CV processing completed in ${processingTime.toFixed(2)} seconds`
      )
    } catch (error) {
      console.error(`Error processing CV: ${error}`)
      process.exit(1)
    }
  })

// Parse arguments
program.parse()

// If no arguments, show help
if (process.argv.length < 3) {
  program.help()
}

/**
 * Get the default model name for a given AI provider
 */
function getDefaultModelForProvider(provider: AIProviderType): string {
  switch (provider) {
    case 'gemini':
      return 'gemini-1.5-pro'
    case 'openai':
      return 'gpt-4o'
    case 'azure':
      return 'gpt-4o' // Or the deployment name will be used
    case 'grok':
      return 'grok-3-mini-beta'
    case 'aws':
      return 'apac.amazon.nova-micro-v1:0' // May need inference profile ARN
    default:
      return 'gemini-1.5-pro'
  }
}

/**
 * Process a CV using AI methods (if API keys available)
 */
async function processCv(
  pdfPath: string,
  options = {
    verbose: false,
    outputPath: './output.json',
    minAccuracyThreshold: 75, // Default threshold for acceptable accuracy
    accuracyWeights: {
      // Custom weights for different sections
      personalInfo: 0.3,
      education: 0.25,
      experience: 0.3,
      skills: 0.15,
    },
    accuracyCalculatorType: 'traditional' as 'traditional' | 'null-based',
  }
) {
  console.log('Starting CV Processing')
  console.log(`Using ${options.accuracyCalculatorType} accuracy calculator`)

  try {
    // Use the default provider (based on CLI args or environment vars)
    const defaultProvider = process.env.DEFAULT_AI_PROVIDER || 'gemini'
    let apiProviderType: AIProviderType = defaultProvider as AIProviderType

    // Get API key from environment variables
    const apiKeyEnvVar =
      apiProviderType === 'aws'
        ? 'AWS_ACCESS_KEY_ID'
        : `${apiProviderType.toUpperCase()}_API_KEY`
    const apiKey = process.env[apiKeyEnvVar]

    if (!apiKey) {
      console.error(
        `Error: API key not found in environment variables (${apiKeyEnvVar})`
      )
      console.error('Please set it in your .env file or environment')
      throw new Error(`Missing API key for provider: ${apiProviderType}`)
    }

    // Configure AI provider
    let aiConfig: AIModelConfig = {
      apiKey,
      model: getDefaultModelForProvider(apiProviderType),
    }

    const aiProvider = AIProviderFactory.createProvider(
      apiProviderType,
      aiConfig
    )

    const processor = new AICVProcessor(aiProvider, {
      verbose: options.verbose,
      minAccuracyThreshold: options.minAccuracyThreshold,
      accuracyWeights: options.accuracyWeights,
      accuracyCalculatorType: options.accuracyCalculatorType,
    })

    const results = await processor.processCv(pdfPath)

    // Log accuracy information
    console.log(`\n--- Processing Results (${apiProviderType}) ---`)
    if (results.accuracy) {
      console.log(`Accuracy Score: ${results.accuracy.score}%`)
      console.log(`Completeness: ${results.accuracy.completeness}%`)
      console.log(`Confidence: ${results.accuracy.confidence}%`)

      if (results.accuracy.missingFields.length > 0) {
        console.log(
          'Missing Fields:',
          results.accuracy.missingFields.slice(0, 5),
          results.accuracy.missingFields.length > 5
            ? `(and ${results.accuracy.missingFields.length - 5} more...)`
            : ''
        )
      }

      if (!processor.meetsAccuracyThreshold(results)) {
        console.warn(
          `CV does not meet minimum accuracy threshold of ${options.minAccuracyThreshold}%`
        )
      }
    }

    // Save results
    processor.saveToJson(results, options.outputPath)
    console.log('\nProcessing completed successfully.')

    return results
  } catch (error) {
    console.error('Error in CV processing:', error)
    throw error
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Check for required directories
    const outputDir = path.resolve(__dirname, '../output')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir)
    }

    // Get PDF path from command line arguments or use default
    const pdfPath = process.argv[2] || path.resolve(__dirname, '../test.pdf')
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`)
    }

    const outputPath = path.resolve(outputDir, 'cv_data.json')

    // Process the CV with different AI options
    await processCv(pdfPath, {
      verbose: true,
      outputPath,
      minAccuracyThreshold: 70, // Set minimum accuracy to 70%
      accuracyWeights: {
        personalInfo: 0.3, // Higher weight for personal info
        education: 0.2,
        experience: 0.35, // Higher weight for experience
        skills: 0.15,
      },
      accuracyCalculatorType: 'null-based', // Use the null-based calculator
    })
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

// Run the main function
if (require.main === module) {
  main()
}

// Export for use in other modules
export { processCv }
