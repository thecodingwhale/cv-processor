import fs from 'fs'
import { glob } from 'glob'
import path from 'path'

interface ProviderMetrics {
  provider: string
  model: string
  processingTime: number
  accuracy: number
  fieldAccuracy?: number
  completeness?: number
  structure?: number
  emptinessPercentage?: number
  count: number
  successRate: number
  files: string[]
}

interface Report {
  providers: Record<string, ProviderMetrics>
  models: Record<string, ProviderMetrics>
  allRuns: {
    cvName: string
    provider: string
    model: string
    processingTime: number
    accuracy: number
    fieldAccuracy?: number
    completeness?: number
    structure?: number
    emptinessPercentage?: number
    outputFile: string
    tokenUsage?: {
      totalTokens: number
      inputTokens: number
      outputTokens: number
      estimatedCost?: number
    }
  }[]
}

export async function mergeReports(outputDir: string): Promise<string> {
  // Find all report.md files in subdirectories
  const reportFiles = await glob(`${outputDir}/**/report.md`)

  if (reportFiles.length === 0) {
    return 'No report files found'
  }

  const report: Report = {
    providers: {},
    models: {},
    allRuns: [],
  }

  // Process each report file
  for (const reportFile of reportFiles) {
    const content = fs.readFileSync(reportFile, 'utf-8')
    const dirName = path.dirname(reportFile)
    const cvName = path.basename(dirName).split('_')[0]

    // Extract the successful executions table
    const successfulExecutionsMatch = content.match(
      /## Successful Executions\n\n\|.*\|.*\|\n\|.*\|.*\|\n((?:\|.*\|\n)*)/
    )
    if (!successfulExecutionsMatch) continue

    const executionRows = successfulExecutionsMatch[1].trim().split('\n')

    // Extract the accuracy comparison table
    const accuracyTableMatch = content.match(
      /## Accuracy Comparison\n\n\|.*\|.*\|\n\|.*\|.*\|\n((?:\|.*\|\n)*)/
    )
    if (!accuracyTableMatch) continue

    const accuracyRows = accuracyTableMatch[1].trim().split('\n')

    // Extract the token usage comparison table if available
    const tokenUsageMatch = content.match(
      /## Token Usage Comparison\n\n\|.*\|.*\|\n\|.*\|.*\|\n((?:\|.*\|\n)*)/
    )

    // Extract the field emptiness comparison table if available
    const emptinessTableMatch = content.match(
      /## Field Emptiness Comparison\n\n\|.*\|.*\|\n\|.*\|.*\|\n((?:\|.*\|\n)*)/
    )

    // Map to store token usage by provider and model
    const tokenUsageByModel: Record<
      string,
      {
        inputTokens: number
        outputTokens: number
        totalTokens: number
        estimatedCost?: number
      }
    > = {}

    // Map to store emptiness percentage by provider and model
    const emptinessByModel: Record<
      string,
      {
        percentage: number
        nonEmptyFields: number
        totalFields: number
      }
    > = {}

    // Process token usage data if available
    if (tokenUsageMatch) {
      const tokenUsageRows = tokenUsageMatch[1].trim().split('\n')

      for (const row of tokenUsageRows) {
        const columns = row.split('|').map((col) => col.trim())
        if (columns.length < 7) continue

        const provider = columns[1]
        const model = columns[2]
        const inputTokens = columns[3] !== 'N/A' ? parseInt(columns[3]) : 0
        const outputTokens = columns[4] !== 'N/A' ? parseInt(columns[4]) : 0
        const totalTokens = columns[5] !== 'N/A' ? parseInt(columns[5]) : 0

        // Parse estimated cost (remove $ and convert to float)
        let estimatedCost: number | undefined = undefined
        if (columns[6] !== 'N/A') {
          const costStr = columns[6].replace('$', '')
          estimatedCost = parseFloat(costStr)
          if (isNaN(estimatedCost)) estimatedCost = undefined
        }

        // Create a key to match with execution data
        const key = `${provider}_${model}`

        // Store token usage data
        tokenUsageByModel[key] = {
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCost,
        }
      }
    }

    // Process emptiness percentage data if available
    if (emptinessTableMatch) {
      const emptinessRows = emptinessTableMatch[1].trim().split('\n')

      for (const row of emptinessRows) {
        const columns = row.split('|').map((col) => col.trim())
        if (columns.length < 6) continue

        const provider = columns[1]
        const model = columns[2]
        const nonEmptyFields = columns[3] !== 'N/A' ? parseInt(columns[3]) : 0
        const totalFields = columns[4] !== 'N/A' ? parseInt(columns[4]) : 0

        // Parse emptiness percentage (remove % and convert to decimal)
        let percentage = 0
        if (columns[5] !== 'N/A') {
          const percentStr = columns[5].replace('%', '')
          percentage = parseInt(percentStr) / 100
          if (isNaN(percentage)) percentage = 0
        }

        // Create a key to match with execution data
        const key = `${provider}_${model}`

        // Store emptiness percentage data
        emptinessByModel[key] = {
          percentage,
          nonEmptyFields,
          totalFields,
        }
      }
    }

    // Process all executions with their times and output files
    const executions: Record<
      string,
      { processingTime: number; outputFile: string }
    > = {}

    for (const row of executionRows) {
      const columns = row.split('|').map((col) => col.trim())
      if (columns.length < 6) continue

      const provider = columns[1]
      const model = columns[2]
      const timeStr = columns[3]
      const outputFileLink = columns[columns.length - 2] // Account for potential additional columns

      // Try to extract token usage directly from the table if available
      let totalTokens: number | undefined = undefined
      let estimatedCost: number | undefined = undefined

      // If we have token usage column (depends on table format)
      if (columns.length >= 7) {
        const tokenUsageStr = columns[4]
        if (tokenUsageStr !== 'N/A') {
          totalTokens = parseInt(tokenUsageStr)
          if (isNaN(totalTokens)) totalTokens = undefined
        }

        // If we have estimated cost column
        if (columns.length >= 8) {
          const costStr = columns[5].replace('$', '')
          if (costStr !== 'N/A') {
            estimatedCost = parseFloat(costStr)
            if (isNaN(estimatedCost)) estimatedCost = undefined
          }
        }
      }

      // Extract processing time
      const time = parseFloat(timeStr)
      if (isNaN(time)) continue

      // Extract output file path
      const outputFileMatch = outputFileLink.match(/\[View\]\(\.\/(.+)\)/)
      const outputFile = outputFileMatch ? outputFileMatch[1] : ''

      // Create a key to match with accuracy table
      const key = `${provider}_${model}`

      executions[key] = {
        processingTime: time,
        outputFile,
      }
    }

    // Process accuracy data and match with execution data
    for (const row of accuracyRows) {
      const columns = row.split('|').map((col) => col.trim())
      if (columns.length < 7) continue

      const provider = columns[1]
      const model = columns[2]
      const accuracy = parseInt(columns[3].replace('%', '')) / 100
      const fieldAccuracy =
        columns[4] !== '-'
          ? parseInt(columns[4].replace('%', '')) / 100
          : undefined
      const completeness =
        columns[5] !== '-'
          ? parseInt(columns[5].replace('%', '')) / 100
          : undefined
      const structure =
        columns[6] !== '-'
          ? parseInt(columns[6].replace('%', '')) / 100
          : undefined

      // Skip if we can't parse accuracy
      if (isNaN(accuracy)) continue

      // Find matching execution data
      const key = `${provider}_${model}`
      const execution = executions[key] || { processingTime: 0, outputFile: '' }

      // Get token usage data if available
      const tokenUsage = tokenUsageByModel[key]

      // Get emptiness percentage data if available
      const emptiness = emptinessByModel[key]

      // Update provider metrics
      const providerKey = provider
      if (!report.providers[providerKey]) {
        report.providers[providerKey] = {
          provider,
          model: 'Various',
          processingTime: 0,
          accuracy: 0,
          fieldAccuracy: 0,
          completeness: 0,
          structure: 0,
          emptinessPercentage: 0,
          count: 0,
          successRate: 0,
          files: [],
        }
      }

      report.providers[providerKey].processingTime += execution.processingTime
      report.providers[providerKey].accuracy += accuracy
      if (fieldAccuracy)
        report.providers[providerKey].fieldAccuracy! += fieldAccuracy
      if (completeness)
        report.providers[providerKey].completeness! += completeness
      if (structure) report.providers[providerKey].structure! += structure
      if (emptiness)
        report.providers[providerKey].emptinessPercentage! +=
          emptiness.percentage
      report.providers[providerKey].count += 1
      report.providers[providerKey].files.push(
        path.join(dirName, execution.outputFile)
      )

      // Update model metrics
      const modelKey = `${provider}_${model}`
      if (!report.models[modelKey]) {
        report.models[modelKey] = {
          provider,
          model,
          processingTime: 0,
          accuracy: 0,
          fieldAccuracy: 0,
          completeness: 0,
          structure: 0,
          emptinessPercentage: 0,
          count: 0,
          successRate: 0,
          files: [],
        }
      }

      report.models[modelKey].processingTime += execution.processingTime
      report.models[modelKey].accuracy += accuracy
      if (fieldAccuracy) report.models[modelKey].fieldAccuracy! += fieldAccuracy
      if (completeness) report.models[modelKey].completeness! += completeness
      if (structure) report.models[modelKey].structure! += structure
      if (emptiness)
        report.models[modelKey].emptinessPercentage! += emptiness.percentage
      report.models[modelKey].count += 1
      report.models[modelKey].files.push(
        path.join(dirName, execution.outputFile)
      )

      // Add to all runs
      report.allRuns.push({
        cvName,
        provider,
        model,
        processingTime: execution.processingTime,
        accuracy,
        fieldAccuracy,
        completeness,
        structure,
        emptinessPercentage: emptiness ? emptiness.percentage : undefined,
        outputFile: path.join(dirName, execution.outputFile),
        tokenUsage: tokenUsage
          ? {
              totalTokens: tokenUsage.totalTokens || 0,
              inputTokens: tokenUsage.inputTokens || 0,
              outputTokens: tokenUsage.outputTokens || 0,
              estimatedCost: tokenUsage.estimatedCost || 0,
            }
          : {
              totalTokens: 0,
              inputTokens: 0,
              outputTokens: 0,
              estimatedCost: 0,
            },
      })
    }

    // Extract success rate from the summary
    const totalProvidersMatch = content.match(
      /- \*\*Total Providers\*\*: (\d+)/
    )
    const successfulMatch = content.match(/- \*\*Successful\*\*: (\d+)/)

    if (totalProvidersMatch && successfulMatch) {
      const total = parseInt(totalProvidersMatch[1])
      const successful = parseInt(successfulMatch[1])
      const successRate = successful / total

      // Apply success rate to all providers in this CV
      for (const run of report.allRuns.filter((r) => r.cvName === cvName)) {
        if (report.providers[run.provider]) {
          report.providers[run.provider].successRate = successRate
        }
      }
    }
  }

  // Calculate averages
  for (const provider of Object.values(report.providers)) {
    if (provider.count > 0) {
      provider.processingTime = provider.processingTime / provider.count
      provider.accuracy = provider.accuracy / provider.count
      if (provider.fieldAccuracy)
        provider.fieldAccuracy = provider.fieldAccuracy / provider.count
      if (provider.completeness)
        provider.completeness = provider.completeness / provider.count
      if (provider.structure)
        provider.structure = provider.structure / provider.count
      if (provider.emptinessPercentage)
        provider.emptinessPercentage =
          provider.emptinessPercentage / provider.count
    }
  }

  for (const model of Object.values(report.models)) {
    if (model.count > 0) {
      model.processingTime = model.processingTime / model.count
      model.accuracy = model.accuracy / model.count
      if (model.fieldAccuracy)
        model.fieldAccuracy = model.fieldAccuracy / model.count
      if (model.completeness)
        model.completeness = model.completeness / model.count
      if (model.structure) model.structure = model.structure / model.count
      if (model.emptinessPercentage)
        model.emptinessPercentage = model.emptinessPercentage / model.count
    }
  }

  // Generate markdown report
  return generateMarkdownReport(await loadTokenUsageData(report))
}

