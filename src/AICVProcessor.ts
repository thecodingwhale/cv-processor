import * as cheerio from 'cheerio'
import * as fs from 'fs'
import * as path from 'path'
import { Browser, chromium, Page } from 'playwright'
import { CVData, ProcessorOptions } from './types'
import { AIProvider, ConversionType } from './types/AIProvider'
import { ConsensusAccuracyScorer } from './utils/ConsensusAccuracyScorer'
import { convertPdfToImages, convertPdfToTexts } from './utils/document'
import { EmptinessPercentageCalculator } from './utils/EmptinessPercentageCalculator'
import { ReportGenerator } from './utils/reportGenerator'

/**
 * AI-powered CV Processor class to extract structured data from PDF resumes
 */
export class AICVProcessor {
  private aiProvider: AIProvider
  private verbose: boolean
  private instructionsPath: string
  private expectedTotalFields?: number
  private categories?: object[]

  // private industryContext: string // Store industry context for patterns

  /**
   * Initialize the AI CV processor
   */
  constructor(aiProvider: AIProvider, options: ProcessorOptions = {}) {
    this.aiProvider = aiProvider
    this.verbose = options.verbose || false
    this.instructionsPath =
      options.instructionsPath || path.join(process.cwd(), 'instructions.txt')
    this.expectedTotalFields = options.expectedTotalFields
    this.categories = options.categories || []

    if (this.verbose) {
      console.log('AI CV Processor initialized')
      console.log(`Using instructions from: ${this.instructionsPath}`)
      if (this.expectedTotalFields) {
        console.log(`Expected total fields: ${this.expectedTotalFields}`)
      }
    }
  }

