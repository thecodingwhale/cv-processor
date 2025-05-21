import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Renders Mermaid charts from a markdown report to static PNG images
 * Requires @mermaid-js/mermaid-cli to be installed
 */
export async function renderChartsFromReport(
  reportPath: string,
  outputDir: string
): Promise<string[]> {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Read the markdown report
  const markdown = fs.readFileSync(reportPath, 'utf-8')

  // Extract all Mermaid diagram blocks
  const diagramRegex = /```mermaid\n([\s\S]*?)```/g
  const diagrams: { content: string; index: number }[] = []

  let match
  while ((match = diagramRegex.exec(markdown)) !== null) {
    diagrams.push({
      content: match[1],
      index: diagrams.length,
    })
  }

  console.log(`Found ${diagrams.length} Mermaid diagrams in the report`)

  if (diagrams.length === 0) {
    return []
  }

  // Create temporary files for each diagram and render them
  const renderedImages: string[] = []

  for (const diagram of diagrams) {
    const tempFilePath = path.join(
      outputDir,
      `temp_diagram_${diagram.index}.mmd`
    )
    const outputPath = path.join(outputDir, `chart_${diagram.index}.png`)

    // Write diagram to temp file
    fs.writeFileSync(tempFilePath, diagram.content)

    try {
      // Render the diagram using Mermaid CLI
      await execAsync(
        `npx mmdc -i ${tempFilePath} -o ${outputPath} -b transparent -w 800`
      )

      console.log(`Rendered diagram ${diagram.index} to ${outputPath}`)
      renderedImages.push(outputPath)
    } catch (error) {
      console.error(`Error rendering diagram ${diagram.index}:`, error)
    }

    // Clean up temp file
    fs.unlinkSync(tempFilePath)
  }

  return renderedImages
}

/**
 * Creates an HTML version of the report with embedded charts
 */
