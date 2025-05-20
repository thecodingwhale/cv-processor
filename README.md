# CV Processor (TypeScript)

A TypeScript/Node.js tool to extract structured data from CV/resume PDFs.

## Overview

This tool processes PDF resumes/CVs and extracts structured information into JSON format, making it easier to analyze, search, and integrate CV data into applications. It's specifically designed for actor/actress resumes to extract credits and categorize them properly.

## Features

- PDF text extraction and image processing for visual resume analysis
- AI-powered extraction using multiple providers:
  - Google's Gemini AI
  - OpenAI (GPT-4, etc.)
  - Azure OpenAI
  - Grok (X.AI)
  - AWS Bedrock (Claude, Nova, etc.)
- Organized output with categorized credits
- CLI interface for easy use
- Parallel processing of multiple AI providers
- Performance metrics and processing time tracking
- Reports analysis and provider comparison

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

# AWS Bedrock Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=us-east-1
AWS_BEDROCK_INFERENCE_PROFILE_ARN=arn:aws:bedrock:us-east-1:123456789012:inference-profile/my-profile
```

### Azure OpenAI and AWS Bedrock Setup

For detailed setup instructions for Azure OpenAI and AWS Bedrock, please refer to the respective documentation.

## Customizing Instructions

The application uses a text file for AI extraction instructions. You can customize these instructions by:

1. Editing the `instructions.txt` file in the project root directory
2. Or specifying a custom instructions file path when creating an AICVProcessor:

```typescript
const processor = new AICVProcessor(aiProvider, {
  instructionsPath: '/path/to/your/custom-instructions.txt',
  verbose: true,
})
```

The instructions file contains:

- The schema definition for extracted data
- Categorization rules for actor credits
- Extraction rules and guidelines
- Examples of expected input/output

## Usage

### Command Line

```bash
# Process a PDF resume with default AI (Gemini)
npm start -- process path/to/resume.pdf

# With verbose output
npm start -- process path/to/resume.pdf -v

# Specify output file
npm start -- process path/to/resume.pdf -o output.json

# Use OpenAI instead of Gemini
npm start -- process path/to/resume.pdf --use-ai openai

# Use Azure OpenAI
npm start -- process path/to/resume.pdf --use-ai azure

# Use Grok (X.AI)
npm start -- process path/to/resume.pdf --use-ai grok

# Use AWS Bedrock
npm start -- process path/to/resume.pdf --use-ai aws
npm start -- process path/to/resume.pdf --use-ai aws --ai-model anthropic.claude-3-sonnet-20240229-v1:0

# Specify a different AI model
npm start -- process path/to/resume.pdf --ai-model gpt-4o
npm start -- process path/to/resume.pdf --use-ai gemini --ai-model gemini-1.5-flash

# Specify conversion type (PDF to Images or PDF to Text)
npm start -- process path/to/resume.pdf --conversion-type pdftoimages
npm start -- process path/to/resume.pdf --conversion-type pdftotexts
```

### Parallel Processing

You can process a CV with multiple AI providers in parallel:

```bash
# Process with all configured providers simultaneously
npm run parallel path/to/resume.pdf
```

This will:

1. Run extractions using all configured AI providers/models in parallel
2. Save all results to an organized output directory
3. Generate a markdown report comparing performance and results
4. Track processing time for benchmarking purposes

The output will be saved to: `output/CVName_YYYY-MM-DD_HH-MM-SS/`

### Analyzing Results

After running multiple CV processes, you can generate a merged report to compare AI provider performance:

```bash
# Generate a merged report from all output directories
npm start -- merge-reports

# Specify a custom output directory
npm start -- merge-reports -d ./my-output-folder

# Specify a custom output file for the report
npm start -- merge-reports -o performance-analysis.md
```

The merged report provides:

1. Rankings of AI providers by accuracy, speed, and combined performance
2. Detailed metrics for each provider and model
3. Recommendations for the best overall performer
4. Summary of all processing runs

This helps identify which AI provider and model combination delivers the best results for your specific CV processing needs.

### API Usage

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
  const processor = new AICVProcessor(aiProvider, {
    verbose: true,
    // Optional: custom instructions path
    instructionsPath: './my-custom-instructions.txt',
  })

  try {
    // Process the CV
    const cvData = await processor.processCv('path/to/resume.pdf')

    // Save to file
    processor.saveToJson(cvData, 'output.json')
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
  "resume": [
    {
      "category": "Film",
      "category_id": "a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6",
      "credits": [
        {
          "id": "b1c2d3e4-f5g6-h7i8-j9k0-l1m2n3o4p5q6",
          "year": "2023",
          "title": "Major Motion Picture",
          "role": "Supporting Character",
          "director": "Famous Director",
          "attached_media": []
        }
      ]
    },
    {
      "category": "Television",
      "category_id": "c1d2e3f4-g5h6-i7j8-k9l0-m1n2o3p4q5r6",
      "credits": [
        {
          "id": "d1e2f3g4-h5i6-j7k8-l9m0-n1o2p3q4r5s6",
          "year": "2022",
          "title": "Popular TV Show",
          "role": "Guest Star",
          "director": "TV Director",
          "attached_media": []
        }
      ]
    }
  ],
  "resume_show_years": true,
  "metadata": {
    "processedDate": "2023-07-01T12:34:56.789Z",
    "sourceFile": "actor_resume.pdf",
    "processingTime": 5.23,
    "provider": "gemini",
    "model": "gemini-1.5-pro"
  }
}
```

## AI Provider System

The application is designed with a flexible AI provider system that allows you to easily swap between different AI models:

1. **Built-in Providers:**

   - Google Gemini AI (default)
   - OpenAI (GPT-4o, etc.)
   - Azure OpenAI (GPT-4o, etc.)
   - Grok (X.AI) API
   - AWS Bedrock (Amazon Nova, etc.)

2. **Performance Metrics:**
   - Each output includes processing time in seconds
   - Filenames include the processing time for easy comparison
   - Parallel processing generates reports comparing all providers
   - Merged reports identify the best providers based on accuracy and speed

## Dependencies

- **@google/generative-ai**: Google Gemini AI integration
- **openai**: OpenAI API integration
- **pdf-parse**: PDF text extraction
- **tesseract.js**: OCR capability
- **@aws-sdk/client-bedrock-runtime**: AWS Bedrock integration
- **commander**: CLI framework
- **dotenv**: Environment variable management
- **jsonrepair**: Fix malformed JSON from AI responses
- **glob**: File path matching
- **poppler-utils**: Required for PDF to image conversion (external dependency)

## License

MIT
