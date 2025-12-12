# Knowledge Base Linking Guide

This guide explains how to link knowledge base documents (stored in Pinecone) to database records (stored in Supabase).

## Setup

1. **Run the SQL script** to create the linking tables:
   ```sql
   -- Run supabase-knowledge-links.sql in your Supabase SQL Editor
   ```

2. **The system creates two tables:**
   - `knowledge_documents` - Tracks all knowledge base documents
   - `knowledge_weather_links` - Links documents to weather data records

## How It Works

### 1. Adding Documents with Links

When you add a document, you can include database references in the metadata:

```json
{
  "documents": [
    {
      "id": "vermont-winter-001",
      "text": "Vermont experiences harsh winters...",
      "metadata": {
        "title": "Vermont Winter Safety",
        "category": "Road Safety",
        "source": "VTrans",
        "supabase_table": "weather_data",
        "supabase_id": 123,
        "relationship_type": "example"
      }
    }
  ]
}
```

**POST** `/api/knowledge/add`

The system will:
1. Store the document in Pinecone (for semantic search)
2. Store metadata in Supabase `knowledge_documents` table
3. Create a link in `knowledge_weather_links` if `supabase_table` and `supabase_id` are provided

### 2. Linking Existing Documents

Link an existing knowledge document to a database record:

**POST** `/api/knowledge/link`

```json
{
  "pinecone_id": "vermont-winter-001",
  "table": "weather_data",
  "record_id": 123,
  "relationship_type": "related"
}
```

### 3. Retrieving Linked Data

When you search the knowledge base, you can also fetch linked database records:

```typescript
import { getLinkedWeatherData } from '@/lib/knowledgeLinks';

// Get all weather data linked to a knowledge document
const weatherData = await getLinkedWeatherData('vermont-winter-001');
```

## Example Use Cases

### Example 1: Link a document to specific weather event

```bash
# First, get a weather_data ID from Supabase
# Then add a document linked to it:

curl -X POST http://localhost:3000/api/knowledge/add \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [{
      "id": "snow-storm-2024-01-15",
      "text": "On January 15, 2024, Vermont experienced a major snowstorm with 18 inches of accumulation. Road conditions were hazardous, and Route 17 was closed for 6 hours.",
      "metadata": {
        "title": "January 2024 Snowstorm",
        "category": "Weather Event",
        "supabase_table": "weather_data",
        "supabase_id": 456,
        "relationship_type": "example"
      }
    }]
  }'
```

### Example 2: Link multiple documents to the same weather record

```bash
# Add multiple documents about the same weather event
# They'll all be linked to the same weather_data record
```

### Example 3: Query linked data

```typescript
// In your API route or service
import { getLinkedWeatherData, getLinkedKnowledgeDocuments } from '@/lib/knowledgeLinks';

// Get weather data linked to a knowledge document
const weatherData = await getLinkedWeatherData('vermont-winter-001');

// Get knowledge documents linked to a weather record
const knowledgeDocs = await getLinkedKnowledgeDocuments(123);
```

## Integration with AI

The AI service automatically searches the knowledge base. You can enhance it to also fetch linked data:

```typescript
// In app/api/weather/ai/test/route.ts
import { getLinkedWeatherData } from '@/lib/knowledgeLinks';

// After searching knowledge base
const knowledgeResults = await searchSimilar(question, 3);

// Get linked weather data for each result
for (const result of knowledgeResults) {
  const linkedData = await getLinkedWeatherData(result.metadata.pinecone_id);
  // Include linked data in context
}
```

## Relationship Types

Use `relationship_type` to categorize links:
- `"example"` - The document is an example of this weather condition
- `"related"` - The document is related to this weather data
- `"context"` - The document provides context for this weather data
- `"warning"` - The document contains warnings related to this weather

## Next Steps

1. **Add more link types**: Extend `knowledgeLinks.ts` to support other tables (road_conditions, etc.)
2. **Bidirectional queries**: Query from either direction (document → data or data → documents)
3. **Auto-linking**: Automatically link documents based on content similarity
4. **Link visualization**: Create a UI to visualize document-data relationships







