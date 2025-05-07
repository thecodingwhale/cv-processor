import * as fs from 'fs'
import * as path from 'path'
import { EducationExtractor } from './extractors/EducationExtractor'
import { ExperienceExtractor } from './extractors/ExperienceExtractor'
import { PersonalInfoExtractor } from './extractors/PersonalInfoExtractor'
import { SectionExtractor } from './extractors/SectionExtractor'
import { SkillsExtractor } from './extractors/SkillsExtractor'
import { TextExtractor } from './extractors/TextExtractor'
import { CVData, ProcessorOptions } from './types'

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
  private verbose: boolean

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
    this.verbose = options.verbose || false

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
}
