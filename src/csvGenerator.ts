import * as fs from 'fs'
import * as path from 'path'

/**
 * Interface representing a row in the CSV output
 */
interface CSVRow {
  subdirectory: string
  totalTokens: number
  estimatedCost: number
  processingTime: number
  conversionType: string
  provider: string
  model: string
  emptinessPercentage: number
  totalFields: number
  nonEmptyFields: number
  expectedTotalFields: number
  expectedPercentage: number
}

/**
 * Interface representing the structure of the JSON files
 */
interface ProcessedCVData {
  tokenUsage?: {
    totalTokens?: number
    estimatedCost?: number
  }
  metadata?: {
    processingTime?: number
    conversionType?: string
    provider?: string
    model?: string
    emptinessPercentage?: {
      percentage?: number
      totalFields?: number
      nonEmptyFields?: number
      expectedTotalFields?: number
      expectedPercentage?: number
    }
  }
}

/**
 * CSV Generator class for processing output directories and creating CSV summaries
 */
export class CSVGenerator {
  /**
   * Generate CSV summary from a base folder containing subdirectories with JSON files
   * @param baseFolderPath Path to the base folder
   */
  async generateCSV(baseFolderPath: string): Promise<void> {
    try {
      console.log(`🔍 Scanning base folder: ${baseFolderPath}`)

      // Validate base folder exists
      if (!fs.existsSync(baseFolderPath)) {
        throw new Error(`Base folder not found: ${baseFolderPath}`)
      }

      // Discover all JSON files in subdirectories
      const jsonFiles = await this.discoverJSONFiles(baseFolderPath)
      console.log(`📁 Found ${jsonFiles.length} JSON files to process`)

      if (jsonFiles.length === 0) {
        console.log('⚠️  No JSON files found in subdirectories')
        return
      }

      // Extract data from each JSON file
      const csvData: CSVRow[] = []
      let processedCount = 0
      let errorCount = 0

      for (const filePath of jsonFiles) {
        try {
          const row = await this.extractDataFromJSON(filePath, baseFolderPath)
          csvData.push(row)
          processedCount++

          if (processedCount % 10 === 0) {
            console.log(
              `📊 Processed ${processedCount}/${jsonFiles.length} files...`
            )
          }
        } catch (error) {
          console.warn(`⚠️  Error processing ${filePath}: ${error}`)
          errorCount++
        }
      }

      console.log(`✅ Successfully processed ${processedCount} files`)
      if (errorCount > 0) {
        console.log(`❌ Failed to process ${errorCount} files`)
      }

      // Write CSV file
      const outputPath = path.join(baseFolderPath, 'summary.csv')
      await this.writeCSV(csvData, outputPath)

      console.log(`📄 CSV summary generated: ${outputPath}`)
      console.log(`📈 Total rows: ${csvData.length}`)
    } catch (error) {
      console.error('❌ Error generating CSV:', error)
      throw error
    }
  }

  /**
   * Recursively discover all JSON files in subdirectories
   * @param basePath Base path to scan
   * @returns Array of JSON file paths
   */
  private async discoverJSONFiles(basePath: string): Promise<string[]> {
    const jsonFiles: string[] = []

    try {
      const entries = fs.readdirSync(basePath, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subdirPath = path.join(basePath, entry.name)

          // Look for JSON files directly in this subdirectory
          const files = fs.readdirSync(subdirPath, { withFileTypes: true })

          for (const file of files) {
            if (file.isFile() && file.name.endsWith('.json')) {
              jsonFiles.push(path.join(subdirPath, file.name))
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${basePath}:`, error)
    }

    return jsonFiles
  }

  /**
   * Extract data from a JSON file and convert to CSV row format
   * @param filePath Path to the JSON file
   * @param baseFolderPath Base folder path for relative subdirectory calculation
   * @returns CSV row data
   */
  private async extractDataFromJSON(
    filePath: string,
    baseFolderPath: string
  ): Promise<CSVRow> {
    try {
      // Read and parse JSON file
      const jsonContent = fs.readFileSync(filePath, 'utf-8')
      const data: ProcessedCVData = JSON.parse(jsonContent)

      // Calculate relative subdirectory path
      const relativePath = path.relative(baseFolderPath, filePath)
      const subdirectory = path.dirname(relativePath)

      // Extract data with fallbacks for missing values
      const tokenUsage = data.tokenUsage || {}
      const metadata = data.metadata || {}
      const emptinessPercentage = metadata.emptinessPercentage || {}

      return {
        subdirectory,
        totalTokens: tokenUsage.totalTokens || 0,
        estimatedCost: tokenUsage.estimatedCost || 0,
        processingTime: metadata.processingTime || 0,
        conversionType: metadata.conversionType || '',
        provider: metadata.provider || '',
        model: metadata.model || '',
        emptinessPercentage: emptinessPercentage.percentage || 0,
        totalFields: emptinessPercentage.totalFields || 0,
        nonEmptyFields: emptinessPercentage.nonEmptyFields || 0,
        expectedTotalFields: emptinessPercentage.expectedTotalFields || 0,
        expectedPercentage: emptinessPercentage.expectedPercentage || 0,
      }
    } catch (error) {
      throw new Error(`Failed to parse JSON file ${filePath}: ${error}`)
    }
  }

  /**
   * Write CSV data to file
   * @param data Array of CSV row data
   * @param outputPath Output file path
   */
  private async writeCSV(data: CSVRow[], outputPath: string): Promise<void> {
    try {
      // Define CSV headers
      const headers = [
        'subdirectory',
        'totalTokens',
        'estimatedCost',
        'processingTime',
        'conversionType',
        'provider',
        'model',
        'emptinessPercentage',
        'totalFields',
        'nonEmptyFields',
        'expectedTotalFields',
        'expectedPercentage',
      ]

      // Create CSV content
      const csvLines: string[] = []

      // Add header row
      csvLines.push(headers.join(','))

      // Add data rows
      for (const row of data) {
        const values = [
          this.escapeCsvValue(row.subdirectory),
          row.totalTokens.toString(),
          row.estimatedCost.toFixed(6),
          row.processingTime.toFixed(3),
          this.escapeCsvValue(row.conversionType),
          this.escapeCsvValue(row.provider),
          this.escapeCsvValue(row.model),
          row.emptinessPercentage.toFixed(2),
          row.totalFields.toString(),
          row.nonEmptyFields.toString(),
          row.expectedTotalFields.toString(),
          row.expectedPercentage.toFixed(2),
        ]

        csvLines.push(values.join(','))
      }

      // Write to file
      const csvContent = csvLines.join('\n')
      fs.writeFileSync(outputPath, csvContent, 'utf-8')
    } catch (error) {
      throw new Error(`Failed to write CSV file ${outputPath}: ${error}`)
    }
  }

  /**
   * Escape CSV values that contain commas, quotes, or newlines
   * @param value Value to escape
   * @returns Escaped value
   */
  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }
}
