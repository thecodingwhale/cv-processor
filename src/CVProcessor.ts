import * as fs from 'fs'
import * as path from 'path'
import { EducationExtractor } from './extractors/EducationExtractor'
import { ExperienceExtractor } from './extractors/ExperienceExtractor'
import { PersonalInfoExtractor } from './extractors/PersonalInfoExtractor'
import { SectionExtractor } from './extractors/SectionExtractor'
import { SkillsExtractor } from './extractors/SkillsExtractor'
import { TextExtractor } from './extractors/TextExtractor'
import { CVData, ProcessorOptions } from './types'
import { AccuracyCalculator } from './utils/AccuracyCalculator'

/**
 * Main CV Processor class to extract structured data from PDF resumes
 */
export class CVProcessor {
  private textExtractor: TextExtractor
  private sectionExtractor: SectionExtractor
  private personalInfoExtractor: PersonalInfoExtractor
  private educationExtractor: EducationExtractor
  private experienceExtractor: ExperienceExtractor
  private skillsExtractor: SkillsExtractor
  private accuracyCalculator: AccuracyCalculator
  private verbose: boolean
  private minAccuracyThreshold: number

  /**
   * Initialize the CV processor
   */
  constructor(options: ProcessorOptions = {}) {
    this.textExtractor = new TextExtractor()
    this.sectionExtractor = new SectionExtractor()
    this.personalInfoExtractor = new PersonalInfoExtractor()
    this.educationExtractor = new EducationExtractor()
    this.experienceExtractor = new ExperienceExtractor()
    this.skillsExtractor = new SkillsExtractor()
    this.accuracyCalculator = new AccuracyCalculator(options)
    this.verbose = options.verbose || false
    this.minAccuracyThreshold = options.minAccuracyThreshold || 60

    if (this.verbose) {
      console.log('CV Processor initialized')
    }
  }

  /**
   * Process a CV PDF and extract structured information
   */
  async processCv(pdfPath: string): Promise<CVData> {
    console.log(`Processing CV: ${pdfPath}`)

    // Extract text from PDF
    const text = await this.textExtractor.extractTextFromPDF(pdfPath)

    // Segment into sections
    const sections = this.sectionExtractor.segmentCVIntoSections(text)

    // Extract information from each section
    const personalInfo = this.personalInfoExtractor.extractPersonalInfo(
      sections.header || ''
    )
    if (sections.summary) {
      personalInfo.summary = this.personalInfoExtractor.extractSummary(
        sections.summary
      )
    }

    const education = this.educationExtractor.extractEducation(
      sections.education || null
    )
    const experience = this.experienceExtractor.extractWorkExperience(
      sections.experience || null
    )
    const skills = this.skillsExtractor.extractSkills(sections.skills || null)

    // Build complete CV data
    const cvData: CVData = {
      personalInfo,
      education,
      experience,
      skills,
      metadata: {
        processedDate: new Date().toISOString(),
        sourceFile: path.basename(pdfPath),
        provider: 'traditional',
        model: 'rule-based',
      },
    }

    // Calculate accuracy score
    const accuracy = this.accuracyCalculator.calculateAccuracy(cvData)
    cvData.accuracy = accuracy

    if (this.verbose) {
      console.log(`CV Accuracy Score: ${accuracy.score}`)
      console.log(`Completeness: ${accuracy.completeness}`)
      console.log(`Confidence: ${accuracy.confidence}`)

      if (accuracy.missingFields.length > 0) {
        console.log('Missing Fields:', accuracy.missingFields)
      }

      if (!this.accuracyCalculator.meetsThreshold(accuracy)) {
        console.warn(
          `Warning: CV data does not meet minimum accuracy threshold of ${this.minAccuracyThreshold}%`
        )
      }
    }

    return cvData
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

      // Extract base path and extension
      const outputDir = path.dirname(outputPath)
      const outputBaseName = path.basename(outputPath, path.extname(outputPath))
      const outputExt = path.extname(outputPath)

      // Create filename with provider, model, and timestamp
      const newOutputPath = path.join(
        outputDir,
        `${outputBaseName}_${providerName}_${modelName}_${timestamp}${outputExt}`
      )

      fs.writeFileSync(newOutputPath, JSON.stringify(cvData, null, 2))
      console.log(`Results saved to ${newOutputPath}`)

      // Log accuracy information if available
      if (cvData.accuracy) {
        console.log(`CV Accuracy: ${cvData.accuracy.score}%`)
        if (!this.accuracyCalculator.meetsThreshold(cvData.accuracy)) {
          console.warn(
            `Warning: This CV scored below the minimum accuracy threshold (${this.minAccuracyThreshold}%)`
          )
        }
      }
    } catch (error) {
      console.error(`Error saving JSON file: ${error}`)
      throw error
    }
  }

  getModelInfo(): { provider: string; model: string } {
    return {
      provider: 'traditional',
      model: 'rule-based',
    }
  }

  /**
   * Check if the CV meets the minimum accuracy threshold
   */
  meetsAccuracyThreshold(cvData: CVData): boolean {
    if (!cvData.accuracy) {
      return false
    }

    return this.accuracyCalculator.meetsThreshold(cvData.accuracy)
  }

  /**
   * Set minimum accuracy threshold
   */
  setMinAccuracyThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 100) {
      throw new Error('Accuracy threshold must be between 0 and 100')
    }

    this.minAccuracyThreshold = threshold
  }
}
