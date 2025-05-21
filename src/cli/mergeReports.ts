import { Command } from 'commander'
import fs from 'fs'
import path from 'path'
import { createHtmlReport, renderChartsFromReport } from '../utils/renderCharts'
import { mergeReports } from '../utils/reportMerger'

export default function registerMergeReportsCommand(program: Command) {
  program
    .command('merge-reports')
    .description('Merge multiple report.md files into a single report')
    .argument('<outputDir>', 'Directory containing the report.md files')
    .option('-o, --output <file>', 'Output file name', 'merged-report.md')
    .option('-c, --charts', 'Render Mermaid charts to images')
    .option('--html', 'Generate HTML report with embedded charts')
    .action(async (outputDir, options) => {
      try {
        console.log(`Merging reports from ${outputDir}...`)

        const reportContent = await mergeReports(outputDir)

        // Write the merged markdown report
        const outputFile = options.output || 'merged-report.md'
        const outputPath = path.join(process.cwd(), outputFile)

        fs.writeFileSync(outputPath, reportContent)

        console.log(`Merged report written to ${outputPath}`)

        // Render charts if requested
        if (options.charts || options.html) {
          console.log('Rendering Mermaid charts...')

          const chartsDir = path.join(path.dirname(outputPath), 'charts')

          if (options.html) {
            // Generate HTML report with embedded charts
            const htmlPath = await createHtmlReport(outputPath, chartsDir)
            console.log(
              `HTML report with embedded charts created at: ${htmlPath}`
            )
          } else if (options.charts) {
            // Just render the chart images
            const chartPaths = await renderChartsFromReport(
              outputPath,
              chartsDir
            )
            console.log(`Rendered ${chartPaths.length} charts to ${chartsDir}`)
          }
        }
      } catch (error) {
        console.error('Error merging reports:', error)
        process.exit(1)
      }
    })
}
