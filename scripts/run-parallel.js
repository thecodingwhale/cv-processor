#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const {
  ConsensusAccuracyScorer,
} = require('../dist/utils/ConsensusAccuracyScorer')

// Configuration of providers and models to run
const CONFIGURATIONS = [
  // -- ./instructions.txt with pdftotexts --
  {
    provider: 'aws',
    model: 'apac.amazon.nova-micro-v1:0',
    instructionsPath: './instructions.txt',
    conversionType: 'pdftotexts',
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    instructionsPath: './instructions.txt',
    conversionType: 'pdftotexts',
  },
  {
    provider: 'openai',
    model: 'o3-mini',
    instructionsPath: './instructions.txt',
    conversionType: 'pdftotexts',
  },
  {
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    instructionsPath: './instructions.txt',
    conversionType: 'pdftotexts',
  },
  {
    provider: 'gemini',
    model: 'gemini-1.5-flash-8b',
    instructionsPath: './instructions.txt',
    conversionType: 'pdftotexts',
  },
  {
    provider: 'azure',
    model: 'o3-mini',
    instructionsPath: './instructions.txt',
    conversionType: 'pdftotexts',
  },
  {
    provider: 'grok',
    model: 'grok-3',
    instructionsPath: './instructions.txt',
    conversionType: 'pdftotexts',
  },

  // -- ./instructions_version_1.txt with pdftotexts --
  {
    provider: 'aws',
    model: 'apac.amazon.nova-micro-v1:0',
    instructionsPath: './instructions_version_1.txt',
    conversionType: 'pdftotexts',
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    instructionsPath: './instructions_version_1.txt',
    conversionType: 'pdftotexts',
  },
  {
    provider: 'openai',
    model: 'o3-mini',
    instructionsPath: './instructions_version_1.txt',
    conversionType: 'pdftotexts',
  },
  {
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    instructionsPath: './instructions_version_1.txt',
    conversionType: 'pdftotexts',
  },
  {
    provider: 'gemini',
    model: 'gemini-1.5-flash-8b',
    instructionsPath: './instructions_version_1.txt',
    conversionType: 'pdftotexts',
  },
  {
    provider: 'azure',
    model: 'o3-mini',
    instructionsPath: './instructions_version_1.txt',
    conversionType: 'pdftotexts',
  },
  {
    provider: 'grok',
    model: 'grok-3',
    instructionsPath: './instructions_version_1.txt',
    conversionType: 'pdftotexts',
  },

  // -- ./instructions.txt with pdftoimages --
  {
    provider: 'aws',
    model: 'apac.amazon.nova-lite-v1:0',
    instructionsPath: './instructions.txt',
    conversionType: 'pdftoimages',
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    instructionsPath: './instructions.txt',
    conversionType: 'pdftoimages',
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    instructionsPath: './instructions.txt',
    conversionType: 'pdftoimages',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.0-flash-lite',
    instructionsPath: './instructions.txt',
    conversionType: 'pdftoimages',
  },
  {
    provider: 'grok',
    model: 'grok-2-vision-1212',
    instructionsPath: './instructions.txt',
    conversionType: 'pdftoimages',
  },

  // -- ./instructions_version_1.txt with pdftoimages --
  {
    provider: 'aws',
    model: 'apac.amazon.nova-lite-v1:0',
    instructionsPath: './instructions_version_1.txt',
    conversionType: 'pdftoimages',
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    instructionsPath: './instructions_version_1.txt',
    conversionType: 'pdftoimages',
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    instructionsPath: './instructions_version_1.txt',
    conversionType: 'pdftoimages',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.0-flash-lite',
    instructionsPath: './instructions_version_1.txt',
    conversionType: 'pdftoimages',
  },
  {
    provider: 'grok',
    model: 'grok-2-vision-1212',
    instructionsPath: './instructions_version_1.txt',
    conversionType: 'pdftoimages',
  },
]

// Parse command line arguments
const args = process.argv.slice(2)
let cvPath = null
let expectedTotalFields = null

// Parse arguments
for (let i = 0; i < args.length; i++) {
  // Check if argument is --expected-total-fields
  if (args[i] === '--expected-total-fields' && i + 1 < args.length) {
    expectedTotalFields = parseInt(args[i + 1])
    i++ // Skip the next argument (the value)
  }
  // Check if it's just a number (for the parallel-with-expected script)
  else if (!isNaN(parseInt(args[i])) && expectedTotalFields === null) {
    expectedTotalFields = parseInt(args[i])
  }
  // Otherwise treat as CV path if we don't have one yet
  else if (!cvPath && !args[i].startsWith('--')) {
    cvPath = args[i]
  }
}

