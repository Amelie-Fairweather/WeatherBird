# Plow Analysis & Road Safety Rating Guide

This guide explains how to use plow truck data to generate road safety ratings for Maple.

## How It Works

The system analyzes plow truck density to determine road safety:

1. **Count active plows** in an area/route
2. **Calculate plow density** (plows per mile)
3. **Generate safety rating** (1-10 scale)
4. **Provide recommendations** based on coverage

## Safety Rating Scale

- **9-10**: Excellent coverage (1+ plows per 10 miles)
- **7-8**: Good coverage (1+ plows per 20 miles)
- **5-6**: Moderate coverage (1+ plows per 50 miles)
- **3-4**: Minimal coverage (1+ plows per 100 miles)
- **1-2**: Poor coverage (< 1 plow per 100 miles)

## Getting Plow Data

### Option 1: VTrans API (Future)
When VTrans provides API access, we'll automatically fetch plow data.

### Option 2: Manual Data Entry
You can manually provide plow locations:

```bash
curl -X POST http://localhost:3000/api/plows/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "plows": [
      {
        "id": "plow-1",
        "latitude": 44.2601,
        "longitude": -72.5754,
        "route": "Route 17",
        "timestamp": "2024-01-15T10:00:00Z"
      },
      {
        "id": "plow-2",
        "latitude": 44.2700,
        "longitude": -72.5800,
        "route": "Route 17",
        "timestamp": "2024-01-15T10:00:00Z"
      }
    ],
    "route": "Route 17",
    "routeLength": 50
  }'
```

### Option 3: Web Scraping (Advanced)
If VTrans doesn't provide an API, you could:
1. Scrape the plow map data
2. Extract plow locations from the map
3. Feed them into the analysis endpoint

**⚠️ Important:** Check VTrans Terms of Service before scraping.

## Integration with AI

Maple automatically uses plow analysis when available:

1. **Fetch plow data** (when API is available)
2. **Calculate safety rating**
3. **Include in AI context**
4. **Maple provides safety recommendations** based on plow coverage

### Example AI Response

When plow data is available, Maple might say:

> "Based on current plow coverage, Route 17 has a safety rating of 8/10 with 12 active plows (0.24 plows per mile). This indicates good road maintenance. However, with current weather conditions showing 2°C and dropping, black ice may still form. Exercise normal winter driving precautions."

## API Endpoints

### Analyze Plows
**POST** `/api/plows/analyze`

Analyze provided plow data and get safety rating.

**GET** `/api/plows/analyze?route=Vermont`

Attempt to fetch and analyze plow data (requires API access).

## Example Usage

### In Your Code

```typescript
import { calculateRoadSafetyRating, formatPlowAnalysisForAI } from '@/lib/plowAnalysisService';

// Get plow data (from API, scraping, or manual entry)
const plows = [
  { id: '1', latitude: 44.26, longitude: -72.57, route: 'Route 17', timestamp: new Date().toISOString() },
  // ... more plows
];

// Calculate rating
const rating = calculateRoadSafetyRating(plows, 'Route 17', 50);

// Format for AI
const aiContext = formatPlowAnalysisForAI(rating);

// Use in AI prediction
const prediction = await getWeatherPrediction({
  question: 'Is Route 17 safe to drive?',
  location: 'Vermont',
  plowAnalysis: aiContext,
  // ... other context
});
```

## Next Steps

1. **Contact VTrans** for plow data API access
2. **Set up data collection** (API, scraping, or manual)
3. **Test the analysis** with sample plow data
4. **Integrate with Maple** - it's already set up!

## Future Enhancements

- Real-time plow tracking
- Route-specific safety ratings
- Historical plow coverage analysis
- Predictive safety ratings based on weather + plow coverage
- Integration with road condition sensors







