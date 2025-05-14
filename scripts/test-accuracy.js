#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { AccuracyScorer } = require('../dist/utils/AccuracyScorer')

// Test data in the resume hierarchical format
const resumeData = {
  resume: [
    {
      category: 'Film',
      category_id: '123456',
      credits: [
        {
          id: '111',
          year: '2023',
          title: 'Test Movie',
          role: 'Lead Actor',
          director: 'Test Director',
        },
      ],
    },
  ],
  resume_show_years: true,
}

// Test data in the flat credits format
const creditsData = {
  credits: [
    {
      title: 'Test Movie',
      role: 'Lead Actor',
      year: '2023',
      director: 'Test Director',
      type: 'Film',
    },
  ],
}

// Run tests
console.log('Testing AccuracyScorer...')

// Get sample file from last run
const sampleFile = process.argv[2] || findLatestOutputFile()

// Test with sample file if found
if (sampleFile && fs.existsSync(sampleFile)) {
  console.log(`\nTesting with real data from ${sampleFile}`)
  try {
    const realData = JSON.parse(fs.readFileSync(sampleFile, 'utf8'))
    console.log('Data structure:')
    console.log('- Has resume array:', !!realData.resume)
    console.log('- Has credits array:', !!realData.credits)

    const result = AccuracyScorer.evaluateAccuracy(realData)
    console.log('\nAccuracy results for real data:')
    console.log(`- Overall: ${result.overall}%`)
    console.log(`- Category Assignment: ${result.categoryAssignment}%`)
    console.log(`- Completeness: ${result.completeness}%`)
    console.log(`- Structural Validity: ${result.structuralValidity}%`)
    console.log(
      `- Missing fields: ${result.missingFields.join(', ') || 'none'}`
    )
  } catch (err) {
    console.error(`Error processing real data: ${err.message}`)
  }
}

// Test with mock resume data
console.log('\nTesting with mock resume data:')
const resumeResult = AccuracyScorer.evaluateAccuracy(resumeData)
console.log(`- Overall: ${resumeResult.overall}%`)
console.log(`- Category Assignment: ${resumeResult.categoryAssignment}%`)
console.log(`- Completeness: ${resumeResult.completeness}%`)
console.log(`- Structural Validity: ${resumeResult.structuralValidity}%`)
console.log(
  `- Missing fields: ${resumeResult.missingFields.join(', ') || 'none'}`
)

// Test with mock credits data
console.log('\nTesting with mock credits data:')
const creditsResult = AccuracyScorer.evaluateAccuracy(creditsData)
console.log(`- Overall: ${creditsResult.overall}%`)
console.log(`- Category Assignment: ${creditsResult.categoryAssignment}%`)
console.log(`- Completeness: ${creditsResult.completeness}%`)
console.log(`- Structural Validity: ${creditsResult.structuralValidity}%`)
console.log(
  `- Missing fields: ${creditsResult.missingFields.join(', ') || 'none'}`
)

/**
 * Find the latest output file to use for testing
 */
function findLatestOutputFile() {
  const outputDir = path.join(__dirname, '..', 'output')
  if (!fs.existsSync(outputDir)) {
    return null
  }

  // Find the most recent directory
  const dirs = fs
    .readdirSync(outputDir)
    .filter((name) => fs.statSync(path.join(outputDir, name)).isDirectory())
    .sort((a, b) => {
      return (
        fs.statSync(path.join(outputDir, b)).mtime.getTime() -
        fs.statSync(path.join(outputDir, a)).mtime.getTime()
      )
    })

  if (dirs.length === 0) {
    return null
  }

  // Find a JSON file in that directory
  const latestDir = path.join(outputDir, dirs[0])
  const files = fs
    .readdirSync(latestDir)
    .filter((name) => name.endsWith('.json'))

  if (files.length === 0) {
    return null
  }

  return path.join(latestDir, files[0])
}
