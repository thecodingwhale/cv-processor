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
  conversionTypes?: string[]
  instructionPaths?: string[]
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
    conversionType?: string
    instructionPath?: string
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
          percentage = parseFloat(percentStr) / 100
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
      {
        processingTime: number
        outputFile: string
        conversionType?: string
        instructionPath?: string
      }
    > = {}

    for (const row of executionRows) {
      const columns = row.split('|').map((col) => col.trim())
      if (columns.length < 7) continue

      const provider = columns[1]
      const model = columns[2]

      // Extract instructions path and conversion type if available
      // Format: | Provider | Model | Instructions Path | Conversion Type | Time (s) | Accuracy | Output File |
      let instructionPath = 'default'
      let conversionType = 'unknown'

      // Check if we have the new format with instruction path and conversion type
      if (columns.length >= 9) {
        instructionPath = columns[3]
        conversionType = columns[4]
      }

      // Get the time column index based on the table format
      const timeIndex = columns.length >= 9 ? 5 : 3
      const timeStr = columns[timeIndex]

      // Get the output file link column
      const outputFileLinkIndex = columns.length >= 9 ? 7 : 5
      const outputFileLink = columns[outputFileLinkIndex]

      // Try to extract token usage directly from the table if available
      let totalTokens: number | undefined = undefined
      let estimatedCost: number | undefined = undefined

      // If we have token usage column (depends on table format)
      if (columns.length >= 9) {
        // In the new format, token usage would be in column 6
        const tokenUsageStr = columns[6]
        if (tokenUsageStr !== 'N/A' && !tokenUsageStr.includes('%')) {
          totalTokens = parseInt(tokenUsageStr)
          if (isNaN(totalTokens)) totalTokens = undefined
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
        conversionType,
        instructionPath,
      }
    }

    // Process accuracy data and match with execution data
    for (const row of accuracyRows) {
      const columns = row.split('|').map((col) => col.trim())
      if (columns.length < 7) continue

      const provider = columns[1]
      const model = columns[2]

      // Parse accuracy percentage, properly handling the percent sign
      const accuracyStr = columns[3].replace('%', '')
      const accuracy = parseFloat(accuracyStr) / 100

      // Parse field accuracy, properly handling the percent sign
      let fieldAccuracy = undefined
      if (columns[4] !== '-') {
        const fieldAccuracyStr = columns[4].replace('%', '')
        fieldAccuracy = parseFloat(fieldAccuracyStr) / 100
      }

      // Parse completeness, properly handling the percent sign
      let completeness = undefined
      if (columns[5] !== '-') {
        const completenessStr = columns[5].replace('%', '')
        completeness = parseFloat(completenessStr) / 100
      }

      // Parse structure, properly handling the percent sign
      let structure = undefined
      if (columns[6] !== '-') {
        const structureStr = columns[6].replace('%', '')
        structure = parseFloat(structureStr) / 100
      }

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
        conversionType: execution.conversionType,
        instructionPath: execution.instructionPath,
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

      // Store conversion types and instruction paths in provider and model records
      if (execution.conversionType) {
        if (!report.providers[providerKey].conversionTypes) {
          report.providers[providerKey].conversionTypes = []
        }
        if (
          !report.providers[providerKey].conversionTypes.includes(
            execution.conversionType
          )
        ) {
          report.providers[providerKey].conversionTypes.push(
            execution.conversionType
          )
        }

        if (!report.models[modelKey].conversionTypes) {
          report.models[modelKey].conversionTypes = []
        }
        if (
          !report.models[modelKey].conversionTypes.includes(
            execution.conversionType
          )
        ) {
          report.models[modelKey].conversionTypes.push(execution.conversionType)
        }
      }

      if (execution.instructionPath) {
        if (!report.providers[providerKey].instructionPaths) {
          report.providers[providerKey].instructionPaths = []
        }
        if (
          !report.providers[providerKey].instructionPaths.includes(
            execution.instructionPath
          )
        ) {
          report.providers[providerKey].instructionPaths.push(
            execution.instructionPath
          )
        }

        if (!report.models[modelKey].instructionPaths) {
          report.models[modelKey].instructionPaths = []
        }
        if (
          !report.models[modelKey].instructionPaths.includes(
            execution.instructionPath
          )
        ) {
          report.models[modelKey].instructionPaths.push(
            execution.instructionPath
          )
        }
      }
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

    // Calculate average accuracy metrics if present in any runs
    if (
      report.allRuns.length > 0 &&
      report.allRuns.some((r) => r.emptinessPercentage)
    ) {
      const entriesWithEmptiness = report.allRuns.filter(
        (r) => r.emptinessPercentage !== undefined
      )
      const avgEmptiness =
        entriesWithEmptiness.reduce(
          (sum, r) => sum + (r.emptinessPercentage || 0),
          0
        ) / entriesWithEmptiness.length

      for (const run of report.allRuns) {
        if (run.emptinessPercentage !== undefined) {
          run.emptinessPercentage = avgEmptiness
        }
      }
    }
  }

  // Calculate averages
  for (const provider of Object.values(report.providers)) {
    if (provider.count > 0) {
      provider.processingTime = provider.processingTime / provider.count
      provider.accuracy = provider.accuracy / provider.count
      if (provider.fieldAccuracy !== undefined)
        provider.fieldAccuracy = provider.fieldAccuracy / provider.count
      if (provider.completeness !== undefined)
        provider.completeness = provider.completeness / provider.count
      if (provider.structure !== undefined)
        provider.structure = provider.structure / provider.count
      if (provider.emptinessPercentage !== undefined)
        provider.emptinessPercentage =
          provider.emptinessPercentage / provider.count
    }
  }

  for (const model of Object.values(report.models)) {
    if (model.count > 0) {
      model.processingTime = model.processingTime / model.count
      model.accuracy = model.accuracy / model.count
      if (model.fieldAccuracy !== undefined)
        model.fieldAccuracy = model.fieldAccuracy / model.count
      if (model.completeness !== undefined)
        model.completeness = model.completeness / model.count
      if (model.structure !== undefined)
        model.structure = model.structure / model.count
      if (model.emptinessPercentage !== undefined)
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

  // Get unique conversion types and instruction paths
  const conversionTypes = Array.from(
    new Set(
      Object.values(report.models).flatMap((m) => m.conversionTypes || [])
    )
  ).sort()

  const instructionPaths = Array.from(
    new Set(
      Object.values(report.models).flatMap((m) => m.instructionPaths || [])
    )
  ).sort()

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

  // Provider Accuracy Visualization with Mermaid
  markdown += `## Provider Accuracy Visualization\n\n`
  markdown += '```mermaid\n'
  markdown += 'pie title Provider Accuracy (%)\n'
  for (const provider of sortedProviders.slice(0, 6)) {
    // Limit to top 6 for readability
    markdown += `    "${provider.provider}" : ${Math.round(
      provider.accuracy * 100
    )}\n`
  }
  markdown += '```\n\n'

  markdown += `## Best Providers by Accuracy\n\n`
  markdown += `| Provider | Avg Accuracy | Avg Field Accuracy | Avg Emptiness | Conversion Types | Instructions | Runs |\n`
  markdown += `|----------|-------------|-------------------|--------------|----------------|-------------|------|\n`
  for (const provider of sortedProviders) {
    markdown += `| ${provider.provider} | ${(provider.accuracy * 100).toFixed(
      1
    )}% | ${
      provider.fieldAccuracy ? provider.fieldAccuracy.toFixed(1) : '-'
    }% | ${
      provider.emptinessPercentage
        ? provider.emptinessPercentage.toFixed(1)
        : '-'
    }% | ${formatConversionTypes(
      provider.conversionTypes
    )} | ${formatInstructionPaths(provider.instructionPaths)} | ${
      provider.count
    } |\n`
  }

  // Top Models Bar Chart - Fix visualization
  markdown += `\n## Top Models Accuracy Comparison\n\n`
  markdown += '```mermaid\n'
  markdown += 'pie title Top 6 Models by Accuracy (%)\n'
  for (const model of sortedModels.slice(0, 6)) {
    // Limit to top 6 models
    markdown += `    "${model.provider} (${model.model})" : ${Math.round(
      model.accuracy * 100
    )}\n`
  }
  markdown += '```\n\n'

  markdown += `\n## Best Models by Accuracy\n\n`
  markdown += `| Provider | Model | Avg Accuracy | Avg Field Accuracy | Avg Emptiness | Conversion Types | Instructions | Runs |\n`
  markdown += `|----------|-------|-------------|-------------------|--------------|----------------|-------------|------|\n`
  for (const model of sortedModels) {
    markdown += `| ${model.provider} | ${model.model} | ${(
      model.accuracy * 100
    ).toFixed(1)}% | ${
      model.fieldAccuracy !== undefined
        ? `${model.fieldAccuracy.toFixed(1)}%`
        : '-'
    } | ${
      model.emptinessPercentage !== undefined
        ? `${model.emptinessPercentage.toFixed(1)}%`
        : '-'
    } | ${formatConversionTypes(
      model.conversionTypes
    )} | ${formatInstructionPaths(model.instructionPaths)} | ${model.count} |\n`
  }

  // Processing Time Chart - Fix visualization
  markdown += `\n## Processing Time Visualization\n\n`
  markdown += '```mermaid\n'
  markdown += 'gantt\n'
  markdown += '    title Processing Time by Model (seconds)\n'
  markdown += '    dateFormat X\n'
  markdown += '    axisFormat %S s\n\n'
  // Add bar chart elements for processing time (for top 6 fastest models)
  for (const model of fastestModels.slice(0, 6)) {
    // Use a cleaner label format
    const label = `${model.provider} (${
      model.model.length > 10
        ? model.model.substring(0, 10) + '...'
        : model.model
    })`
    const safeName = label.replace(/[^a-zA-Z0-9]/g, '_')
    markdown += `    ${safeName} :a, 0, ${model.processingTime.toFixed(2)}s\n`
  }
  markdown += '```\n\n'

  markdown += `\n## Fastest Providers\n\n`
  markdown += `| Provider | Avg Processing Time (s) | Conversion Types | Instructions | Runs |\n`
  markdown += `|----------|--------------------------|----------------|-------------|------|\n`
  for (const provider of fastestProviders) {
    markdown += `| ${provider.provider} | ${provider.processingTime.toFixed(
      2
    )} | ${formatConversionTypes(
      provider.conversionTypes
    )} | ${formatInstructionPaths(provider.instructionPaths)} | ${
      provider.count
    } |\n`
  }

  markdown += `\n## Fastest Models\n\n`
  markdown += `| Provider | Model | Avg Processing Time (s) | Conversion Types | Instructions | Runs |\n`
  markdown += `|----------|-------|--------------------------|----------------|-------------|------|\n`
  for (const model of fastestModels) {
    markdown += `| ${model.provider} | ${
      model.model
    } | ${model.processingTime.toFixed(2)} | ${formatConversionTypes(
      model.conversionTypes
    )} | ${formatInstructionPaths(model.instructionPaths)} | ${model.count} |\n`
  }

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

  // Token Usage Pie Chart - Fix visualization
  if (sortedModelsByTokens.length > 0) {
    markdown += `\n## Token Usage Visualization\n\n`
    markdown += '```mermaid\n'
    markdown += 'pie title Average Token Usage by Provider\n'
    // Group token usage by provider and limit to top 5 providers for readability
    const providerTokens: Record<string, number> = {}
    for (const usage of sortedModelsByTokens) {
      const provider = usage.provider
      if (!providerTokens[provider]) {
        providerTokens[provider] = 0
      }
      providerTokens[provider] += usage.avgTotalTokens
    }

    // Sort providers by token usage and take top 5
    const topProviders = Object.entries(providerTokens)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    // Add pie chart segments for top 5 providers
    for (const [provider, tokens] of topProviders) {
      markdown += `    "${provider}" : ${Math.round(tokens)}\n`
    }
    markdown += '```\n\n'
  }

  markdown += `\n## Token Usage Comparison by Model\n\n`
  markdown += `| Provider | Model | Avg Total Tokens | Avg Input Tokens | Avg Output Tokens | Avg Est. Cost | Conversion Types | Instructions |\n`
  markdown += `|----------|-------|-----------------|-----------------|------------------|-------------|-----------------|--------------|\n`

  for (const model of sortedModelsByTokens) {
    const modelKey = `${model.provider}_${model.model}`
    const modelObj = report.models[modelKey]

    markdown += `| ${model.provider} | ${
      model.model
    } | ${model.avgTotalTokens.toFixed(0)} | ${model.avgInputTokens.toFixed(
      0
    )} | ${model.avgOutputTokens.toFixed(
      0
    )} | $${model.avgEstimatedCost.toFixed(4)} | ${
      modelObj ? formatConversionTypes(modelObj.conversionTypes) : 'unknown'
    } | ${
      modelObj
        ? formatInstructionPaths(modelObj.instructionPaths)
        : './instructions.txt'
    } |\n`
  }

  // Accuracy vs Speed Visualization - Fix visualization
  markdown += `\n## Accuracy vs Speed Visualization\n\n`
  markdown += '```mermaid\n'
  markdown += 'graph TD\n'
  markdown += '    title["Accuracy vs. Processing Time"];\n'
  markdown += '    style title fill:#fff,stroke:#fff,stroke-width:0px;\n\n'

  // Create nodes for top models
  for (let i = 0; i < Math.min(8, Object.values(report.models).length); i++) {
    const model = sortedModels[i] // Use top models by accuracy

    // Calculate node position based on processing time and accuracy
    const accuracy = Math.round(model.accuracy * 100)
    const time = model.processingTime.toFixed(1)

    // Create node with formatted label
    markdown += `    m${i}["${model.provider}<br/>${accuracy}% accuracy<br/>${time}s"];\n`
    markdown += `    class m${i} model${i};\n`
  }

  // Add styling for nodes - each with a different color
  markdown += '    classDef model0 fill:#4CAF50,stroke:#333,stroke-width:1px;\n'
  markdown += '    classDef model1 fill:#2196F3,stroke:#333,stroke-width:1px;\n'
  markdown += '    classDef model2 fill:#FFC107,stroke:#333,stroke-width:1px;\n'
  markdown += '    classDef model3 fill:#F44336,stroke:#333,stroke-width:1px;\n'
  markdown += '    classDef model4 fill:#9C27B0,stroke:#333,stroke-width:1px;\n'
  markdown += '    classDef model5 fill:#00BCD4,stroke:#333,stroke-width:1px;\n'
  markdown += '    classDef model6 fill:#FF9800,stroke:#333,stroke-width:1px;\n'
  markdown += '    classDef model7 fill:#607D8B,stroke:#333,stroke-width:1px;\n'
  markdown += '```\n\n'

  markdown += `\n## Best Overall (Combined Accuracy & Speed)\n\n`
  markdown += `| Provider | Model | Accuracy | Processing Time (s) | Combined Score | Conversion Types | Instructions |\n`
  markdown += `|----------|-------|----------|---------------------|---------------|----------------|-------------|\n`
  for (const model of bestOverallModels.slice(0, 5)) {
    markdown += `| ${model.provider} | ${model.model} | ${(
      model.accuracy * 100
    ).toFixed(1)}% | ${model.processingTime.toFixed(2)} | ${combinedScore(
      model
    ).toFixed(2)} | ${formatConversionTypes(
      model.conversionTypes
    )} | ${formatInstructionPaths(model.instructionPaths)} |\n`
  }

  // Top Models Performance Comparison - Fix visualization
  markdown += `\n## Top Models Performance Comparison\n\n`
  markdown += '```mermaid\n'
  markdown += 'graph TD\n'
  markdown += '    title["Top Model Performance"];\n'
  markdown += '    style title fill:#fff,stroke:#fff,stroke-width:0px;\n\n'

  // Create a cleaner visualization with the top 3 models
  for (let i = 0; i < Math.min(3, bestOverallModels.length); i++) {
    const model = bestOverallModels[i]
    const convType =
      model.conversionTypes && model.conversionTypes.length > 0
        ? formatConversionType(model.conversionTypes[0])
        : 'unknown'

    markdown += `    m${i}["#${i + 1}: ${model.provider} (${model.model})<br/>`
    markdown += `🎯 Accuracy: ${(model.accuracy * 100).toFixed(1)}%<br/>`
    markdown += `⏱️ Speed: ${model.processingTime.toFixed(2)}s<br/>`
    markdown += `🔄 Conversion: ${convType}<br/>`
    markdown += `📊 Score: ${combinedScore(model).toFixed(2)}"];\n`
    markdown += `    class m${i} model${i};\n`
  }

  markdown += '    classDef model0 fill:#4CAF50,stroke:#333,stroke-width:1px;\n'
  markdown += '    classDef model1 fill:#2196F3,stroke:#333,stroke-width:1px;\n'
  markdown += '    classDef model2 fill:#FFC107,stroke:#333,stroke-width:1px;\n'
  markdown += '```\n\n'

  markdown += `\n## Best Models by Field Emptiness\n\n`
  markdown += `| Provider | Model | Avg Emptiness | Conversion Types | Instructions | Runs |\n`
  markdown += `|----------|-------|--------------|----------------|-------------|------|\n`
  for (const model of bestEmptinessModels) {
    markdown += `| ${model.provider} | ${model.model} | ${
      model.emptinessPercentage ? model.emptinessPercentage.toFixed(1) : '-'
    }% | ${formatConversionTypes(
      model.conversionTypes
    )} | ${formatInstructionPaths(model.instructionPaths)} | ${model.count} |\n`
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
        ? bestEmptinessModel.emptinessPercentage.toFixed(1)
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
  markdown += `| CV | Provider | Model | Accuracy | Field Accuracy | Emptiness | Processing Time (s) | Conversion Type | Instructions | Total Tokens | Est. Cost |\n`
  markdown += `|----|----------|-------|----------|---------------|-----------|---------------------|----------------|-------------|--------------|----------|\n`
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
    const fieldAccuracyValue =
      run.fieldAccuracy !== undefined
        ? `${(run.fieldAccuracy * 100).toFixed(1)}%`
        : 'N/A'

    markdown += `| ${run.cvName} | ${run.provider} | ${run.model} | ${(
      run.accuracy * 100
    ).toFixed(
      1
    )}% | ${fieldAccuracyValue} | ${emptinessValue} | ${run.processingTime.toFixed(
      2
    )} | ${formatConversionType(run.conversionType)} | ${formatInstructionPath(
      run.instructionPath
    )} | ${totalTokens} | ${estCost} |\n`
  }

  return markdown
}

// Format conversion type
function formatConversionType(type?: string): string {
  if (!type) return 'unknown'

  // Handle percentage values by converting them to the appropriate type
  if (type.endsWith('%')) {
    const percentValue = parseInt(type)
    // Based on convention in the system:
    // 30% typically means pdftotexts
    // 24% typically means pdftoimages
    if (percentValue === 30) return 'pdftotexts'
    if (percentValue === 24 || percentValue === 18 || percentValue === 0)
      return 'pdftoimages'
    if (percentValue === 100) return 'pdftotexts'
    return type // Return the original if no mapping
  }

  // Convert PdfToTexts -> pdftotexts and PdfToImages -> pdftoimages
  if (type.toLowerCase().includes('text')) return 'pdftotexts'
  if (type.toLowerCase().includes('image')) return 'pdftoimages'
  return type.toLowerCase()
}

// Format instruction path
function formatInstructionPath(path?: string): string {
  if (!path) return './instructions.txt'

  // Handle numeric instruction paths and convert them to the appropriate filename
  if (!isNaN(parseFloat(path))) {
    // Map numeric values to instruction files
    // (Add more mappings as needed)
    if (parseFloat(path) > 10) return './instructions_version_1.txt'
    return './instructions.txt'
  }

  // Extract the filename only, keeping the ./ prefix
  const filename = path.split('/').pop() || 'instructions.txt'
  return `./${filename}`
}

// Format arrays of conversion types
function formatConversionTypes(types?: string[]): string {
  if (!types || types.length === 0) return 'unknown'
  return types.map((t) => formatConversionType(t)).join(', ')
}

// Format arrays of instruction paths
function formatInstructionPaths(paths?: string[]): string {
  if (!paths || paths.length === 0) return './instructions.txt'
  return paths.map((p) => formatInstructionPath(p)).join(', ')
}
