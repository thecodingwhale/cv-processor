# CV Processor (TypeScript)

A TypeScript/Node.js tool to extract structured data from CV/resume PDFs.

## Overview

This tool processes PDF resumes/CVs and extracts structured information into JSON format, making it easier to analyze, search, and integrate CV data into applications.

This is a TypeScript/Node.js port of the original Python-based CV Processor, now with AI-powered extraction capabilities.

## Features

- PDF text extraction with OCR fallback for image-based PDFs
- AI-powered extraction using Google's Gemini AI (default) or OpenAI with a flexible provider system
- Traditional NLP-based extraction as a fallback option
- Intelligent section detection (education, experience, skills, etc.)
- NLP-based entity recognition for names, organizations, locations
- Pattern matching for contact info, dates, etc.
- Skill categorization by type
- CLI interface for easy use

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd cv-processor-ts

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

To use the AI-powered features, you need to configure your API keys:

1. Create a `.env` file in the project root:

```
# Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here
```

## Usage

### Command Line

```bash
# Process a PDF resume with default AI (Gemini)
npm start -- path/to/resume.pdf

# With verbose output
npm start -- path/to/resume.pdf -v

# Specify output file
npm start -- path/to/resume.pdf -o output.json

# Use traditional (non-AI) processing
npm start -- path/to/resume.pdf --traditional

# Use OpenAI instead of Gemini
npm start -- path/to/resume.pdf --use-ai openai

# Specify a different AI model
npm start -- path/to/resume.pdf --ai-model gpt-4o
npm start -- path/to/resume.pdf --use-ai gemini --ai-model gemini-1.5-flash
```

### API Usage

#### Using AI Processing with Gemini

```typescript
import { AIProviderFactory } from './dist/ai/AIProviderFactory'
import { AICVProcessor } from './dist/AICVProcessor'

const main = async () => {
  // Configure AI provider
  const aiConfig = {
    apiKey: process.env.GEMINI_API_KEY!,
    model: 'gemini-1.5-pro',
  }

  // Create AI provider and processor
  const aiProvider = AIProviderFactory.createProvider('gemini', aiConfig)
  const processor = new AICVProcessor(aiProvider, { verbose: true })

  try {
    // Process the CV
    const cvData = await processor.processCv('path/to/resume.pdf')

    // Save to file
    processor.saveToJson(cvData, 'output.json')

    // Or use the data directly
    console.log(cvData.personalInfo.name)
    console.log(cvData.skills.programmingLanguages)
  } catch (error) {
    console.error('Error processing CV:', error)
  }
}

main()
```

#### Using AI Processing with OpenAI

```typescript
import { AIProviderFactory } from './dist/ai/AIProviderFactory'
import { AICVProcessor } from './dist/AICVProcessor'

const main = async () => {
  // Configure AI provider
  const aiConfig = {
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o',
  }

  // Create AI provider and processor
  const aiProvider = AIProviderFactory.createProvider('openai', aiConfig)
  const processor = new AICVProcessor(aiProvider, { verbose: true })

  try {
    // Process the CV
    const cvData = await processor.processCv('path/to/resume.pdf')

    // Save to file
    processor.saveToJson(cvData, 'output.json')

    // Or use the data directly
    console.log(cvData.personalInfo.name)
    console.log(cvData.skills.programmingLanguages)
  } catch (error) {
    console.error('Error processing CV:', error)
  }
}

main()
```

#### Using Traditional Processing

```typescript
import { CVProcessor } from './dist/CVProcessor'

const main = async () => {
  const processor = new CVProcessor({ verbose: true })

  try {
    // Process the CV
    const cvData = await processor.processCv('path/to/resume.pdf')

    // Save to file
    processor.saveToJson(cvData, 'output.json')

    // Or use the data directly
    console.log(cvData.personalInfo.name)
    console.log(cvData.skills.programmingLanguages)
  } catch (error) {
    console.error('Error processing CV:', error)
  }
}

main()
```

## Output Format

The processed CV is output as a JSON file with the following structure:

```json
{
  "personalInfo": {
    "name": "John Doe",
    "email": "john.doe@example.com",
    "phone": "+1 (555) 123-4567",
    "location": "New York, NY",
    "linkedin": "https://linkedin.com/in/johndoe",
    "github": "https://github.com/johndoe",
    "summary": "Experienced software engineer..."
  },
  "education": [
    {
      "institution": "University of Example",
      "degree": "Bachelor of Science",
      "fieldOfStudy": "Computer Science",
      "startDate": "September 2014",
      "endDate": "May 2018",
      "gpa": "3.8",
      "location": "Boston, MA"
    }
  ],
  "experience": [
    {
      "company": "Tech Company Inc.",
      "position": "Senior Software Engineer",
      "startDate": "January 2020",
      "endDate": "Present",
      "location": "San Francisco, CA",
      "description": [
        "Led development of a microservices architecture...",
        "Improved system performance by 40%..."
      ]
    }
  ],
  "skills": {
    "programmingLanguages": ["JavaScript", "TypeScript", "Python"],
    "frameworks": ["React", "Node.js", "Express"],
    "tools": ["Git", "Docker", "AWS"],
    "softSkills": ["Leadership", "Communication"]
  },
  "metadata": {
    "processedDate": "2023-07-01T12:34:56.789Z",
    "sourceFile": "resume.pdf"
  }
}
```

## AI Provider System

The application is designed with a flexible AI provider system that allows you to easily swap between different AI models:

1. **Built-in Providers:**

   - Google Gemini AI (default)
   - OpenAI (GPT-4o, etc.)
   - (Placeholders for Anthropic implementations)

2. **Adding New Providers:**
   - Implement the `AIProvider` interface
   - Add the provider to the `AIProviderFactory`

## Dependencies

- **@google/generative-ai**: Google Gemini AI integration
- **openai**: OpenAI API integration
- **pdf-parse**: PDF text extraction
- **tesseract.js**: OCR capability (for traditional processing)
- **compromise**: Natural language processing (for traditional processing)
- **commander**: CLI framework
- **dotenv**: Environment variable management
- **poppler-utils**: Required for PDF to image conversion when using OpenAI (external dependency)

### System Dependencies

To use OpenAI's vision capabilities with PDFs, you need to install poppler-utils:

```bash
# On macOS
brew install poppler

# On Ubuntu/Debian
sudo apt-get install poppler-utils

# On CentOS/RHEL
sudo yum install poppler-utils
```

## Limitations

- AI-based extraction requires valid API keys and internet connectivity
- OCR functionality requires additional setup for PDF to image conversion
- NLP capabilities in JavaScript are not as robust as Python's spaCy
- Complex PDF layouts may not be parsed perfectly

## License

MIT