// For npm run parallel-with-expected script, handle when args are reversed
if (expectedTotalFields !== null && cvPath === null && args.length > 0) {
  // If we have a number but no path, check the remaining args for a path
  for (let i = 0; i < args.length; i++) {
    if (
      !args[i].startsWith('--') &&
      args[i] !== expectedTotalFields.toString()
    ) {
      cvPath = args[i]
      break
    }
  }
}

if (!cvPath) {
  console.error('Please provide a CV file path as an argument')
  console.error('Example: node scripts/run-parallel.js CVs/example.pdf')
  console.error(
    'You can also specify expected total fields: node scripts/run-parallel.js CVs/example.pdf --expected-total-fields 50'
  )
  console.error('Or: npm run parallel-with-expected 50 CVs/example.pdf')
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

// If expectedTotalFields is provided, add it to all configurations
if (expectedTotalFields) {
  console.log(`Using expected total fields: ${expectedTotalFields}`)
  // Add expectedTotalFields to all configurations
  CONFIGURATIONS.forEach((config) => {
    config.expectedTotalFields = expectedTotalFields
  })
}

/**
 * Run a single CV processing task with specific provider and model
 */
function runProcess(cvPath, config, outputDir) {
  return new Promise((resolve, reject) => {
    const {
      provider,
      model,
      instructionsPath,
      conversionType,
      expectedTotalFields,
    } = config

    // Create a unique output file name for this configuration
    const outputFile = path.join(
      outputDir,
      `${provider}${
        model ? `_${model.replace(/[^\w-]/g, '-')}` : ''
      }_${instructionsPath.replace(/[^\w-]/g, '-')}_${conversionType}.json`
    )

    console.log(
      `Starting process for ${provider}${
        model ? ` (${model})` : ''
      } with ${instructionsPath} and ${conversionType}...`
    )

    // Build the command arguments
    const args = [
      'start',
      '--',
      'process',
      cvPath,
      '--use-ai',
      provider,
      '-o',
      outputFile,
      '--instructions-path',
      instructionsPath,
    ]

    // Add conversion type
    if (conversionType === 'pdftotexts') {
      args.push('--conversion-type', 'pdftotexts')
    } else if (conversionType === 'pdftoimages') {
      args.push('--conversion-type', 'pdftoimages')
    }

    if (model) {
      args.push('--ai-model', model)
    }

    // Add expected total fields if provided
    if (expectedTotalFields) {
      args.push('--expected-total-fields', expectedTotalFields.toString())
    }

    // Spawn the process
    const process = spawn('npm', args, { stdio: 'pipe' })

    let stdout = ''
    let stderr = ''
    let processingTime = null
    let actualOutputFile = null // To store the actual file name after processing

    // Capture output
    process.stdout.on('data', (data) => {
      const output = data.toString()
      stdout += output

      // Try to extract processing time from the output
      const match = output.match(/Processing completed in (\d+\.\d+) seconds/)
      if (match) {
        processingTime = parseFloat(match[1])
      }

      // Try to extract the actual output file name
      const fileMatch = output.match(/Results saved to (.+\.json)/)
      if (fileMatch) {
        actualOutputFile = fileMatch[1]
      }
    })

    process.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    // Handle process completion
    process.on('close', (code) => {
      const endTime = new Date()

      if (code === 0) {
        // Use the actual output file if we found it, otherwise scan the output directory
        if (!actualOutputFile) {
          // Try to find a file with the provider name if we couldn't get it from logs
          const files = fs.readdirSync(outputDir)
          const matchingFiles = files.filter(
            (file) =>
              file.startsWith(`${provider}_`) ||
              file.startsWith(
                `${provider}${
                  model ? `_${model.replace(/[^\w-]/g, '-')}` : ''
                }_`
              )
          )
          if (matchingFiles.length > 0) {
            actualOutputFile = path.join(outputDir, matchingFiles[0])
          }
        }

        // If we still don't have the actual file, use the one we expected
        if (!actualOutputFile) {
          actualOutputFile = outputFile
        }

        // Try to read the processing time from the output file if we couldn't get it from logs
        if (!processingTime && fs.existsSync(actualOutputFile)) {
          try {
            const data = JSON.parse(fs.readFileSync(actualOutputFile, 'utf8'))
            if (data.metadata && data.metadata.processingTime) {
              processingTime = data.metadata.processingTime
            }
          } catch (e) {
            console.warn(
              `Couldn't read processing time from ${actualOutputFile}`
            )
          }
        }

        resolve({
          provider,
          model,
          instructionsPath,
          conversionType,
          status: 'success',
          processingTime,
          outputFile: actualOutputFile,
          stdout,
          stderr,
        })
      } else {
        reject({
          provider,
          model,
          instructionsPath,
          conversionType,
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
        instructionsPath,
        conversionType,
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

  // Check if we have consensus data to compare against
  let consensusInfo = ''
  const consensusScorer = new ConsensusAccuracyScorer()
  const cvFilename = path.basename(cvPath)
  let hasConsensusBaseline = false

  try {
    // Check if baseMetrics.json exists and contains this CV
    const cacheDir = path.join(process.cwd(), 'cache')
    const baseMetricsFile = path.join(cacheDir, 'baseMetrics.json')

    if (fs.existsSync(baseMetricsFile)) {
      const baseMetrics = JSON.parse(fs.readFileSync(baseMetricsFile, 'utf8'))
      if (baseMetrics.metrics && baseMetrics.metrics[cvFilename]) {
        hasConsensusBaseline = true
        consensusInfo = `\n\n## Consensus Information\n\nThis CV was evaluated against a consensus baseline created from ${baseMetrics.metrics[cvFilename].providers.length} AI providers.\n`
        consensusInfo += `\nConsensus strength: ${(
          baseMetrics.metrics[cvFilename].confidence.overall * 100
        ).toFixed(1)}%\n`
      }
    }
  } catch (error) {
    console.warn(`Error checking for consensus baseline: ${error.message}`)
  }

  // Build markdown string
  let md = `# CV Processing Report\n\n`
  md += `**CV**: ${path.basename(cvPath)}\n`
  md += `**Date**: ${new Date().toISOString().split('T')[0]}\n`
  md += `**Total Execution Time**: ${totalTime} seconds\n\n`

  md += `## Summary\n\n`
  md += `- **Total Providers**: ${totalProviders}\n`
  md += `- **Successful**: ${successResults.length}\n`
  md += `- **Failed**: ${failedResults.length}\n`
  md += `- **Success Rate**: ${successRate}%\n`

  if (hasConsensusBaseline) {
    md += `- **Consensus Baseline**: Yes\n`
  }

  // Find results with emptiness percentage data early in the report generation
  const resultsWithEmptinessPercentage = successResults.filter((result) => {
    if (!fs.existsSync(result.outputFile)) return false
    try {
      const data = JSON.parse(fs.readFileSync(result.outputFile, 'utf8'))
      return (
        data.metadata &&
        data.metadata.emptinessPercentage &&
        typeof data.metadata.emptinessPercentage.percentage === 'number'
      )
    } catch (e) {
      return false
    }
  })

  // Add best emptiness percentage to summary if available
  if (resultsWithEmptinessPercentage.length > 0) {
    const bestEmptinessForSummary = resultsWithEmptinessPercentage.reduce(
      (best, current) => {
        const data = JSON.parse(fs.readFileSync(current.outputFile, 'utf8'))
        const emptiness = data.metadata.emptinessPercentage
        if (!best.score || emptiness.percentage > best.score) {
          return {
            provider: current.provider,
            model: current.model || 'default',
            instructionsPath: current.instructionsPath,
            conversionType: current.conversionType,
            score: emptiness.percentage,
          }
        }
        return best
      },
      {
        provider: '',
        model: '',
        instructionsPath: '',
        conversionType: '',
        score: 0,
      }
    )

    md += `- **Best Field Emptiness**: ${bestEmptinessForSummary.score}% (${bestEmptinessForSummary.provider} ${bestEmptinessForSummary.model})\n`
  }

  md += `\n`

  if (successResults.length > 0) {
    md += `## Successful Executions\n\n`
    md += `| Provider | Model | Instructions Path | Conversion Type | Time (s) | Accuracy | Emptiness % | Expected Emptiness % | Emptiness Accuracy | Output File |\n`
    md += `|----------|-------|-----------------|---------------|----------|----------|------------|---------------------|-------------------|-------------|\n`

    successResults.forEach((result) => {
      let accuracyScore = 'N/A'
      let emptinessPercentage = 'N/A'
      let expectedEmptinessPercentage = 'N/A'
      let emptinessAccuracy = 'N/A'

      // Try to extract accuracy from the output file
      if (fs.existsSync(result.outputFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(result.outputFile, 'utf8'))
          if (
            data.metadata &&
            data.metadata.accuracy &&
            typeof data.metadata.accuracy.overall === 'number'
          ) {
            accuracyScore = `${data.metadata.accuracy.overall}%`
          }

          // Extract emptiness percentage information
          if (
            data.metadata &&
            data.metadata.emptinessPercentage &&
            typeof data.metadata.emptinessPercentage.percentage === 'number'
          ) {
            emptinessPercentage = `${data.metadata.emptinessPercentage.percentage}%`

            // Check for expected emptiness percentage
            if (
              data.metadata.emptinessPercentage.expectedTotalFields &&
              typeof data.metadata.emptinessPercentage.expectedPercentage ===
                'number'
            ) {
              expectedEmptinessPercentage = `${data.metadata.emptinessPercentage.expectedPercentage}%`

              // Calculate emptiness accuracy (how close AI total fields are to expected)
              const aiTotalFields =
                data.metadata.emptinessPercentage.totalFields
              const expectedTotalFields =
                data.metadata.emptinessPercentage.expectedTotalFields
              const fieldCountAccuracy =
                (Math.min(aiTotalFields, expectedTotalFields) /
                  Math.max(aiTotalFields, expectedTotalFields)) *
                100
              emptinessAccuracy = `${fieldCountAccuracy.toFixed(1)}%`
            }
          }
        } catch (e) {
          console.warn(`Couldn't read data from ${result.outputFile}`)
        }
      }

      const fileName = path.basename(result.outputFile)
      md += `| ${result.provider} | ${result.model || 'default'} | ${
        result.instructionsPath
      } | ${result.conversionType} | ${
        result.processingTime ? result.processingTime.toFixed(2) : 'N/A'
      } | ${accuracyScore} | ${emptinessPercentage} | ${expectedEmptinessPercentage} | ${emptinessAccuracy} | [View](./${fileName}) |\n`
    })
    md += `\n`
  }

  if (failedResults.length > 0) {
    md += `## Failed Executions\n\n`
    md += `| Provider | Model | Instructions Path | Conversion Type | Error |\n`
    md += `|----------|-------|-----------------|---------------|-------|\n`

    failedResults.forEach((result) => {
      const errorMsg = result.error || 'Unknown error'
      md += `| ${result.provider} | ${result.model || 'default'} | ${
        result.instructionsPath
      } | ${result.conversionType} | ${errorMsg} |\n`
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

  // Add consensus information if available
  if (hasConsensusBaseline) {
    md += consensusInfo
  }

  // Add accuracy comparison if available
  const resultsWithAccuracy = successResults.filter((result) => {
    if (!fs.existsSync(result.outputFile)) return false
    try {
      const data = JSON.parse(fs.readFileSync(result.outputFile, 'utf8'))
      return (
        data.metadata &&
        data.metadata.accuracy &&
        typeof data.metadata.accuracy.overall === 'number' &&
        data.metadata.accuracy.overall > 0
      )
    } catch (e) {
      return false
    }
  })

  if (resultsWithAccuracy.length > 0) {
    md += `\n## Accuracy Comparison\n\n`

    // Check if we're using consensus-based accuracy
    const hasConsensusResults = resultsWithAccuracy.some((result) => {
      const data = JSON.parse(fs.readFileSync(result.outputFile, 'utf8'))
      return data.metadata?.accuracy?.consensusSource
    })

    if (hasConsensusResults) {
      // Table for consensus-based accuracy
      md += `| Provider | Model | Instructions Path | Conversion Type | Overall | Field Accuracy | Completeness | Structure |\n`
      md += `|----------|-------|-----------------|---------------|---------|----------------|--------------|----------|\n`
    } else {
      // Table for standard accuracy
      md += `| Provider | Model | Instructions Path | Conversion Type | Overall | Categories | Completeness | Structure |\n`
      md += `|----------|-------|-----------------|---------------|---------|------------|--------------|----------|\n`
    }

    // Sort by overall accuracy (highest first)
    resultsWithAccuracy.sort((a, b) => {
      const dataA = JSON.parse(fs.readFileSync(a.outputFile, 'utf8'))
      const dataB = JSON.parse(fs.readFileSync(b.outputFile, 'utf8'))
      return dataB.metadata.accuracy.overall - dataA.metadata.accuracy.overall
    })

    resultsWithAccuracy.forEach((result) => {
      const data = JSON.parse(fs.readFileSync(result.outputFile, 'utf8'))
      const accuracy = data.metadata.accuracy

      if (accuracy.consensusSource) {
        // Consensus-based accuracy metrics
        md += `| ${result.provider} | ${result.model || 'default'} | ${
          result.instructionsPath
        } | ${result.conversionType} | ${accuracy.overall}% | ${
          accuracy.fieldAccuracy
        }% | ${accuracy.completeness}% | ${accuracy.structuralFidelity}% |\n`
      } else {
        // Standard accuracy metrics
        md += `| ${result.provider} | ${result.model || 'default'} | ${
          result.instructionsPath
        } | ${result.conversionType} | ${accuracy.overall}% | ${
          accuracy.categoryAssignment
        }% | ${accuracy.completeness}% | ${accuracy.structuralValidity}% |\n`
      }
    })
  }

  // Add emptiness percentage comparison if available
  if (
    resultsWithEmptinessPercentage &&
    resultsWithEmptinessPercentage.length > 0
  ) {
    md += `\n## Field Emptiness Comparison\n\n`
    md += `| Provider | Model | Instructions Path | Conversion Type | Populated Fields | Total Fields | Emptiness % | Expected Fields | Expected Emptiness % | Emptiness Accuracy |\n`
    md += `|----------|-------|-----------------|---------------|-----------------|--------------|------------|---------------|------------------|-----------------|\n`

    // Sort by emptiness percentage (highest first)
    const sortedEmptinessResults = [...resultsWithEmptinessPercentage].sort(
      (a, b) => {
        const dataA = JSON.parse(fs.readFileSync(a.outputFile, 'utf8'))
        const dataB = JSON.parse(fs.readFileSync(b.outputFile, 'utf8'))
        return (
          dataB.metadata.emptinessPercentage.percentage -
          dataA.metadata.emptinessPercentage.percentage
        )
      }
    )

    sortedEmptinessResults.forEach((result) => {
      const data = JSON.parse(fs.readFileSync(result.outputFile, 'utf8'))
      const emptiness = data.metadata.emptinessPercentage

      const expectedFields = emptiness.expectedTotalFields || '-'
      const expectedPercentage =
        emptiness.expectedPercentage !== undefined
          ? `${emptiness.expectedPercentage}%`
          : '-'

      // Calculate emptiness accuracy if expected total fields exists
      let emptinessAccuracy = '-'
      if (emptiness.expectedTotalFields) {
        const aiTotalFields = emptiness.totalFields
        const expectedTotalFields = emptiness.expectedTotalFields
        const fieldCountAccuracy =
          (Math.min(aiTotalFields, expectedTotalFields) /
            Math.max(aiTotalFields, expectedTotalFields)) *
          100
        emptinessAccuracy = `${fieldCountAccuracy.toFixed(1)}%`
      }

      md += `| ${result.provider} | ${result.model || 'default'} | ${
        result.instructionsPath
      } | ${result.conversionType} | ${emptiness.nonEmptyFields} | ${
        emptiness.totalFields
      } | ${
        emptiness.percentage
      }% | ${expectedFields} | ${expectedPercentage} | ${emptinessAccuracy} |\n`
    })

    // Find the best performer in field completeness
    const bestEmptinessForDetail = sortedEmptinessResults[0]
    const bestEmptinessData = JSON.parse(
      fs.readFileSync(bestEmptinessForDetail.outputFile, 'utf8')
    )
    const bestEmptinessScore =
      bestEmptinessData.metadata.emptinessPercentage.percentage

    md += `\n**Best Field Emptiness**: ${bestEmptinessForDetail.provider} (${bestEmptinessForDetail.model}) - ${bestEmptinessScore}%\n`
  }

  return md
}

// Export the function for use in other files
module.exports = {
  runProcess,
  generateMarkdownReport,
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
