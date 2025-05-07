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
import { CVProcessor } from './CVProcessor'
import { AIProviderFactory, AIProviderType } from './ai/AIProviderFactory'
import { AzureOpenAIConfig } from './ai/AzureOpenAIProvider'
import { AIModelConfig, AIProvider } from './types/AIProvider'

// Load environment variables
dotenv.config()

// Configure CLI
const program = new Command()

program
  .name('cv-processor-ts')
  .description('Extract structured data from a CV/resume PDF')
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
  .option('--traditional', 'Use traditional non-AI processing')
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

      if (options.traditional) {
        // Use traditional processing
        console.log('Using traditional non-AI processing')
        const processor = new CVProcessor({ verbose: options.verbose })
        const cvData = await processor.processCv(pdfFile)
        processor.saveToJson(cvData, outputFile)
      } else {
        // Use AI processing
        const providerType = options.useAi as AIProviderType
        console.log(`Using AI processing with provider: ${providerType}`)

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

          const region =
            process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION

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
        })

        const cvData = await processor.processCv(pdfFile)
        processor.saveToJson(cvData, outputFile)
      }

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

// Define a mock interface for dynamic imports
interface OpenAIProviderModule {
  OpenAIProvider: new () => AIProvider
}

interface GeminiProviderModule {
  GeminiProvider: new () => AIProvider
}

/**
 * Process a CV using traditional methods and AI methods (if API keys available)
 */
