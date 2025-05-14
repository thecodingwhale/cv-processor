import * as fs from 'fs'
import * as path from 'path'
import { CVData, ProcessorOptions } from './types'
import { AIProvider } from './types/AIProvider'
import { convertPdfToImages } from './utils/document'

/**
 * AI-powered CV Processor class to extract structured data from PDF resumes
 */
export class AICVProcessor {
  private aiProvider: AIProvider
  private verbose: boolean

  // private industryContext: string // Store industry context for patterns

  /**
   * Initialize the AI CV processor
   */
  constructor(aiProvider: AIProvider, options: ProcessorOptions = {}) {
    this.aiProvider = aiProvider
    this.verbose = options.verbose || false
    if (this.verbose) {
      console.log('AI CV Processor initialized')
    }
  }

  /**
   * Process a CV PDF and extract structured information using AI
   */
  async processCv(pdfPath: string): Promise<CVData> {
    console.log(`Processing CV with AI: ${pdfPath}`)

    // Track start time for processing
    const startTime = new Date().getTime()

    try {
      const imageUrls = await convertPdfToImages(pdfPath)

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

      // Create a prompt that incorporates industry context and any patterns detected
      const instructions = `
        You are an AI data extractor for an actor's resume system. I will provide you the full text of an actor's resume (from PDF). Your task is to extract and convert the credits into a structured JSON object matching this schema:

        {
          "resume": [
            {
              "category": "<Category>", // MUST be one of these official categories
              "category_id": "<UUIDv4>", // always generate a new UUIDv4 for each unique category
              "credits": [
                {
                  "id": "<UUIDv4>", // always generate a new UUIDv4 for each credit
                  "year": "YYYY",
                  "title": "<Title of Production>",
                  "role": "<Role>",
                  "director": "<Director Name>",
                  "attached_media": [] // leave as empty array
                }
              ]
            },
            ...
          ],
          "resume_show_years": true
        }

        ✅ Official allowed categories:
        ["Commercial", "Film", "Television", "Theatre", "Print / Fashion", "Training", "Voice", "Stunt", "Corporate", "MC/Presenting", "Extras", "Other"]

        Categorization rules:

        - Only classify credits under these official categories.
        - Map synonyms, similar phrases, and related wording **logically to the closest matching official category.** For example:
          (e.g., "Voice Over" → "Voice", "Feature Film" → "Film", "Stage" → "Theatre", "Presenter" → "MC/Presenting")
        - Always prioritize semantic meaning over literal wording.
        - If a credit cannot be confidently mapped → assign it under "Other".
        - Never invent a new category outside the official list.

        ✅ Extraction rules:

        - Extract **only credits (roles and productions)** → ignore sections like Profile, Notes, Skills, Memberships.
        - Group credits under their respective categories.
        - Each unique category must have its own unique 'category_id' (UUIDv4).
        - Each credit must have its own unique 'id' (UUIDv4).
        - If director name is missing → set '"director": ""'.
        - Remove duplicate credits.
        - Keep credits **grouped by category** and in chronological order (if possible).
        - Do not include empty categories (categories with no credits).

        Example input from resume:
        2023
        Voice Over Narrator Aussie Truck Rehab Discovery Channel Roger Power

        Expected output:
        {
        "category": "Voice",
        "category_id": "f70d3ec4-3e90-4238-b129-032de7f0aa9d",
        "credits": [
        {
        "id": "b493c51b-7fbd-4f6a-83d7-5f4238f7ee4a",
        "year": "2023",
        "title": "Aussie Truck Rehab",
        "role": "Narrator",
        "director": "Roger Power",
        "attached_media": []
        }
        ]
        }

        ✅ Final output: a **single JSON object following the schema**, containing all credits grouped per category, all IDs generated as UUIDv4.
      `

      try {
        // Use AI to extract structured data
        const cvData = await this.aiProvider.extractStructuredData<CVData>(
          imageUrls,
          dataSchema,
          instructions
        )

        // Calculate processing time
        const processingTime = (new Date().getTime() - startTime) / 1000
        console.log(
          `[AICVProcessor] Processing completed in ${processingTime.toFixed(
            2
          )} seconds`
        )

        // Add metadata
        cvData.metadata = {
          processedDate: new Date().toISOString(),
          sourceFile: path.basename(pdfPath),
          processingTime: processingTime,
          ...this.aiProvider.getModelInfo(),
        }

        return cvData
      } catch (error) {
        console.error(`Error processing CV: ${error}`)
        throw error
      }
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

      fs.writeFileSync(newOutputPath, JSON.stringify(cvData, null, 2))
      console.log(`Results saved to ${newOutputPath}`)
    } catch (error) {
      console.error(`Error saving JSON file: ${error}`)
      throw error
    }
  }
}
