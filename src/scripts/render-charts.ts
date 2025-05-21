#!/usr/bin/env ts-node
import fs from 'fs'
import path from 'path'
import { createHtmlReport, renderChartsFromReport } from '../utils/renderCharts'

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 1) {
    console.error('Usage: render-charts.ts <report-path> [--html]')
    process.exit(1)
  }

  const reportPath = args[0]
  const generateHtml = args.includes('--html')

  if (!fs.existsSync(reportPath)) {
    console.error(`Report file not found: ${reportPath}`)
    process.exit(1)
  }

  // Create output directory for charts
  const baseDir = path.dirname(reportPath)
  const outputDir = path.join(baseDir, 'charts')

  console.log(`Rendering charts from ${reportPath}...`)

  if (generateHtml) {
    // Generate HTML report with embedded chart images
    const htmlPath = await createHtmlReport(reportPath, outputDir)
    console.log(`HTML report with embedded charts created at: ${htmlPath}`)
  } else {
    // Just render the chart images
    const chartPaths = await renderChartsFromReport(reportPath, outputDir)

    if (chartPaths.length > 0) {
      console.log(
        `Successfully rendered ${chartPaths.length} charts to ${outputDir}:`
      )
      chartPaths.forEach((chartPath) => console.log(`- ${chartPath}`))
    } else {
      console.log('No charts were found or rendered.')
    }
  }
}

main().catch((error) => {
  console.error('Error rendering charts:', error)
  process.exit(1)
})
