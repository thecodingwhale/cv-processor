import * as fs from 'fs'
import { glob } from 'glob'
import * as path from 'path'
import { CVData } from '../types'

/**
 * ReportGenerator class is responsible for generating markdown reports
 * from CV processing results, including token usage metrics.
 */
export class ReportGenerator {
  /**
   * Generate a report for a specific output directory
   */
  public static async generateReport(
    outputDir: string,
    verbose: boolean = false
  ): Promise<string> {
    if (verbose) {
      console.log(`Generating report for ${outputDir}`)
    }

    try {
      // Find all JSON files in the directory
      const jsonFiles = await glob(`${outputDir}/*.json`)
      if (jsonFiles.length === 0) {
        return 'No JSON files found'
      }

      // Load all CV data files
      const allData: {
        cvData: CVData
        file: string
        provider: string
        model: string
        time: number
      }[] = []

      for (const file of jsonFiles) {
        try {
          const data: CVData = JSON.parse(fs.readFileSync(file, 'utf8'))

          // Skip files without proper metadata
          if (!data.metadata) continue

          allData.push({
            cvData: data,
            file: path.basename(file),
            provider: data.metadata.provider || 'unknown',
            model: data.metadata.model || 'default',
            time: data.metadata.processingTime || 0,
          })
        } catch (error) {
          console.error(`Error loading data file ${file}:`, error)
        }
      }

      if (allData.length === 0) {
        return 'No valid data files found'
      }

      // Get the CV name from the directory
      const cvName = path.basename(outputDir).split('_')[0]

      // Get the date
      const dateMatch = path.basename(outputDir).match(/(\d{4}-\d{2}-\d{2})/)
      const date = dateMatch
        ? dateMatch[1]
        : new Date().toISOString().split('T')[0]

      // Calculate total execution time
      const totalTime = allData.reduce((sum, data) => sum + data.time, 0)

      // Separate successful and failed executions
      const successfulExecutions = allData.filter(
        (data) => data.cvData.metadata && data.cvData.metadata.accuracy
      )

      // For now we don't have failed executions in our data structure
      // If needed, we can detect them based on missing accuracy or other criteria
      const failedExecutions: any[] = []

      // Calculate success rate
      const totalProviders =
        successfulExecutions.length + failedExecutions.length
      const successRate =
        totalProviders > 0
          ? (successfulExecutions.length / totalProviders) * 100
          : 0

      // Check if we have consensus
      const hasConsensus = successfulExecutions.some(
        (data) => data.cvData.metadata.accuracy?.consensusSource
      )

      // Get consensus strength if available
      let consensusStrength = 0
      const consensusData = successfulExecutions.find(
        (data) => data.cvData.metadata.accuracy?.consensusSource
      )
      if (consensusData && consensusData.cvData.metadata.accuracy) {
        const metadata = consensusData.cvData.metadata.accuracy.consensusSource
        // Check if metadata is an object with consensusStrength property
        if (
          metadata &&
          typeof metadata === 'object' &&
          'consensusStrength' in metadata
        ) {
          consensusStrength = (metadata as any).consensusStrength * 100
        }
      }

      // Start building the markdown report
      let report = `# CV Processing Report\n\n`
      report += `**CV**: ${cvName}.pdf\n`
      report += `**Date**: ${date}\n`
      report += `**Total Execution Time**: ${totalTime.toFixed(2)} seconds\n\n`

      // Summary section
      report += `## Summary\n\n`
      report += `- **Total Providers**: ${totalProviders}\n`
      report += `- **Successful**: ${successfulExecutions.length}\n`
      report += `- **Failed**: ${failedExecutions.length}\n`
      report += `- **Success Rate**: ${successRate.toFixed(1)}%\n`
      report += `- **Consensus Baseline**: ${hasConsensus ? 'Yes' : 'No'}\n\n`

      // Successful executions section
      report += `## Successful Executions\n\n`
      report += `| Provider | Model | Time (s) | Accuracy | Token Usage | Est. Cost | Output File |\n`
      report += `|----------|-------|----------|----------|-------------|-----------|-------------|\n`

      for (const execution of successfulExecutions) {
        const accuracy = execution.cvData.metadata.accuracy?.overall || 0

        // Token usage information
        const tokenUsage = execution.cvData.metadata.tokenUsage
        const tokenCount = tokenUsage ? tokenUsage.totalTokens : 'N/A'
        const estCost =
          tokenUsage && tokenUsage.estimatedCost
            ? `$${tokenUsage.estimatedCost.toFixed(4)}`
            : 'N/A'

        report += `| ${execution.provider} | ${
          execution.model
        } | ${execution.time.toFixed(
          2
        )} | ${accuracy}% | ${tokenCount} | ${estCost} | [View](./${
          execution.file
        }) |\n`
      }
      report += '\n'

      // Failed executions section (if any)
      if (failedExecutions.length > 0) {
        report += `## Failed Executions\n\n`
        report += `| Provider | Model | Error |\n`
        report += `|----------|-------|-------|\n`

        for (const execution of failedExecutions) {
          const errorMessage = execution.error.substring(0, 50) + '...'
          report += `| ${execution.provider} | ${execution.model} | ${errorMessage} |\n`
        }
        report += '\n'
      }

      // Performance comparison section
      report += `## Performance Comparison\n\n`
      const fastest = [...successfulExecutions].sort(
        (a, b) => a.time - b.time
      )[0]
      const slowest = [...successfulExecutions].sort(
        (a, b) => b.time - a.time
      )[0]
      const avgTime = totalTime / successfulExecutions.length

      report += `- **Fastest**: ${fastest.provider} (${
        fastest.model
      }) - ${fastest.time.toFixed(2)}s\n`
      report += `- **Slowest**: ${slowest.provider} (${
        slowest.model
      }) - ${slowest.time.toFixed(2)}s\n`
      report += `- **Average Time**: ${avgTime.toFixed(2)}s\n\n`

      // Token Usage Comparison
      report += `## Token Usage Comparison\n\n`
      report += `| Provider | Model | Input Tokens | Output Tokens | Total Tokens | Est. Cost |\n`
      report += `|----------|-------|--------------|---------------|--------------|----------|\n`

      for (const execution of successfulExecutions) {
        const tokenUsage = execution.cvData.metadata.tokenUsage
        const inputTokens = tokenUsage ? tokenUsage.inputTokens : 'N/A'
        const outputTokens = tokenUsage ? tokenUsage.outputTokens : 'N/A'
        const totalTokens = tokenUsage ? tokenUsage.totalTokens : 'N/A'
        const estCost =
          tokenUsage && tokenUsage.estimatedCost
            ? `$${tokenUsage.estimatedCost.toFixed(4)}`
            : 'N/A'

        report += `| ${execution.provider} | ${execution.model} | ${inputTokens} | ${outputTokens} | ${totalTokens} | ${estCost} |\n`
      }
      report += '\n'

      // Consensus information section (if available)
      if (hasConsensus) {
        report += `\n## Consensus Information\n\n`
        report += `This CV was evaluated against a consensus baseline created from ${successfulExecutions.length} AI providers.\n\n`
        report += `Consensus strength: ${consensusStrength.toFixed(1)}%\n\n`
      }

      // Accuracy comparison section
      report += `## Accuracy Comparison\n\n`
      report += `| Provider | Model | Overall | Field Accuracy | Completeness | Structure |\n`
      report += `|----------|-------|---------|----------------|--------------|----------|\n`

      for (const execution of successfulExecutions.sort(
        (a, b) =>
          (b.cvData.metadata.accuracy?.overall || 0) -
          (a.cvData.metadata.accuracy?.overall || 0)
      )) {
        const accuracy = execution.cvData.metadata.accuracy
        const overall = accuracy?.overall || 0
        const fieldAccuracy = accuracy?.fieldAccuracy || 0
        const completeness = accuracy?.completeness || 0
        const structure = accuracy?.structuralFidelity || 0

        report += `| ${execution.provider} | ${execution.model} | ${overall}% | ${fieldAccuracy}% | ${completeness}% | ${structure}% |\n`
      }

      // Find best overall
      const bestAccuracy = [...successfulExecutions].sort(
        (a, b) =>
          (b.cvData.metadata.accuracy?.overall || 0) -
          (a.cvData.metadata.accuracy?.overall || 0)
      )[0]

      report += `\n**Best Overall Accuracy**: ${bestAccuracy.provider} (${
        bestAccuracy.model
      }) - ${bestAccuracy.cvData.metadata.accuracy?.overall || 0}%\n\n`

      return report
    } catch (error) {
      console.error(`Error generating report: ${error}`)
      return `Error generating report: ${error}`
    }
  }

  /**
   * Save the report to a file
   */
  public static saveReport(report: string, outputDir: string): void {
    try {
      const reportPath = path.join(outputDir, 'report.md')
      fs.writeFileSync(reportPath, report)
      console.log(`Report saved to ${reportPath}`)
    } catch (error) {
      console.error(`Error saving report: ${error}`)
    }
  }

  /**
   * Generate and save a report for a specific directory
   */
  public static async generateAndSaveReport(
    outputDir: string,
    verbose: boolean = false
  ): Promise<void> {
    const report = await this.generateReport(outputDir, verbose)
    this.saveReport(report, outputDir)
  }
}
