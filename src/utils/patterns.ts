/**
 * Regex patterns for CV parsing
 */

export const Patterns = {
  // Contact information
  email: /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  phone: /(\+\d{1,3}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,

  // Social profiles
  linkedin: /linkedin\.com\/in\/[\w-]+/g,
  github: /github\.com\/[\w-]+/g,

  // Date formats for experience and education
  date: /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\.?\s+\d{4}\s*[-–—]?\s*(?:(Present|Current|Now)|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\.?\s+\d{4})?/i,

  // Section headers
  sections: {
    education: /education|academic|qualification|degree/i,
    experience: /experience|employment|work history|professional/i,
    skills: /skills|expertise|competencies|technical/i,
    projects: /projects|portfolio/i,
    certifications: /certifications|certificates/i,
    languages: /languages|language proficiency/i,
    summary: /summary|profile|objective|about/i,
  },

  // Degree patterns
  degreePatterns: [
    /(?:Bachelor|Master|PhD|Doctorate|BSc|BA|MSc|MA|Ph\.D|B\.S|M\.S|B\.A|M\.A)[^\n,]*/i,
    /(?:Associate|Diploma|Certificate)[^\n,]*/i,
  ],

  // Job title patterns
  titlePatterns: [
    /(?:^|\n)([^,\n]+?Engineer[^,\n]*)/i,
    /(?:^|\n)([^,\n]+?Developer[^,\n]*)/i,
    /(?:^|\n)([^,\n]+?Analyst[^,\n]*)/i,
    /(?:^|\n)([^,\n]+?Manager[^,\n]*)/i,
    /(?:^|\n)([^,\n]+?Director[^,\n]*)/i,
    /(?:^|\n)([^,\n]+?Designer[^,\n]*)/i,
    /(?:^|\n)([^,\n]+?Consultant[^,\n]*)/i,
    /(?:^|\n)([^,\n]+?Intern[^,\n]*)/i,
  ],

  // GPA extraction
  gpa: /GPA[:of\s]+(\d+\.\d+|\d+)/i,

  // Field of study
  fieldOfStudy: /\s+in\s+([^,\n]+)/i,

  // Bullet points
  bulletPoint: /^[•\-*]\s*/,
}

export const SkillCategories = {
  programmingLanguages: new Set([
    'python',
    'java',
    'c++',
    'c#',
    'javascript',
    'typescript',
    'ruby',
    'go',
    'swift',
    'php',
    'kotlin',
    'scala',
    'rust',
    'r',
    'matlab',
    'sql',
    'html',
    'css',
    'bash',
    'shell',
  ]),
  frameworks: new Set([
    'react',
    'angular',
    'vue',
    'django',
    'flask',
    'spring',
    'asp.net',
    'laravel',
    'express',
    'tensorflow',
    'pytorch',
    'scikit-learn',
    'pandas',
    'numpy',
    'bootstrap',
    'jquery',
    'node.js',
    'rails',
    'hibernate',
    'symfony',
  ]),
  tools: new Set([
    'git',
    'docker',
    'kubernetes',
    'aws',
    'azure',
    'gcp',
    'jira',
    'jenkins',
    'travis ci',
    'circleci',
    'terraform',
    'ansible',
    'puppet',
    'chef',
    'nginx',
    'apache',
    'postgresql',
    'mongodb',
    'mysql',
    'redis',
    'elasticsearch',
    'kafka',
    'rabbitmq',
  ]),
  softSkills: new Set([
    'communication',
    'teamwork',
    'leadership',
    'problem solving',
    'critical thinking',
    'time management',
    'creativity',
    'adaptability',
    'collaboration',
    'project management',
  ]),
}
