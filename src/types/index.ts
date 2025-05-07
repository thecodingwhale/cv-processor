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

export interface CVData {
  personalInfo: PersonalInfo
  education: Education[]
  experience: Experience[]
  skills: Skills
  metadata: {
    processedDate: string
    sourceFile: string
    model?: string
    provider?: string
  }
}

export interface Section {
  [key: string]: string
}

export interface ProcessorOptions {
  verbose?: boolean
  outputPath?: string
}
