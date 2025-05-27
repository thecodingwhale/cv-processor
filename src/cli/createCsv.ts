import { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
import { CSVGenerator } from '../csvGenerator'

/**
 * Register the create-csv command with the CLI program
 * @param program Commander program instance
 */
export default function registerCreateCsvCommand(program: Command): void {
  program
    .command('create-csv')
    .description('Generate CSV summary from processed CV output directories')
    .argument(
      '<base-folder>',
      'Path to the base folder containing CV processing results'
    )
    .option('-v, --verbose', 'Verbose output')
    .option(
      '-o, --output <filename>',
      'Custom output filename (default: summary.csv)'
    )
    .action(async (baseFolder, options) => {
      try {
        const startTime = new Date()
        console.log(`🚀 Starting CSV generation at ${startTime.toISOString()}`)

        // Validate base folder path
        const baseFolderPath = path.resolve(baseFolder)

        if (!fs.existsSync(baseFolderPath)) {
          console.error(`❌ Error: Base folder not found: ${baseFolderPath}`)
          process.exit(1)
        }

        if (!fs.statSync(baseFolderPath).isDirectory()) {
          console.error(`❌ Error: Path is not a directory: ${baseFolderPath}`)
          process.exit(1)
        }

        if (options.verbose) {
          console.log(`📂 Base folder: ${baseFolderPath}`)
          console.log(`📄 Output filename: ${options.output || 'summary.csv'}`)
        }

        // Create CSV generator and process the folder
        const csvGenerator = new CSVGenerator()

        // If custom output filename is specified, we need to modify the generator
        if (options.output) {
          // For now, we'll generate to the default location and then move it
          await csvGenerator.generateCSV(baseFolderPath)

          const defaultPath = path.join(baseFolderPath, 'summary.csv')
          const customPath = path.join(baseFolderPath, options.output)

          if (fs.existsSync(defaultPath) && defaultPath !== customPath) {
            fs.renameSync(defaultPath, customPath)
            console.log(`📄 CSV file renamed to: ${customPath}`)
          }
        } else {
          await csvGenerator.generateCSV(baseFolderPath)
        }

        const endTime = new Date()
        const processingTime = (endTime.getTime() - startTime.getTime()) / 1000

        console.log(
          `✅ CSV generation completed in ${processingTime.toFixed(2)} seconds`
        )
      } catch (error) {
        console.error(`❌ Error generating CSV: ${error}`)
        if (options.verbose && error instanceof Error) {
          console.error(`Stack trace: ${error.stack}`)
        }
        process.exit(1)
      }
    })
}