  /**
   * Validate if a string is a proper URL
   */
  private isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url)
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
    } catch {
      return false
    }
  }

  /**
   * Load instructions from the specified file
   * Falls back to default instructions if file cannot be read
   */
  private async loadInstructions(): Promise<string | null> {
    try {
      // Check if instructions file exists
      if (fs.existsSync(this.instructionsPath)) {
        const instructions = await fs.promises.readFile(
          this.instructionsPath,
          'utf8'
        )
        if (this.verbose) {
          console.log(
            `Successfully loaded instructions from ${this.instructionsPath}`
          )
        }
        return instructions
      } else {
        console.warn(`Instructions file not found: ${this.instructionsPath}`)
        return null
      }
    } catch (error) {
      console.error(`Error loading instructions file: ${error}`)
      return null
    }
  }

  /**
   * Estimate token count based on text content
   * This is a fallback when actual token counts aren't available
   */
  private estimateTokenCount(text: string): number {
    // Simple estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4)
  }

  /**
   * Process a URL and extract structured CV information using AI
   */
  async processUrlToTexts(url: string): Promise<CVData> {
    console.log(`Processing CV from URL: ${url}`)

    // Track start time for processing
    const startTime = new Date().getTime()

    try {
      // Validate URL
      if (!this.isValidUrl(url)) {
        throw new Error(`Invalid URL provided: ${url}`)
      }

      if (this.verbose) {
        console.log(`Fetching content from URL: ${url}`)
      }

      // Use Playwright to fetch content with 5-second wait for dynamic content
      const html = await this.fetchUrlWithPlaywright(url)

      if (this.verbose) {
        console.log(`Fetched ${html.length} characters of HTML content`)
      }

      // Parse HTML and extract text using Cheerio
      const $ = cheerio.load(html)

      if (this.verbose) {
        console.log(`HTML snippet: ${html.substring(0, 1000)}...`)
      }

      // Remove script, style, and other non-content elements
      $(
        'script, style, noscript, iframe, nav, header, footer, aside, form'
      ).remove()

      // First, try to get all text content
      let allText = $('body').text().trim()

      if (this.verbose) {
        console.log(
          `All body text (first 500 chars): ${allText.substring(0, 500)}...`
        )
      }

      // Extract text from relevant elements
      const textElements = [
        'p',
        'div',
        'span',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'li',
        'td',
        'th',
        'article',
        'section',
        'main',
        'content',
      ]

      let extractedText = ''
      textElements.forEach((selector) => {
        $(selector).each((_, element) => {
          const text = $(element).text().trim()
          if (text && text.length > 10) {
            extractedText += text + '\n'
          }
        })
      })

      // If specific element extraction fails, use all body text
      if (!extractedText || extractedText.length < 100) {
        extractedText = allText
        if (this.verbose) {
          console.log(
            'Using all body text as specific element extraction yielded insufficient content'
          )
        }
      }

      // Clean up the extracted text
      const cleanedText = extractedText
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/\n\s*\n/g, '\n') // Remove empty lines
        .trim()

      if (this.verbose) {
        console.log(`Extracted ${cleanedText.length} characters of clean text`)
        console.log(
          `Clean text preview (first 500 chars): ${cleanedText.substring(
            0,
            500
          )}...`
        )
      }

      if (!cleanedText || cleanedText.length < 20) {
        throw new Error('Insufficient text content extracted from URL')
      }

      // Define the data schema to match our CVData type
      const dataSchema = {
        type: 'object',
        properties: {
          credits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                projectTitle: { type: 'string' },
                type: { type: 'string' }, // e.g., 'Film', 'TV', 'Commercial', 'Theatre'
                role: { type: 'string' },
                productionCompany: { type: 'string' },
                director: { type: 'string' },
                year: { type: 'string' },
                location: { type: 'string' },
                link: { type: 'string' }, // optional trailer or scene
              },
            },
          },
        },
      }

      // Load instructions from file
      const instructions = await this.loadInstructions()
      if (!instructions) {
        throw new Error('No instructions found')
      }

      // Use AI to extract structured data from the cleaned text
      const cvData =
        await this.aiProvider.extractStructuredDataFromText<CVData>(
          [cleanedText],
          dataSchema,
          instructions,
          this.categories
        )

      // Calculate processing time
      const processingTime = (new Date().getTime() - startTime) / 1000
      console.log(
        `[AICVProcessor] URL processing completed in ${processingTime.toFixed(
          2
        )} seconds`
      )

      // Add metadata
      cvData.metadata = {
        processedDate: new Date().toISOString(),
        sourceFile: url,
        processingTime: processingTime,
        conversionType: ConversionType.UrlToTexts,
        ...this.aiProvider.getModelInfo(),
      }

      // Add token usage information if available from AI provider
      if (cvData.tokenUsage) {
        cvData.metadata.tokenUsage = {
          inputTokens: cvData.tokenUsage.promptTokens,
          outputTokens: cvData.tokenUsage.completionTokens,
          totalTokens: cvData.tokenUsage.totalTokens,
          estimatedCost: cvData.tokenUsage.estimatedCost,
        }

        if (this.verbose) {
          console.log(
            `[AICVProcessor] Token usage:`,
            cvData.metadata.tokenUsage
          )
        }
      } else {
        // Estimate tokens if not provided by the AI provider
        const estimatedInputTokens = this.estimateTokenCount(
          instructions + cleanedText
        )
        const estimatedOutputTokens = this.estimateTokenCount(
          JSON.stringify(cvData)
        )

        cvData.metadata.tokenUsage = {
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          totalTokens: estimatedInputTokens + estimatedOutputTokens,
        }

        if (this.verbose) {
          console.log(
            `[AICVProcessor] Estimated token usage:`,
            cvData.metadata.tokenUsage
          )
        }
      }

      // Try to use consensus-based scoring if available
      const consensusScorer = new ConsensusAccuracyScorer()
      const consensusResult = consensusScorer.evaluateAccuracy(cvData)

      console.log(`[AICVProcessor] Accuracy score: ${consensusResult.overall}%`)

      if (this.verbose) {
        console.log(
          `[AICVProcessor] Using consensus-based accuracy from: ${consensusResult.metadata.consensusSource}`
        )
        console.log(
          `[AICVProcessor] Field accuracy: ${consensusResult.fieldAccuracy}%`
        )
        console.log(
          `[AICVProcessor] Completeness: ${consensusResult.completeness}%`
        )
        console.log(
          `[AICVProcessor] Structural fidelity: ${consensusResult.structuralFidelity}%`
        )
      }

      // Use consensus-based accuracy metrics
      cvData.metadata.accuracy = {
        overall: consensusResult.overall,
        fieldAccuracy: consensusResult.fieldAccuracy,
        completeness: consensusResult.completeness,
        structuralFidelity: consensusResult.structuralFidelity,
        missingFields: consensusResult.missingFields,
        consensusSource: consensusResult.metadata.consensusSource,
      }

      // Calculate emptiness percentage
      const emptinessResult =
        EmptinessPercentageCalculator.calculateEmptinessPercentage(
          cvData,
          this.expectedTotalFields
        )
      cvData.metadata.emptinessPercentage = emptinessResult

      // Add standard log message for emptiness percentage score (not conditional on verbose)
      console.log(
        `[AICVProcessor] Emptiness Percentage score: ${emptinessResult.percentage}%`
      )

      if (this.verbose) {
        console.log(
          `[AICVProcessor] Emptiness percentage: ${emptinessResult.percentage}%`
        )
        console.log(
          `[AICVProcessor] Total fields: ${emptinessResult.totalFields}, Non-empty fields: ${emptinessResult.nonEmptyFields}`
        )
        if (emptinessResult.expectedTotalFields) {
          console.log(
            `[AICVProcessor] Expected emptiness percentage: ${emptinessResult.expectedPercentage}% (based on ${emptinessResult.expectedTotalFields} expected fields)`
          )
        }
      }

      return cvData
    } catch (error) {
      console.error(
        `Error processing URL: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      throw error
    }
  }

  /**
   * Fetch URL content using Playwright with 5-second wait for dynamic content
   */
  private async fetchUrlWithPlaywright(url: string): Promise<string> {
    let browser: Browser | null = null
    let page: Page | null = null

    try {
      if (this.verbose) {
        console.log('Launching Playwright browser...')
      }

      // Launch browser
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })

      page = await browser.newPage()

      // Set user agent to mimic a real browser using the context method
      await page.setExtraHTTPHeaders({
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      })

      if (this.verbose) {
        console.log('Navigating to URL...')
      }

      // Navigate to the page
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      })

      if (this.verbose) {
        console.log('Page loaded, waiting 5 seconds for dynamic content...')
      }

      // Wait 5 seconds for dynamic content to load (your requested timeout)
      await page.waitForTimeout(5000)

      // Try to wait for some content to appear
      try {
        await page.waitForSelector('body', { timeout: 5000 })
        if (this.verbose) {
          console.log('Content detected on page')
        }
      } catch (selectorError) {
        if (this.verbose) {
          console.log('Proceeding with current content...')
        }
      }

      // Get the page content
      const html = await page.content()

      if (this.verbose) {
        console.log(
          `Successfully fetched ${html.length} characters using Playwright`
        )
      }

      return html
    } catch (error) {
      throw new Error(
        `Playwright failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    } finally {
      if (page) {
        await page.close()
      }
      if (browser) {
        await browser.close()
      }
    }
  }

  /**
   * Process a CV PDF and extract structured information using AI
   */
  async processCv(
    pdfPath: string,
    conversionType: ConversionType = ConversionType.PdfToImages
  ): Promise<CVData> {
    // Check if input is a URL and conversionType is UrlToTexts
    if (conversionType === ConversionType.UrlToTexts) {
      return this.processUrlToTexts(pdfPath)
    }

    console.log(`Processing CV with AI: ${pdfPath} (${conversionType})`)

    // Track start time for processing
    const startTime = new Date().getTime()

    try {
      // Define the data schema to match our CVData type
      const dataSchema = {
        type: 'object',
        properties: {
          credits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                projectTitle: { type: 'string' },
                type: { type: 'string' }, // e.g., 'Film', 'TV', 'Commercial', 'Theatre'
                role: { type: 'string' },
                productionCompany: { type: 'string' },
                director: { type: 'string' },
                year: { type: 'string' },
                location: { type: 'string' },
                link: { type: 'string' }, // optional trailer or scene
              },
            },
          },
        },
      }

      // Load instructions from file
      const instructions = await this.loadInstructions()
      if (!instructions) {
        throw new Error('No instructions found')
      }

      let cvData: CVData
      let inputData: string[]

      if (conversionType === ConversionType.PdfToImages) {
        // Convert PDF to images
        inputData = await convertPdfToImages(pdfPath)

        // Use AI to extract structured data from images
        cvData = await this.aiProvider.extractStructuredDataFromImages<CVData>(
          inputData,
          dataSchema,
          instructions
        )
      } else {
        // Convert PDF to text
        inputData = await convertPdfToTexts(pdfPath)

        // Use AI to extract structured data from text
        cvData = await this.aiProvider.extractStructuredDataFromText<CVData>(
          inputData,
          dataSchema,
          instructions,
          this.categories
        )
      }

      // Calculate processing time
      const processingTime = (new Date().getTime() - startTime) / 1000
      console.log(
        `[AICVProcessor] Processing completed in ${processingTime.toFixed(
          2
        )} seconds`
      )

      // Add metadata before accuracy evaluation
      cvData.metadata = {
        processedDate: new Date().toISOString(),
        sourceFile: path.basename(pdfPath),
        processingTime: processingTime,
        conversionType: conversionType,
        ...this.aiProvider.getModelInfo(),
      }

      // Add token usage information if available from AI provider
      if (cvData.tokenUsage) {
        cvData.metadata.tokenUsage = {
          inputTokens: cvData.tokenUsage.promptTokens,
          outputTokens: cvData.tokenUsage.completionTokens,
          totalTokens: cvData.tokenUsage.totalTokens,
          estimatedCost: cvData.tokenUsage.estimatedCost,
        }

        if (this.verbose) {
          console.log(
            `[AICVProcessor] Token usage:`,
            cvData.metadata.tokenUsage
          )
        }
      } else {
        // Estimate tokens if not provided by the AI provider
        const estimatedInputTokens = this.estimateTokenCount(
          instructions + JSON.stringify(inputData)
        )
        const estimatedOutputTokens = this.estimateTokenCount(
          JSON.stringify(cvData)
        )

        cvData.metadata.tokenUsage = {
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          totalTokens: estimatedInputTokens + estimatedOutputTokens,
        }

        if (this.verbose) {
          console.log(
            `[AICVProcessor] Estimated token usage:`,
            cvData.metadata.tokenUsage
          )
        }
      }

      // Try to use consensus-based scoring if available
      const consensusScorer = new ConsensusAccuracyScorer()
      const consensusResult = consensusScorer.evaluateAccuracy(cvData)

      console.log(`[AICVProcessor] Accuracy score: ${consensusResult.overall}%`)

      if (this.verbose) {
        console.log(
          `[AICVProcessor] Using consensus-based accuracy from: ${consensusResult.metadata.consensusSource}`
        )
        console.log(
          `[AICVProcessor] Field accuracy: ${consensusResult.fieldAccuracy}%`
        )
        console.log(
          `[AICVProcessor] Completeness: ${consensusResult.completeness}%`
        )
        console.log(
          `[AICVProcessor] Structural fidelity: ${consensusResult.structuralFidelity}%`
        )
      }

      // Use consensus-based accuracy metrics
      cvData.metadata.accuracy = {
        overall: consensusResult.overall,
        fieldAccuracy: consensusResult.fieldAccuracy,
        completeness: consensusResult.completeness,
        structuralFidelity: consensusResult.structuralFidelity,
        missingFields: consensusResult.missingFields,
        consensusSource: consensusResult.metadata.consensusSource,
      }

      // Calculate emptiness percentage
      const emptinessResult =
        EmptinessPercentageCalculator.calculateEmptinessPercentage(
          cvData,
          this.expectedTotalFields
        )
      cvData.metadata.emptinessPercentage = emptinessResult

      // Add standard log message for emptiness percentage score (not conditional on verbose)
      console.log(
        `[AICVProcessor] Emptiness Percentage score: ${emptinessResult.percentage}%`
      )

      if (this.verbose) {
        console.log(
          `[AICVProcessor] Emptiness percentage: ${emptinessResult.percentage}%`
        )
        console.log(
          `[AICVProcessor] Total fields: ${emptinessResult.totalFields}, Non-empty fields: ${emptinessResult.nonEmptyFields}`
        )
        if (emptinessResult.expectedTotalFields) {
          console.log(
            `[AICVProcessor] Expected emptiness percentage: ${emptinessResult.expectedPercentage}% (based on ${emptinessResult.expectedTotalFields} expected fields)`
          )
        }
      }

      return cvData
    } catch (error) {
      console.error(`Error processing CV: ${error}`)
      throw error
    }
  }

  /**
   * Save CV data to a JSON file
   */
  saveToJson(cvData: CVData, outputPath: string): void {
    try {
      // Generate a filename that includes provider, model, and timestamp
      const timestamp = new Date()
        .toISOString()
        .replace(/:/g, '-')
        .replace(/\./g, '-')
      const providerName = cvData.metadata?.provider || 'unknown'
      const modelName = cvData.metadata?.model || 'unknown'
      const processingTime = cvData.metadata?.processingTime
        ? `_${cvData.metadata.processingTime.toFixed(2)}s`
        : ''

      // Extract base path and extension
      const outputDir = path.dirname(outputPath)
      const outputBaseName = path.basename(outputPath, path.extname(outputPath))
      const outputExt = path.extname(outputPath)

      // Create filename with provider, model, timestamp and processing time
      const newOutputPath = path.join(
        outputDir,
        `${outputBaseName}_${providerName}_${modelName}${processingTime}_${timestamp}${outputExt}`
      )

      // Create directory for output if it doesn't exist
      const resultDir = path.join(
        outputDir,
        `${outputBaseName}_${timestamp.split('T')[0]}`
      )
      if (!fs.existsSync(resultDir)) {
        fs.mkdirSync(resultDir, { recursive: true })
      }

      // Save to the directory
      const finalOutputPath = path.join(
        resultDir,
        `${providerName}_${modelName}${processingTime}${outputExt}`
      )

      fs.writeFileSync(finalOutputPath, JSON.stringify(cvData, null, 2))
      console.log(`Results saved to ${finalOutputPath}`)

      // Generate and save a report for this directory
      ReportGenerator.generateAndSaveReport(resultDir, this.verbose)
        .then(() => {
          console.log(`Report generated for ${resultDir}`)
        })
        .catch((error) => {
          console.error(`Error generating report: ${error}`)
        })
    } catch (error) {
      console.error(`Error saving JSON file: ${error}`)
      throw error
    }
  }
}
