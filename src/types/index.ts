export interface PersonalInfo {
  name: string | null
  email: string | null
  phone: string | null
  location: string | null
  linkedin: string | null
  github: string | null
  summary?: string | null
}

export interface Education {
  institution: string | null
  degree: string | null
  fieldOfStudy: string | null
  startDate: string | null
  endDate: string | null
  gpa: string | null
  location: string | null
}

export interface Experience {
  company: string | null
  position: string | null
  startDate: string | null
  endDate: string | null
  location: string | null
  description: string[]
}

export interface Skills {
  programmingLanguages?: string[]
  frameworks?: string[]
  tools?: string[]
  softSkills?: string[]
  other?: string[]
}

export interface AccuracyScore {
  score: number // 0-100 percentage score
  completeness: number // 0-100 percentage of fields populated
  confidence: number // 0-100 confidence in extracted data
  fieldScores: {
    personalInfo?: number // Section-specific scores
    education?: number
    experience?: number
    skills?: number
  }
  missingFields: string[] // List of important fields that are missing
}

export interface CVData {
  personalInfo: PersonalInfo
  education: Education[]
  experience: Experience[]
  skills: Skills
  accuracy?: AccuracyScore // Added accuracy scoring
  metadata: {
    processedDate: string
    sourceFile: string
    model?: string
    provider?: string
    error?: string // Add optional error property
  }
}

export interface Section {
  [key: string]: string
}

export interface ProcessorOptions {
  verbose?: boolean
  outputPath?: string
  minAccuracyThreshold?: number // Minimum accuracy threshold (0-100)
  accuracyWeights?: {
    personalInfo?: number
    education?: number
    experience?: number
    skills?: number
  }
}
