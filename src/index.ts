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
import registerCreateCsvCommand from './cli/createCsv'
import registerMergeReportsCommand from './cli/mergeReports'
import { CVData } from './types'
import { AIProvider, ConversionType } from './types/AIProvider'
import { getAIConfig } from './utils/aiConfig'

// Load environment variables
dotenv.config()

// Configure CLI
const program = new Command()

program
  .name('cv-processor-ts')
  .description('Extract structured data from CV/resume PDF')
  .version('1.0.0')

program
  .command('process')
  .description('Process a CV/resume PDF file or URL')
  .argument('<input>', 'Path to the CV/resume PDF file or URL to process')
  .option(
    '-o, --output <file>',
    'Output JSON file (defaults to input filename with .json extension)'
  )
  .option('-v, --verbose', 'Verbose output')
  .option(
    '--use-ai [provider]',
    'Use AI for processing (gemini, openai, azure, grok, aws)'
  )
  .option('--ai-model <model>', 'AI model to use (default depends on provider)')
  .option(
    '--accuracy-calculator [type]',
    'Type of accuracy calculator to use (traditional, null-based)',
    'traditional'
  )
  .option(
    '--conversion-type <type>',
    'Type of conversion to use (pdftoimages, pdftotexts, urltotexts)',
    'pdftoimages'
  )
  .option(
    '--instructions-path <path>',
    'Path to the instructions file (defaults to instructions.txt in project root)'
  )
  .option(
    '--expected-total-fields <number>',
    'Expected total number of fields for emptiness percentage calculation',
    parseInt
  )
  .action(async (input, options) => {
    try {
      // Validate input - check if it's a URL or file path
      const isUrl = input.startsWith('http://') || input.startsWith('https://')

      if (!isUrl && !fs.existsSync(input)) {
        console.error(`Error: Input file not found: ${input}`)
        process.exit(1)
      }

      // Determine output file
      const outputFile =
        options.output ||
        (isUrl
          ? `url-${Date.now()}.json`
          : `${path.basename(input, path.extname(input))}.json`)

      // Process CV
      const startTime = new Date()
      console.log(`Starting CV processing at ${startTime.toISOString()}`)

      // Use AI processing
      const providerType = options.useAi as AIProviderType
      console.log(`Using AI processing with provider: ${providerType}`)

      // Get AI configuration
      const aiConfig = getAIConfig(providerType, options.aiModel)

      // Create AI provider and processor
      const aiProvider = AIProviderFactory.createProvider(
        providerType,
        aiConfig
      )
      const processor = new AICVProcessor(aiProvider, {
        verbose: options.verbose,
        instructionsPath:
          options.instructionsPath ||
          path.join(process.cwd(), 'instructions.txt'),
        expectedTotalFields: options.expectedTotalFields,
      })

      // Process the CV with the specified conversion type
      const conversionType =
        options.conversionType === 'pdftotexts'
          ? ConversionType.PdfToTexts
          : options.conversionType === 'urltotexts'
          ? ConversionType.UrlToTexts
          : ConversionType.PdfToImages

      console.log(`Using conversion type: ${conversionType}`)
      const cvData = await processor.processCv(input, conversionType)

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

// Register the merge-reports command using the function from cli/mergeReports.ts
registerMergeReportsCommand(program)

// Register the create-csv command using the function from cli/createCsv.ts
registerCreateCsvCommand(program)

// For backward compatibility, make 'process' the default command
program.parse(process.argv)

// If no arguments or if only the program name is provided, show help
if (process.argv.length <= 2) {
  program.help()
}

/**
 * Process a CV PDF and extract structured information using AI
 * @param pdfPath Path to the PDF file
 * @param aiProvider AI provider to use for processing
 * @param options Processing options
 * @param conversionType Type of conversion to use (default: PdfToTexts)
 * @returns Promise resolving to structured CV data
 */
export async function processCv(
  pdfPath: string,
  aiProvider: AIProvider,
  options: { verbose?: boolean; instructionsPath?: string } = {},
  conversionType: ConversionType = ConversionType.PdfToTexts
): Promise<CVData> {
  const processor = new AICVProcessor(aiProvider, options)
  return processor.processCv(pdfPath, conversionType)
}

export { AICVProcessor, ConversionType }
export type { AIProvider, CVData }