export async function createHtmlReport(
  markdownPath: string,
  chartOutputDir: string
): Promise<string> {
  // First render the charts
  const chartPaths = await renderChartsFromReport(markdownPath, chartOutputDir)

  // Read the markdown report
  const markdown = fs.readFileSync(markdownPath, 'utf-8')

  // Create HTML template
  const htmlPath = markdownPath.replace('.md', '.html')

  // Parse the markdown to extract sections
  const sections: {
    title: string
    level: number
    content: string
    chartIndex?: number
  }[] = []

  // Extract all section headings
  const lines = markdown.split('\n')
  let currentSection: {
    title: string
    level: number
    content: string
    chartIndex?: number
  } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check for headings
    const h1Match = line.match(/^# (.+)$/)
    const h2Match = line.match(/^## (.+)$/)
    const h3Match = line.match(/^### (.+)$/)

    if (h1Match || h2Match || h3Match) {
      // Save previous section if exists
      if (currentSection) {
        sections.push(currentSection)
      }

      // Start new section
      const title = h1Match ? h1Match[1] : h2Match ? h2Match[1] : h3Match![1]
      const level = h1Match ? 1 : h2Match ? 2 : 3

      currentSection = {
        title,
        level,
        content: line + '\n',
      }
    } else if (currentSection) {
      // Add line to current section
      currentSection.content += line + '\n'

      // Check if this section contains a mermaid chart
      if (line.includes('```mermaid')) {
        const chartIndexMatch = currentSection.content.match(
          /```mermaid[\s\S]*?```/g
        )
        if (chartIndexMatch) {
          const chartCount = chartIndexMatch.length
          const sectionChartIndex = sections.filter(
            (s) => s.chartIndex !== undefined
          ).length
          currentSection.chartIndex = sectionChartIndex
        }
      }
    }
  }

  // Add the last section
  if (currentSection) {
    sections.push(currentSection)
  }

  // Replace Mermaid code blocks with image references
  let chartIndex = 0

  // Process content for each section
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].chartIndex !== undefined) {
      // This section has a chart
      if (chartIndex < chartPaths.length) {
        const imgPath = chartPaths[chartIndex]
        const imgTag = `<img src="${path.relative(
          path.dirname(htmlPath),
          imgPath
        )}" alt="Chart ${chartIndex}" class="chart-image" />`

        // Replace the mermaid code block with the image
        sections[i].content = sections[i].content.replace(
          /```mermaid[\s\S]*?```/,
          imgTag
        )
        chartIndex++
      }
    }

    // Convert tables to HTML tables
    sections[i].content = convertMarkdownTablesToHTML(sections[i].content)
  }

  // Create HTML with improved styling for presentation
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CV Processing Report</title>
  <style>
    :root {
      --primary-color: #2c3e50;
      --secondary-color: #3498db;
      --accent-color: #e74c3c;
      --background-color: #f8f9fa;
      --card-background: #ffffff;
      --text-color: #333333;
      --border-color: #e0e0e0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: var(--text-color);
      background-color: var(--background-color);
      margin: 0;
      padding: 0;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      background-color: var(--primary-color);
      color: white;
      padding: 20px 0;
      margin-bottom: 30px;
      text-align: center;
    }
    
    h1 {
      margin: 0;
      padding: 0;
      font-size: 2.5rem;
    }
    
    h2 {
      color: var(--primary-color);
      border-bottom: 2px solid var(--secondary-color);
      padding-bottom: 10px;
      margin-top: 40px;
    }
    
    h3 {
      color: var(--primary-color);
      margin-top: 30px;
    }
    
    .section {
      background-color: var(--card-background);
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      margin-bottom: 30px;
      padding: 20px;
      overflow: hidden;
    }
    
    .section-header {
      margin-top: 0;
      color: var(--primary-color);
    }
    
    .flex-container {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      margin: 20px 0;
    }
    
    .chart-container {
      flex: 1;
      min-width: 300px;
      text-align: center;
    }
    
    .table-container {
      flex: 1;
      min-width: 300px;
      overflow-x: auto;
    }
    
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 20px 0;
    }
    
    th, td {
      border: 1px solid var(--border-color);
      padding: 12px 15px;
      text-align: left;
    }
    
    th {
      background-color: var(--secondary-color);
      color: white;
      font-weight: 600;
    }
    
    tr:nth-child(even) {
      background-color: rgba(0,0,0,0.02);
    }
    
    tr:hover {
      background-color: rgba(0,0,0,0.05);
    }
    
    .chart-image {
      max-width: 100%;
      height: auto;
      border-radius: 5px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    
    code {
      background-color: #f5f5f5;
      padding: 2px 4px;
      border-radius: 3px;
    }
    
    .meta-info {
      display: flex;
      justify-content: space-around;
      background-color: var(--card-background);
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    }
    
    .meta-item {
      text-align: center;
    }
    
    .meta-item strong {
      display: block;
      font-size: 1.2rem;
      color: var(--secondary-color);
    }
    
    .recommendations {
      background-color: #f8f5e6;
      border-left: 4px solid #f1c40f;
      padding: 15px;
      margin: 20px 0;
    }
    
    .recommendation-item {
      margin-bottom: 15px;
    }
    
    @media (max-width: 768px) {
      .flex-container {
        flex-direction: column;
      }
      
      .chart-container, .table-container {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>CV Processing Report</h1>
    </div>
  </header>
  
  <div class="container">
    ${generateHTMLContent(sections)}
  </div>
</body>
</html>`

  // Write HTML file
  fs.writeFileSync(htmlPath, html)
  console.log(`Created HTML report at ${htmlPath}`)

  return htmlPath
}

/**
 * Generates structured HTML content from markdown sections
 */
function generateHTMLContent(
  sections: {
    title: string
    level: number
    content: string
    chartIndex?: number
  }[]
): string {
  let html = ''

  // Find and process summary section
  const summarySection = sections.find(
    (s) => s.title === 'Merged CV Processing Report'
  )
  if (summarySection) {
    // Extract metadata like date, samples, runs
    const dateMatch = summarySection.content.match(/\*\*Date\*\*: (.*)/)
    const samplesMatch = summarySection.content.match(
      /\*\*Total CV Samples\*\*: (.*)/
    )
    const runsMatch = summarySection.content.match(
      /\*\*Total Runs Analyzed\*\*: (.*)/
    )

    html += '<div class="meta-info">'
    if (dateMatch) {
      html += `<div class="meta-item"><span>Date</span><strong>${dateMatch[1]}</strong></div>`
    }
    if (samplesMatch) {
      html += `<div class="meta-item"><span>Total CV Samples</span><strong>${samplesMatch[1]}</strong></div>`
    }
    if (runsMatch) {
      html += `<div class="meta-item"><span>Total Runs Analyzed</span><strong>${runsMatch[1]}</strong></div>`
    }
    html += '</div>'
  }

  // Process each section
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]

    // Skip the already processed summary section
    if (section.title === 'Merged CV Processing Report') continue

    // Skip "All Runs" section as it's usually too large
    if (section.title === 'All Runs') continue

    // Create section
    html += `<div class="section">`
    html += `<h${section.level} class="section-header">${section.title}</h${section.level}>`

    // Special handling for sections with charts
    if (section.chartIndex !== undefined) {
      // Extract table from content
      const tableMatch = section.content.match(/<table>[\s\S]*?<\/table>/)

      if (tableMatch) {
        html += `<div class="flex-container">`
        html += `<div class="chart-container">`
        // Find and extract the img tag
        const imgMatch = section.content.match(/<img[^>]+>/)
        if (imgMatch) {
          html += imgMatch[0]
        }
        html += `</div>`

        html += `<div class="table-container">`
        html += tableMatch[0]
        html += `</div>`
        html += `</div>`

        // Remove the table and img from content to avoid duplication
        let remainingContent = section.content
          .replace(/<img[^>]+>/, '')
          .replace(/<table>[\s\S]*?<\/table>/, '')

        // Add any remaining content
        if (remainingContent.trim()) {
          html += remainingContent
        }
      } else {
        // Just add the content with the chart
        html += section.content
      }
    } else if (section.title === 'Recommendations') {
      // Special handling for recommendations section
      html += `<div class="recommendations">`

      // Extract recommendation items
      const recommendations = section.content.split(/###\s+/)
      for (let j = 1; j < recommendations.length; j++) {
        const recContent = recommendations[j]
        const recTitle = recContent.split('\n')[0]
        const recDetails = recContent.replace(recTitle, '').trim()

        html += `<div class="recommendation-item">`
        html += `<h4>${recTitle}</h4>`
        html += `<p>${recDetails}</p>`
        html += `</div>`
      }

      html += `</div>`
    } else {
      // Regular section, just add the content
      html += section.content
    }

    html += `</div>`
  }

  return html
}

/**
 * Converts markdown tables to HTML tables
 */
function convertMarkdownTablesToHTML(content: string): string {
  let html = content

  // Find all markdown tables
  const tableRegex = /\|.*\|\n\|[-:| ]+\|\n(?:\|.*\|\n)+/g
  const tables = content.match(tableRegex)

  if (tables) {
    for (const table of tables) {
      const rows = table.trim().split('\n')

      // Start HTML table
      let htmlTable = '<table>\n<thead>\n<tr>\n'

      // Process header
      const headerCells = rows[0]
        .split('|')
        .filter((cell) => cell.trim() !== '')
      for (const cell of headerCells) {
        htmlTable += `<th>${cell.trim()}</th>\n`
      }

      htmlTable += '</tr>\n</thead>\n<tbody>\n'

      // Skip header and separator rows, process data rows
      for (let i = 2; i < rows.length; i++) {
        htmlTable += '<tr>\n'
        const cells = rows[i].split('|').filter((cell) => cell.trim() !== '')
        for (const cell of cells) {
          htmlTable += `<td>${cell.trim()}</td>\n`
        }
        htmlTable += '</tr>\n'
      }

      htmlTable += '</tbody>\n</table>'

      // Replace the markdown table with the HTML table
      html = html.replace(table, htmlTable)
    }
  }

  return html
}
