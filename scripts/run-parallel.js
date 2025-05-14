#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

// Configuration of providers and models to run
const CONFIGURATIONS = [
  { provider: 'gemini', model: undefined },
  { provider: 'gemini', model: 'gemini-1.5-flash-8b' },
  { provider: 'openai', model: undefined },
  { provider: 'openai', model: 'gpt-4-turbo' },
  { provider: 'grok', model: undefined },
  { provider: 'grok', model: 'grok-3-mini-fast-beta' },
  { provider: 'azure', model: undefined },
  { provider: 'azure', model: 'gpt-35-turbo' },
  { provider: 'aws', model: undefined },
]

// Get the CV path from command line arguments
const cvPath = process.argv[2]

if (!cvPath) {
  console.error('Please provide a CV file path as an argument')
  console.error('Example: node scripts/run-parallel.js CVs/example.pdf')
  process.exit(1)
}

// Check if the CV file exists
if (!fs.existsSync(cvPath)) {
  console.error(`CV file not found: ${cvPath}`)
  process.exit(1)
}

// Create output directory based on CV filename and date
const cvBasename = path.basename(cvPath, path.extname(cvPath))
// Use date and time in the directory name (format: YYYY-MM-DD_HH-MM-SS)
const now = new Date()
const dateStr = now.toISOString().slice(0, 10) // YYYY-MM-DD
const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-') // HH-MM-SS
const outputDir = path.join('output', `${cvBasename}_${dateStr}_${timeStr}`)

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

/**
 * Run a single CV processing task with specific provider and model
 */
function runProcess(cvPath, config, outputDir) {
  return new Promise((resolve, reject) => {
    const { provider, model } = config

    // Create a unique output file name for this configuration
    const outputFile = path.join(
      outputDir,
      `${provider}${model ? `_${model.replace(/[^\w-]/g, '-')}` : ''}.json`
    )

    console.log(
      `Starting process for ${provider}${model ? ` (${model})` : ''}...`
    )

    // Build the command arguments
    const args = ['start', '--', cvPath, '--use-ai', provider, '-o', outputFile]
    if (model) {
      args.push('--ai-model', model)
    }

    // Spawn the process
    const process = spawn('npm', args, { stdio: 'pipe' })

    let stdout = ''
    let stderr = ''
    let processingTime = null

    // Capture output
    process.stdout.on('data', (data) => {
      const output = data.toString()
      stdout += output

      // Try to extract processing time from the output
      const match = output.match(/Processing completed in (\d+\.\d+) seconds/)
      if (match) {
        processingTime = parseFloat(match[1])
      }
    })

    process.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    // Handle process completion
    process.on('close', (code) => {
      const endTime = new Date()

      if (code === 0) {
        // Try to read the processing time from the output file if we couldn't get it from logs
        if (!processingTime && fs.existsSync(outputFile)) {
          try {
            const data = JSON.parse(fs.readFileSync(outputFile, 'utf8'))
            if (data.metadata && data.metadata.processingTime) {
              processingTime = data.metadata.processingTime
            }
          } catch (e) {
            console.warn(`Couldn't read processing time from ${outputFile}`)
          }
        }

        resolve({
          provider,
          model,
          status: 'success',
          processingTime,
          outputFile,
          stdout,
          stderr,
        })
      } else {
        reject({
          provider,
          model,
          status: 'failed',
          exitCode: code,
          error: stderr || 'Unknown error',
          stdout,
          stderr,
        })
      }
    })

    // Handle process errors
    process.on('error', (err) => {
      reject({
        provider,
        model,
        status: 'failed',
        error: err.message,
        stdout,
        stderr,
      })
    })
  })
}

/**
 * Generate a markdown report from the results
 */