async function processCv(
  pdfPath: string,
  options = {
    useOpenAI: false,
    useGemini: false,
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
  }
) {
  console.log('Starting CV Processing')

  try {
    // Traditional processor (rule-based)
    const traditionalProcessor = new CVProcessor({
      verbose: options.verbose,
      minAccuracyThreshold: options.minAccuracyThreshold,
      accuracyWeights: options.accuracyWeights,
    })

    const traditionalResults = await traditionalProcessor.processCv(pdfPath)

    // Log accuracy information
    console.log('\n--- Traditional Processing Results ---')
    if (traditionalResults.accuracy) {
      console.log(`Accuracy Score: ${traditionalResults.accuracy.score}%`)
      console.log(`Completeness: ${traditionalResults.accuracy.completeness}%`)
      console.log(`Confidence: ${traditionalResults.accuracy.confidence}%`)

      if (traditionalResults.accuracy.missingFields.length > 0) {
        console.log(
          'Missing Fields:',
          traditionalResults.accuracy.missingFields.slice(0, 5),
          traditionalResults.accuracy.missingFields.length > 5
            ? `(and ${
                traditionalResults.accuracy.missingFields.length - 5
              } more...)`
            : ''
        )
      }

      if (!traditionalProcessor.meetsAccuracyThreshold(traditionalResults)) {
        console.warn(
          `This CV doesn't meet the minimum accuracy threshold (${options.minAccuracyThreshold}%)`
        )
      }
    }

    // Save traditional results
    traditionalProcessor.saveToJson(traditionalResults, options.outputPath)

    const aiResults: Array<{ provider: string; results: any }> = []

    // OpenAI processor
    if (options.useOpenAI && process.env.OPENAI_API_KEY) {
      console.log('\nProcessing with OpenAI...')

      // Import dynamically to avoid errors if the provider isn't available
      try {
        // Create a dynamic import with proper config
        const openAIModule = await import('./ai/OpenAIProvider')
        const openaiProvider = new openAIModule.OpenAIProvider({
          apiKey: process.env.OPENAI_API_KEY || '',
          model: 'gpt-4o',
          temperature: 0.2,
          maxTokens: 4096,
        })

        const openAIProcessor = new AICVProcessor(openaiProvider, {
          verbose: options.verbose,
          minAccuracyThreshold: options.minAccuracyThreshold,
          accuracyWeights: options.accuracyWeights,
        })

        const openaiResults = await openAIProcessor.processCv(pdfPath)
        aiResults.push({ provider: 'OpenAI', results: openaiResults })

        // Log accuracy information
        console.log('\n--- OpenAI Processing Results ---')
        if (openaiResults.accuracy) {
          console.log(`Accuracy Score: ${openaiResults.accuracy.score}%`)
          console.log(`Completeness: ${openaiResults.accuracy.completeness}%`)
          console.log(`Confidence: ${openaiResults.accuracy.confidence}%`)

          if (openaiResults.accuracy.missingFields.length > 0) {
            console.log(
              'Missing Fields:',
              openaiResults.accuracy.missingFields.slice(0, 5),
              openaiResults.accuracy.missingFields.length > 5
                ? `(and ${
                    openaiResults.accuracy.missingFields.length - 5
                  } more...)`
                : ''
            )
          }

          if (!openAIProcessor.meetsAccuracyThreshold(openaiResults)) {
            console.warn(
              `This CV doesn't meet the minimum accuracy threshold (${options.minAccuracyThreshold}%)`
            )
          }
        }

        // Save OpenAI results
        openAIProcessor.saveToJson(openaiResults, options.outputPath)
      } catch (error) {
        console.error('Error initializing OpenAI provider:', error)
      }
    } else if (options.useOpenAI) {
      console.log('OpenAI API key not found. Skipping OpenAI processing.')
    }

    // Gemini processor
    if (options.useGemini && process.env.GEMINI_API_KEY) {
      console.log('\nProcessing with Gemini...')

      // Import dynamically to avoid errors if the provider isn't available
      try {
        // Check if the GeminiProvider module exists
        let geminiProvider: AIProvider

        try {
          // Try to dynamically import the GeminiProvider module
          // This will throw an error if the module doesn't exist
          // @ts-ignore - Ignoring the import error as we're handling it in the catch block
          const geminiModule = await import('./ai/GeminiProvider')
          geminiProvider = new geminiModule.GeminiProvider({
            apiKey: process.env.GEMINI_API_KEY || '',
            model: 'gemini-1.5-pro',
            temperature: 0.2,
            maxTokens: 4096,
          })
        } catch (importError) {
          console.warn(
            'GeminiProvider module not found. Using a demo implementation.'
          )
          // Create a demo provider with a generic implementation
          geminiProvider = {
            processText: async () => ({ text: 'Demo Gemini response' }),
            processPDF: async () => ({ text: 'Demo Gemini PDF response' }),
            // Use 'any' for the type parameter to avoid generic type issues
            extractStructuredData: async <T>(): Promise<T> => {
              const demoData = {
                personalInfo: {
                  name: 'Demo Name',
                  email: 'demo@example.com',
                  phone: '555-1234',
                  location: 'Demo City',
                },
                education: [
                  {
                    institution: 'Demo University',
                    degree: 'BS',
                    fieldOfStudy: 'Computer Science',
                    startDate: '2018',
                    endDate: '2022',
                    gpa: '3.8',
                    location: 'Demo City',
                  },
                ],
                experience: [
                  {
                    company: 'Demo Corp',
                    position: 'Software Engineer',
                    startDate: '2022',
                    endDate: 'Present',
                    location: 'Demo City',
                    description: ['Developed applications'],
                  },
                ],
                skills: {
                  programmingLanguages: ['JavaScript', 'TypeScript'],
                  frameworks: ['React'],
                  tools: ['Git'],
                },
                metadata: {
                  processedDate: new Date().toISOString(),
                  sourceFile: path.basename(pdfPath),
                },
              }
              // Cast the demo data to the generic type
              return demoData as unknown as T
            },
            getModelInfo: () => ({
              provider: 'gemini-demo',
              model: 'gemini-1.5-pro-demo',
            }),
          }
        }

        const geminiProcessor = new AICVProcessor(geminiProvider, {
          verbose: options.verbose,
          minAccuracyThreshold: options.minAccuracyThreshold,
          accuracyWeights: options.accuracyWeights,
        })

        const geminiResults = await geminiProcessor.processCv(pdfPath)
        aiResults.push({ provider: 'Gemini', results: geminiResults })

        // Log accuracy information
        console.log('\n--- Gemini Processing Results ---')
        if (geminiResults.accuracy) {
          console.log(`Accuracy Score: ${geminiResults.accuracy.score}%`)
          console.log(`Completeness: ${geminiResults.accuracy.completeness}%`)
          console.log(`Confidence: ${geminiResults.accuracy.confidence}%`)

          if (geminiResults.accuracy.missingFields.length > 0) {
            console.log(
              'Missing Fields:',
              geminiResults.accuracy.missingFields.slice(0, 5),
              geminiResults.accuracy.missingFields.length > 5
                ? `(and ${
                    geminiResults.accuracy.missingFields.length - 5
                  } more...)`
                : ''
            )
          }

          if (!geminiProcessor.meetsAccuracyThreshold(geminiResults)) {
            console.warn(
              `This CV doesn't meet the minimum accuracy threshold (${options.minAccuracyThreshold}%)`
            )
          }
        }

        // Save Gemini results
        geminiProcessor.saveToJson(geminiResults, options.outputPath)
      } catch (error) {
        console.error('Error using Gemini provider:', error)
      }
    } else if (options.useGemini) {
      console.log('Gemini API key not found. Skipping Gemini processing.')
    }

    // Compare results accuracy
    if (aiResults.length > 0) {
      console.log('\n--- Accuracy Comparison ---')
      console.log(
        `Traditional: ${traditionalResults.accuracy?.score || 'N/A'}%`
      )

      aiResults.forEach((result) => {
        console.log(
          `${result.provider}: ${result.results.accuracy?.score || 'N/A'}%`
        )
      })

      // Find the most accurate result
      let bestProvider = 'Traditional'
      let bestScore = traditionalResults.accuracy?.score || 0

      aiResults.forEach((result) => {
        const score = result.results.accuracy?.score || 0
        if (score > bestScore) {
          bestScore = score
          bestProvider = result.provider
        }
      })

      console.log(
        `\nBest extraction results from: ${bestProvider} (${bestScore}%)`
      )
    }

    console.log('\nAll processing completed successfully.')
    return traditionalResults
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

    // Process the CV with different options
    await processCv(pdfPath, {
      useOpenAI: true,
      useGemini: true,
      verbose: true,
      outputPath,
      minAccuracyThreshold: 70, // Set minimum accuracy to 70%
      accuracyWeights: {
        personalInfo: 0.3, // Higher weight for personal info
        education: 0.2,
        experience: 0.35, // Higher weight for experience
        skills: 0.15,
      },
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
