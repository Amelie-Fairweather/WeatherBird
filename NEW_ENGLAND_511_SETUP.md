# New England 511 Integration Guide

This guide explains how to integrate New England 511 road condition data into your Weatherbird app.

## What is New England 511?

[New England 511](https://newengland511.org) provides real-time traffic and road condition information for Maine, New Hampshire, and Vermont. They offer a Developer Portal with API access to various datasets.

## Available Data Types

1. **Incidents** - Current traffic incidents
2. **Lane Closures** - Road and lane closures
3. **Environmental Sensor Data** - Road weather information from sensors
4. **Traffic Conditions** - Speed, volume, and occupancy data
5. **CCTV Cameras** - Traffic camera snapshots
6. **DMS Messages** - Dynamic message sign content
7. **Travel Times** - Estimated travel times for routes

## Setup Steps

### 1. Register for API Access

1. Visit the [New England 511 Developer Portal](https://nec-por.ne-compass.com/DeveloperPortal/)
2. Sign up for an account
3. Review and accept the Terms and Conditions
4. Get your API key

### 2. Add API Key to Environment Variables

Add to your `.env.local`:

```env
NEW_ENGLAND_511_API_KEY=your_api_key_here
NEW_ENGLAND_511_BASE_URL=https://nec-por.ne-compass.com/api
```

### 3. Create Database Tables

Run the SQL script in Supabase:

```sql
-- Run supabase-road-conditions.sql in your Supabase SQL Editor
```

This creates:
- `road_conditions` table - Stores all road condition data
- `knowledge_road_links` table - Links road conditions to knowledge documents

### 4. Fetch Road Conditions

**API Endpoint:** `GET /api/road-conditions/fetch?region=Vermont`

This will:
- Fetch incidents, closures, and sensor data from New England 511
- Store them in Supabase
- Return formatted data for AI context

**Example:**
```bash
curl http://localhost:3000/api/road-conditions/fetch?region=Vermont
```

### 5. Link to Knowledge Base

When you add knowledge documents, you can link them to road conditions:

```json
{
  "documents": [{
    "id": "route-17-winter-conditions",
    "text": "Route 17 is particularly dangerous in winter...",
    "metadata": {
      "title": "Route 17 Winter Conditions",
      "category": "Road Safety",
      "supabase_table": "road_conditions",
      "supabase_id": 123,
      "relationship_type": "warning"
    }
  }]
}
```

## Integration with AI

The road condition data is automatically included in Maple's context when answering questions. The system:

1. Fetches current road conditions from Supabase
2. Searches knowledge base for related documents
3. Includes both in the AI context
4. Maple provides answers based on real-time data + knowledge base

## Scheduled Data Collection

Set up a cron job or scheduled function to regularly fetch road conditions:

```typescript
// Example: Fetch every 15 minutes
setInterval(async () => {
  await fetch('/api/road-conditions/fetch?region=Vermont');
}, 15 * 60 * 1000);
```

Or use Vercel Cron Jobs, Supabase Edge Functions, or similar services.

## Data Structure

### Road Conditions Table

- `source` - Data source ('new_england_511', 'nws', etc.)
- `region` - 'Vermont', 'New Hampshire', 'Maine'
- `condition_type` - 'incident', 'closure', 'sensor', 'traffic'
- `description` - Human-readable description
- `severity` - 'minor', 'moderate', 'severe', 'closed'
- `status` - 'active', 'cleared', 'scheduled'
- `temperature`, `surface_condition` - For sensor data
- `raw_data` - Full JSON from API

## Example Queries

### Get active incidents in Vermont
```sql
SELECT * FROM road_conditions 
WHERE region = 'Vermont' 
  AND condition_type = 'incident' 
  AND status = 'active'
ORDER BY created_at DESC;
```

### Get road weather sensor data
```sql
SELECT location, temperature, surface_condition 
FROM road_conditions 
WHERE condition_type = 'sensor' 
  AND region = 'Vermont'
ORDER BY updated_at DESC;
```

## Next Steps

1. **Get API Key** - Register at the Developer Portal
2. **Test the endpoint** - Fetch some data
3. **Set up scheduled collection** - Keep data fresh
4. **Link to knowledge base** - Connect documents to road conditions
5. **Enhance AI responses** - Maple will use this data automatically

## Resources

- [New England 511 Website](https://newengland511.org)
- [Developer Portal](https://nec-por.ne-compass.com/DeveloperPortal/)
- [Vermont AOT Home](https://vtrans.vermont.gov/) - Vermont Agency of Transportation







