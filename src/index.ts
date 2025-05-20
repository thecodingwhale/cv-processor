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
import { CVData } from './types'
import { AIProvider, ConversionType } from './types/AIProvider'
import { getAIConfig } from './utils/aiConfig'
import { mergeReports } from './utils/reportMerger'

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
  .description('Process a single CV/resume PDF file')
  .argument('<pdf-file>', 'Path to the CV/resume PDF file')
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
    'Type of PDF conversion to use (pdftoimages, pdftotexts)',
    'pdftoimages'
  )
  .option(
    '--instructions-path <path>',
    'Path to the instructions file (defaults to instructions.txt in project root)'
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
      })

      // Process the CV with the specified conversion type
      const conversionType =
        options.conversionType === 'pdftotexts'
          ? ConversionType.PdfToTexts
          : ConversionType.PdfToImages

      console.log(`Using conversion type: ${conversionType}`)
      const cvData = await processor.processCv(pdfFile, conversionType)

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

program
  .command('merge-reports')
  .description('Merge and analyze reports from multiple CV processing runs')
  .option(
    '-d, --dir <directory>',
    'Directory containing CV processing output',
    'output'
  )
  .option(
    '-o, --output <file>',
    'Output file for the merged report',
    'merged-report.md'
  )
  .action(async (options) => {
    try {
      console.log(`Merging reports from ${options.dir}...`)

      // Check if the output directory exists
      if (!fs.existsSync(options.dir)) {
        console.error(`Error: Output directory not found: ${options.dir}`)
        process.exit(1)
      }

      // Run the report merger
      const result = await mergeReports(options.dir)

      // Save the report
      fs.writeFileSync(options.output, result)

      console.log(`Merged report saved to ${options.output}`)
    } catch (error) {
      console.error(`Error merging reports: ${error}`)
      process.exit(1)
    }
  })

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
