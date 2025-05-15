# Consensus-Based Accuracy System Documentation

This document outlines the implementation of the consensus-based accuracy evaluation system.

## Overview

The system creates a "gold standard" dataset by aggregating results from multiple AI providers, then uses this consensus to evaluate the accuracy of future extractions.

## Components

1. **ConsensusBuilder** - Generates consensus from multiple extractions
2. **ConsensusAccuracyScorer** - Evaluates accuracy against established consensus
3. **Base Metrics Generator** - Processes CVs with all providers and builds consensus
4. **AICVProcessor Integration** - Uses consensus scoring when available
5. **Parallel Processing Report** - Shows consensus-based accuracy metrics

## Workflow

### 1. Generate Base Metrics

```
npm run baseMetrics
```

This processes all CVs in the `base/` directory with all configured AI providers, builds consensus from the results, and saves it to `cache/baseMetrics.json`.

### 2. Process New CVs

```
npm run parallel CVs/example.pdf
```

This processes the CV with all providers, evaluates against consensus if available, and generates a report.

### 3. Update Base Metrics

```
npm run updateBaseMetrics
```

This updates the consensus for changed base CVs or adds new ones.

## Accuracy Evaluation

The system evaluates:

- **Structural Fidelity** - How well the structure matches the consensus
- **Field Accuracy** - How closely field values match the consensus values
- **Completeness** - Percentage of expected fields present

## Consensus Building

The consensus building process:

1. Processes each base CV with all AI providers
2. Groups similar credits based on title/role similarity
3. For each field, finds the most common value across providers
4. Calculates confidence scores based on agreement levels
5. Generates a consensus structure that best represents all outputs

## Technical Implementation

The implementation includes:

- Jaccard similarity for string comparisons
- Confidence weighting for accuracy calculations
- Support for both hierarchical and flat CV data structures
- Incremental updates to avoid reprocessing unchanged CVs
- Detailed reporting with comparisons across providers

## Benefits

- **Objectivity**: Accuracy based on consensus across multiple AI systems
- **Reliability**: More robust than single-provider evaluations
- **Maintainability**: Baseline evolves as AI capabilities improve
- **Efficiency**: Once baseline is established, evaluations are fast
