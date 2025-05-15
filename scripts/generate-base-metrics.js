#!/usr/bin/env node

/**
 * Base Metrics Generator Script
 *
 * This script processes all CVs in the base directory with all available providers,
 * generates a consensus from the results, and saves it as a baseline for accuracy evaluation.
 */

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { ConsensusBuilder } = require('../dist/utils/ConsensusBuilder')

// Parse command line arguments
const UPDATE_MODE = process.argv.includes('--update')

// Configuration of providers and models to run
const CONFIGURATIONS = [
  { provider: 'gemini', model: undefined },
  { provider: 'gemini', model: 'gemini-1.5-flash-8b' },
  { provider: 'gemini', model: 'gemini-1.5-pro' },
  { provider: 'openai', model: undefined },
  { provider: 'openai', model: 'gpt-4-turbo' },
  { provider: 'grok', model: undefined },
  { provider: 'azure', model: 'gpt-4.1' },
  { provider: 'aws', model: undefined },
]

// Directory paths
const BASE_DIR = path.join(process.cwd(), 'base')
const CACHE_DIR = path.join(process.cwd(), 'cache')
const BASE_METRICS_FILE = path.join(CACHE_DIR, 'baseMetrics.json')

// Ensure directories exist
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true })
  console.log(`Created base directory: ${BASE_DIR}`)
  console.log(
    'Please add your benchmark CV PDFs to this directory before running this script again.'
  )
  process.exit(0)
}

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
}

// Get all PDF files in the base directory
const baseFiles = fs
  .readdirSync(BASE_DIR)
  .filter((file) => file.toLowerCase().endsWith('.pdf'))
  .map((file) => path.join(BASE_DIR, file))

if (baseFiles.length === 0) {
  console.error('No PDF files found in the base directory.')
  console.log(`Please add PDF files to: ${BASE_DIR}`)
  process.exit(1)
}

console.log(`Found ${baseFiles.length} base CV files.`)

/**
 * Process a CV with a specific provider and model
 */
function processCV(cvPath, config) {
  return new Promise((resolve, reject) => {
    const { provider, model } = config
    const outputDir = path.join(CACHE_DIR, path.basename(cvPath, '.pdf'))

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // Create a unique output file name for this configuration
    const outputFile = path.join(
      outputDir,
      `${provider}${model ? `_${model.replace(/[^\w-]/g, '-')}` : ''}.json`
    )

    console.log(
      `Processing ${path.basename(cvPath)} with ${provider}${
        model ? ` (${model})` : ''
      }...`
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
    let actualOutputFile = null

    // Capture output
    process.stdout.on('data', (data) => {
      const output = data.toString()
      stdout += output

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

        resolve({
          provider,
          model,
          cvPath,
          outputFile: actualOutputFile,
          status: 'success',
        })
      } else {
        reject({
          provider,
          model,
          cvPath,
          status: 'failed',
          error: stderr || 'Unknown error',
        })
      }
    })

    // Handle process errors
    process.on('error', (err) => {
      reject({
        provider,
        model,
        cvPath,
        status: 'failed',
        error: err.message,
      })
    })
  })
}

/**
 * Process all base CVs with all providers and build consensus
 */
async function generateBaseMetrics() {
  console.log(
    `Starting base metrics generation in ${
      UPDATE_MODE ? 'UPDATE' : 'NEW'
    } mode...`
  )
  console.log(
    `Will process ${baseFiles.length} CVs with ${CONFIGURATIONS.length} provider configurations.`
  )
  console.log('This may take a while...\n')

  // Initialize or load base metrics
  let baseMetrics = {
    version: 1,
    generatedAt: new Date().toISOString(),
    metrics: {},
  }

  // If in update mode and the file exists, load it
  if (UPDATE_MODE && fs.existsSync(BASE_METRICS_FILE)) {
    try {
      baseMetrics = JSON.parse(fs.readFileSync(BASE_METRICS_FILE, 'utf8'))
      console.log(
        `Loaded existing base metrics for updating: ${
          Object.keys(baseMetrics.metrics).length
        } CVs found`
      )
      // Update generatedAt timestamp
      baseMetrics.generatedAt = new Date().toISOString()
    } catch (error) {
      console.error(`Error loading existing base metrics: ${error}`)
      console.log('Will create new base metrics instead')
    }
  }

  // Process each CV in the base directory
  for (const cvPath of baseFiles) {
    const cvName = path.basename(cvPath)
    console.log(`\nProcessing CV: ${cvName}`)

    // Skip if in update mode and the CV is already in metrics (unless the file has changed)
    if (UPDATE_MODE && baseMetrics.metrics[cvName]) {
      const existingTimestamp = new Date(baseMetrics.metrics[cvName].timestamp)
      const fileStats = fs.statSync(cvPath)
      const fileModified = new Date(fileStats.mtime)

      if (fileModified < existingTimestamp) {
        console.log(`Skipping ${cvName} - already processed and file unchanged`)
        continue
      } else {
        console.log(
          `Updating ${cvName} - file has been modified since last processing`
        )
      }
    }

    // Process with all providers and models
    const results = await Promise.allSettled(
      CONFIGURATIONS.map((config) => processCV(cvPath, config))
    )

    // Separate successful and failed results
    const successResults = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value)

    const failedResults = results
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason)

    console.log(`\nProcessing complete for ${cvName}:`)
    console.log(`- Successful: ${successResults.length}`)
    console.log(`- Failed: ${failedResults.length}`)

    // Build consensus from successful results
    if (successResults.length > 0) {
      const outputFiles = successResults.map((r) => r.outputFile)
      const consensusBuilder = new ConsensusBuilder()
      const consensusResult = await consensusBuilder.buildConsensus(outputFiles)

      baseMetrics.metrics[cvName] = {
        consensus: consensusResult.consensus,
        confidence: consensusResult.confidence,
        providers: successResults.map((r) => ({
          provider: r.provider,
          model: r.model,
        })),
        timestamp: new Date().toISOString(),
      }

      console.log(
        `Generated consensus for ${cvName} with ${successResults.length} providers.`
      )
    } else {
      console.error(
        `Failed to generate consensus for ${cvName} - no successful extractions.`
      )
    }
  }

  // Save the base metrics to cache
  fs.writeFileSync(BASE_METRICS_FILE, JSON.stringify(baseMetrics, null, 2))
  console.log(`\nBase metrics saved to ${BASE_METRICS_FILE}`)

  // Print summary
  console.log('\nBase metrics generation complete!')
  console.log(
    `Processed ${baseFiles.length} base CVs with ${CONFIGURATIONS.length} provider configurations.`
  )
  console.log(
    `Generated consensus for ${Object.keys(baseMetrics.metrics).length} CVs.`
  )
}

// Run the main function
generateBaseMetrics().catch((err) => {
  console.error('Error in base metrics generation:', err)
  process.exit(1)
})
