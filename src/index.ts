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
import { AIModelConfig } from './types/AIProvider'

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
    'Use AI for processing (gemini, openai, or anthropic)',
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
        const apiKeyEnvVar = `${providerType.toUpperCase()}_API_KEY`
        const apiKey = process.env[apiKeyEnvVar]

        if (!apiKey) {
          console.error(
            `Error: API key not found in environment variables (${apiKeyEnvVar})`
          )
          console.error('Please set it in your .env file or environment')
          process.exit(1)
        }

        // Configure AI model
        const aiConfig: AIModelConfig = {
          apiKey,
          model: options.aiModel || getDefaultModelForProvider(providerType),
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
    case 'anthropic':
      return 'claude-3-opus-20240229'
    default:
      return 'gemini-1.5-pro'
  }
}