function generateMarkdownReport(
  successResults,
  failedResults,
  startTime,
  cvPath,
  outputDir
) {
  const endTime = new Date()
  const totalTime = ((endTime - startTime) / 1000).toFixed(2)
  const totalProviders = successResults.length + failedResults.length
  const successRate =
    totalProviders > 0
      ? ((successResults.length / totalProviders) * 100).toFixed(1)
      : '0.0'

  // Sort successful results by processing time (fastest first)
  successResults.sort((a, b) => a.processingTime - b.processingTime)

  // Calculate stats
  const fastest = successResults[0] || {
    provider: 'none',
    model: 'none',
    processingTime: 0,
  }
  const slowest = successResults[successResults.length - 1] || {
    provider: 'none',
    model: 'none',
    processingTime: 0,
  }
  const avgTime =
    successResults.length > 0
      ? (
          successResults.reduce((sum, r) => sum + (r.processingTime || 0), 0) /
          successResults.length
        ).toFixed(2)
      : '0.00'

  // Build markdown string
  let md = `# CV Processing Report\n\n`
  md += `**CV**: ${path.basename(cvPath)}\n`
  md += `**Date**: ${new Date().toISOString().split('T')[0]}\n`
  md += `**Total Execution Time**: ${totalTime} seconds\n\n`

  md += `## Summary\n\n`
  md += `- **Total Providers**: ${totalProviders}\n`
  md += `- **Successful**: ${successResults.length}\n`
  md += `- **Failed**: ${failedResults.length}\n`
  md += `- **Success Rate**: ${successRate}%\n\n`

  if (successResults.length > 0) {
    md += `## Successful Executions\n\n`
    md += `| Provider | Model | Time (s) | Output File |\n`
    md += `|----------|-------|----------|-------------|\n`

    successResults.forEach((result) => {
      const fileName = path.basename(result.outputFile)
      md += `| ${result.provider} | ${result.model || 'default'} | ${
        result.processingTime ? result.processingTime.toFixed(2) : 'N/A'
      } | [View](./${fileName}) |\n`
    })
    md += `\n`
  }

  if (failedResults.length > 0) {
    md += `## Failed Executions\n\n`
    md += `| Provider | Model | Error |\n`
    md += `|----------|-------|-------|\n`

    failedResults.forEach((result) => {
      const errorMsg = result.error || 'Unknown error'
      const truncatedError =
        errorMsg.length > 50 ? errorMsg.substring(0, 50) + '...' : errorMsg
      md += `| ${result.provider} | ${
        result.model || 'default'
      } | ${truncatedError} |\n`
    })
    md += `\n`
  }

  md += `## Performance Comparison\n\n`
  if (successResults.length > 0) {
    md += `- **Fastest**: ${fastest.provider} (${
      fastest.model || 'default'
    }) - ${
      fastest.processingTime ? fastest.processingTime.toFixed(2) : 'N/A'
    }s\n`
    md += `- **Slowest**: ${slowest.provider} (${
      slowest.model || 'default'
    }) - ${
      slowest.processingTime ? slowest.processingTime.toFixed(2) : 'N/A'
    }s\n`
    md += `- **Average Time**: ${avgTime}s\n`
  } else {
    md += `No successful executions to compare.\n`
  }

  return md
}

/**
 * Main function to run all processes in parallel
 */
async function main() {
  const startTime = new Date()
  console.log(`Starting parallel CV processing for ${cvPath}`)
  console.log(`Output directory: ${outputDir}`)
  console.log(`Running ${CONFIGURATIONS.length} provider configurations...`)

  // Run all processes and collect results (using Promise.allSettled to handle failures)
  const results = await Promise.allSettled(
    CONFIGURATIONS.map((config) => runProcess(cvPath, config, outputDir))
  )

  // Separate successful and failed results
  const successResults = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)

  const failedResults = results
    .filter((r) => r.status === 'rejected')
    .map((r) => r.reason)

  // Generate and save report
  const reportPath = path.join(outputDir, 'report.md')
  const report = generateMarkdownReport(
    successResults,
    failedResults,
    startTime,
    cvPath,
    outputDir
  )
  fs.writeFileSync(reportPath, report)

  // Print summary
  console.log(`\nParallel execution complete:`)
  console.log(`- Total: ${CONFIGURATIONS.length}`)
  console.log(`- Successful: ${successResults.length}`)
  console.log(`- Failed: ${failedResults.length}`)
  console.log(`\nReport saved to: ${reportPath}`)
}

// Run the main function
main().catch((err) => {
  console.error('Error in parallel execution:', err)
  process.exit(1)
})
