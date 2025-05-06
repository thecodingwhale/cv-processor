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

# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=your_azure_openai_api_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-04-01-preview
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name

# Grok (X.AI) API Key
GROK_API_KEY=your_grok_api_key_here
```

### Azure OpenAI Setup

To use Azure OpenAI, you need to:

1. Create an Azure OpenAI resource in the Azure portal
2. Deploy a model (like gpt-4 or gpt-35-turbo) in the Azure OpenAI Studio
3. Note down the following information:
   - API Key (from "Keys and Endpoint" in your Azure OpenAI resource)
   - Endpoint URL (e.g., https://your-resource-name.openai.azure.com)
   - Deployment Name (the name you gave your model deployment, e.g., "gpt-4")
   - API Version (use "2024-04-01-preview" or check the latest from Azure OpenAI documentation)

Make sure to use the exact deployment name you created in Azure OpenAI Studio.

For example, if your deployment in Azure OpenAI Studio is called "gpt-4", use:

```
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
```

#### Azure OpenAI Model-Specific Requirements

Different Azure OpenAI models have different parameter requirements and capabilities:

- **o3-mini models**:
  - Don't support the `temperature` parameter
  - Use `max_completion_tokens` instead of `max_tokens`
  - Don't support vision capabilities (can't process images)
- **Vision-capable models (GPT-4o, GPT-4 Vision)**:

  - Support processing images from PDFs
  - Used for visual document analysis

- **Standard models (GPT-4, GPT-3.5-Turbo)**:
  - Support standard parameters like `temperature` and `max_tokens`

The application will automatically detect:

1. Whether your model supports vision capabilities
2. Parameter requirements for specific model types

For models without vision capabilities, the system will automatically extract text from PDFs before processing.

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

# Use Azure OpenAI
npm start -- path/to/resume.pdf --use-ai azure

# Use Grok (X.AI)
npm start -- path/to/resume.pdf --use-ai grok

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

#### Using AI Processing with Azure OpenAI

```typescript
import { AIProviderFactory } from './dist/ai/AIProviderFactory'
import { AICVProcessor } from './dist/AICVProcessor'

const main = async () => {
  // Configure AI provider with Azure OpenAI settings
  const aiConfig = {
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    model: 'gpt-4', // This can be any string, as Azure uses the deployment name
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-04-01-preview',
    deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4', // Must match your Azure deployment name
  }

  // Create AI provider and processor
  const aiProvider = AIProviderFactory.createProvider('azure', aiConfig)
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
   - Azure OpenAI (GPT-4o, etc.)
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