/**
 * Load additional data from JSON files
 */
async function loadTokenUsageData(report: Report): Promise<Report> {
  // Process each run to extract data from JSON files
  for (const run of report.allRuns) {
    try {
      // Read the output file to get token usage information
      if (fs.existsSync(run.outputFile)) {
        const data = JSON.parse(fs.readFileSync(run.outputFile, 'utf8'))

        // Check if token usage information is available in metadata
        if (data.metadata && data.metadata.tokenUsage) {
          run.tokenUsage = {
            totalTokens: data.metadata.tokenUsage.totalTokens || 0,
            inputTokens: data.metadata.tokenUsage.inputTokens || 0,
            outputTokens: data.metadata.tokenUsage.outputTokens || 0,
            estimatedCost: data.metadata.tokenUsage.estimatedCost || 0,
          }
        }

        // Check if emptiness percentage information is available in metadata
        if (data.metadata && data.metadata.emptinessPercentage) {
          run.emptinessPercentage =
            data.metadata.emptinessPercentage.percentage / 100
        }
      }
    } catch (error) {
      console.error(
        `Error loading additional data from ${run.outputFile}:`,
        error
      )
    }
  }

  return report
}

function generateMarkdownReport(report: Report): string {
  const sortedProviders = Object.values(report.providers).sort(
    (a, b) => b.accuracy - a.accuracy
  )
  const sortedModels = Object.values(report.models).sort(
    (a, b) => b.accuracy - a.accuracy
  )
  const fastestProviders = [...Object.values(report.providers)].sort(
    (a, b) => a.processingTime - b.processingTime
  )
  const fastestModels = [...Object.values(report.models)].sort(
    (a, b) => a.processingTime - b.processingTime
  )

  // Sort by emptiness percentage (higher is better)
  const bestEmptinessProviders = [...Object.values(report.providers)]
    .filter(
      (p) => p.emptinessPercentage !== undefined && p.emptinessPercentage > 0
    )
    .sort((a, b) => (b.emptinessPercentage || 0) - (a.emptinessPercentage || 0))

  const bestEmptinessModels = [...Object.values(report.models)]
    .filter(
      (m) => m.emptinessPercentage !== undefined && m.emptinessPercentage > 0
    )
    .sort((a, b) => (b.emptinessPercentage || 0) - (a.emptinessPercentage || 0))

  // Calculate a combined score (weighted average of accuracy and speed)
  // Higher is better
  const combinedScore = (metrics: ProviderMetrics) => {
    // Normalize processing time to a 0-1 scale (reversed, so faster is better)
    const maxTime = Math.max(
      ...Object.values(report.models).map((m) => m.processingTime)
    )
    const normalizedTime =
      maxTime > 0 ? 1 - metrics.processingTime / maxTime : 0

    // Include emptiness percentage in the score if available
    const emptinessScore = metrics.emptinessPercentage || 0

    // Weight accuracy more heavily than speed, also consider emptiness percentage
    return metrics.accuracy * 0.6 + normalizedTime * 0.2 + emptinessScore * 0.2
  }

  const bestOverallProviders = [...Object.values(report.providers)].sort(
    (a, b) => combinedScore(b) - combinedScore(a)
  )
  const bestOverallModels = [...Object.values(report.models)].sort(
    (a, b) => combinedScore(b) - combinedScore(a)
  )

  let markdown = `# Merged CV Processing Report\n\n`
  markdown += `**Date**: ${new Date().toISOString().split('T')[0]}\n`
  markdown += `**Total CV Samples**: ${
    new Set(report.allRuns.map((r) => r.cvName)).size
  }\n`
  markdown += `**Total Runs Analyzed**: ${report.allRuns.length}\n\n`

  markdown += `## Best Providers by Accuracy\n\n`
  markdown += `| Provider | Avg Accuracy | Avg Field Accuracy | Avg Completeness | Avg Structure | Avg Emptiness | Runs |\n`
  markdown += `|----------|-------------|-------------------|-----------------|--------------|--------------|------|\n`
  for (const provider of sortedProviders) {
    markdown += `| ${provider.provider} | ${(provider.accuracy * 100).toFixed(
      1
    )}% | ${
      provider.fieldAccuracy ? (provider.fieldAccuracy * 100).toFixed(1) : '-'
    }% | ${
      provider.completeness ? (provider.completeness * 100).toFixed(1) : '-'
    }% | ${
      provider.structure ? (provider.structure * 100).toFixed(1) : '-'
    }% | ${
      provider.emptinessPercentage
        ? (provider.emptinessPercentage * 100).toFixed(1)
        : '-'
    }% | ${provider.count} |\n`
  }

  markdown += `\n## Best Models by Accuracy\n\n`
  markdown += `| Provider | Model | Avg Accuracy | Avg Field Accuracy | Avg Completeness | Avg Structure | Avg Emptiness | Runs |\n`
  markdown += `|----------|-------|-------------|-------------------|-----------------|--------------|--------------|------|\n`
  for (const model of sortedModels) {
    markdown += `| ${model.provider} | ${model.model} | ${(
      model.accuracy * 100
    ).toFixed(1)}% | ${
      model.fieldAccuracy ? (model.fieldAccuracy * 100).toFixed(1) : '-'
    }% | ${
      model.completeness ? (model.completeness * 100).toFixed(1) : '-'
    }% | ${model.structure ? (model.structure * 100).toFixed(1) : '-'}% | ${
      model.emptinessPercentage
        ? (model.emptinessPercentage * 100).toFixed(1)
        : '-'
    }% | ${model.count} |\n`
  }

  markdown += `\n## Fastest Providers\n\n`
  markdown += `| Provider | Avg Processing Time (s) | Runs |\n`
  markdown += `|----------|--------------------------|------|\n`
  for (const provider of fastestProviders) {
    markdown += `| ${provider.provider} | ${provider.processingTime.toFixed(
      2
    )} | ${provider.count} |\n`
  }

  markdown += `\n## Fastest Models\n\n`
  markdown += `| Provider | Model | Avg Processing Time (s) | Runs |\n`
  markdown += `|----------|-------|--------------------------|------|\n`
  for (const model of fastestModels) {
    markdown += `| ${model.provider} | ${
      model.model
    } | ${model.processingTime.toFixed(2)} | ${model.count} |\n`
  }

  // Add token usage comparison by model
  markdown += `\n## Token Usage Comparison by Model\n\n`
  markdown += `| Provider | Model | Avg Total Tokens | Avg Input Tokens | Avg Output Tokens | Avg Est. Cost |\n`
  markdown += `|----------|-------|-----------------|-----------------|------------------|-------------|\n`

  // Calculate token usage for each model
  const modelTokenUsage = new Map<
    string,
    {
      totalTokens: number
      inputTokens: number
      outputTokens: number
      estimatedCost: number
      count: number
    }
  >()

  for (const run of report.allRuns) {
    const modelKey = `${run.provider}_${run.model}`

    // Skip if no token usage info
    if (!run.tokenUsage) continue

    if (!modelTokenUsage.has(modelKey)) {
      modelTokenUsage.set(modelKey, {
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
        count: 0,
      })
    }

    const usage = modelTokenUsage.get(modelKey)!
    usage.totalTokens += run.tokenUsage.totalTokens || 0
    usage.inputTokens += run.tokenUsage.inputTokens || 0
    usage.outputTokens += run.tokenUsage.outputTokens || 0
    usage.estimatedCost += run.tokenUsage.estimatedCost || 0
    usage.count++
  }

  // Sort models by average total tokens (descending)
  const sortedModelsByTokens = [...modelTokenUsage.entries()]
    .map(([key, usage]) => {
      const [provider, model] = key.split('_')
      return {
        provider,
        model,
        avgTotalTokens: usage.totalTokens / usage.count,
        avgInputTokens: usage.inputTokens / usage.count,
        avgOutputTokens: usage.outputTokens / usage.count,
        avgEstimatedCost: usage.estimatedCost / usage.count,
        count: usage.count,
      }
    })
    .sort((a, b) => b.avgTotalTokens - a.avgTotalTokens)

  for (const model of sortedModelsByTokens) {
    markdown += `| ${model.provider} | ${
      model.model
    } | ${model.avgTotalTokens.toFixed(0)} | ${model.avgInputTokens.toFixed(
      0
    )} | ${model.avgOutputTokens.toFixed(
      0
    )} | $${model.avgEstimatedCost.toFixed(4)} |\n`
  }

  markdown += `\n## Best Overall (Combined Accuracy & Speed)\n\n`
  markdown += `| Provider | Model | Accuracy | Processing Time (s) | Combined Score |\n`
  markdown += `|----------|-------|----------|---------------------|---------------|\n`
  for (const model of bestOverallModels.slice(0, 5)) {
    markdown += `| ${model.provider} | ${model.model} | ${(
      model.accuracy * 100
    ).toFixed(1)}% | ${model.processingTime.toFixed(2)} | ${combinedScore(
      model
    ).toFixed(2)} |\n`
  }

  markdown += `\n## Best Models by Field Emptiness\n\n`
  markdown += `| Provider | Model | Avg Emptiness | Runs |\n`
  markdown += `|----------|-------|--------------|------|\n`
  for (const model of bestEmptinessModels) {
    markdown += `| ${model.provider} | ${model.model} | ${
      model.emptinessPercentage
        ? (model.emptinessPercentage * 100).toFixed(1)
        : '-'
    }% | ${model.count} |\n`
  }

  markdown += `\n## Recommendations\n\n`

  // Best overall model
  const bestModel = bestOverallModels[0]
  markdown += `### Best Overall Model\n`
  markdown += `**${bestModel.provider} (${bestModel.model})** with ${(
    bestModel.accuracy * 100
  ).toFixed(1)}% accuracy and ${bestModel.processingTime.toFixed(
    2
  )}s average processing time.\n\n`

  // Best for accuracy
  const bestAccuracyModel = sortedModels[0]
  markdown += `### Best for Accuracy\n`
  markdown += `**${bestAccuracyModel.provider} (${
    bestAccuracyModel.model
  })** with ${(bestAccuracyModel.accuracy * 100).toFixed(1)}% accuracy.\n\n`

  // Best for speed
  const bestSpeedModel = fastestModels[0]
  markdown += `### Best for Speed\n`
  markdown += `**${bestSpeedModel.provider} (${
    bestSpeedModel.model
  })** with ${bestSpeedModel.processingTime.toFixed(
    2
  )}s average processing time.\n\n`

  // Best for emptiness percentage
  if (bestEmptinessModels.length > 0) {
    const bestEmptinessModel = bestEmptinessModels[0]
    markdown += `### Best for Field Emptiness\n`
    markdown += `**${bestEmptinessModel.provider} (${
      bestEmptinessModel.model
    })** with ${
      bestEmptinessModel.emptinessPercentage
        ? (bestEmptinessModel.emptinessPercentage * 100).toFixed(1)
        : '-'
    }% field emptiness percentage.\n\n`
  }

  // Most cost-effective model
  if (sortedModelsByTokens.length > 0) {
    const modelsByEfficiency = [...sortedModelsByTokens]
      .filter((m) => m.avgEstimatedCost > 0 && m.avgTotalTokens > 0)
      .map((m) => ({
        ...m,
        tokenCostRatio: m.avgTotalTokens / m.avgEstimatedCost,
      }))
      .sort((a, b) => b.tokenCostRatio - a.tokenCostRatio)

    if (modelsByEfficiency.length > 0) {
      const bestCostModel = modelsByEfficiency[0]
      markdown += `### Most Cost-Effective Model\n`
      markdown += `**${bestCostModel.provider} (${
        bestCostModel.model
      })** with ${bestCostModel.avgTotalTokens.toFixed(
        0
      )} tokens at $${bestCostModel.avgEstimatedCost.toFixed(
        4
      )} average cost.\n\n`
    }
  }

  markdown += `## All Runs\n\n`
  markdown += `| CV | Provider | Model | Accuracy | Emptiness | Processing Time (s) | Total Tokens | Est. Cost |\n`
  markdown += `|----|----------|-------|----------|-----------|---------------------|--------------|----------|\n`
  for (const run of report.allRuns) {
    const totalTokens = run.tokenUsage ? run.tokenUsage.totalTokens : 'N/A'
    const estCost =
      run.tokenUsage && run.tokenUsage.estimatedCost
        ? `$${run.tokenUsage.estimatedCost.toFixed(4)}`
        : 'N/A'
    const emptinessValue =
      run.emptinessPercentage !== undefined
        ? `${(run.emptinessPercentage * 100).toFixed(1)}%`
        : 'N/A'

    markdown += `| ${run.cvName} | ${run.provider} | ${run.model} | ${(
      run.accuracy * 100
    ).toFixed(1)}% | ${emptinessValue} | ${run.processingTime.toFixed(
      2
    )} | ${totalTokens} | ${estCost} |\n`
  }

  return markdown
}
