# Weather APIs Setup Guide

Your app now supports **5 different weather APIs** with automatic fallback!

## Available APIs

1. **National Weather Service (NWS)** - ✅ FREE, no API key needed
2. **Weatherstack** - ✅ API key added
3. **Visual Crossing** - ✅ API key added
4. **Xweather (AerisWeather)** - ⚠️ Needs Client ID and Secret
5. **OpenWeatherMap** - ✅ Already configured

## API Keys Required

Add these to your `.env.local` file:
- `WEATHERSTACK_API_KEY=your_weatherstack_api_key`
- `VISUAL_CROSSING_API_KEY=your_visual_crossing_api_key`

## How It Works

The unified weather service tries APIs in this order:
1. **NWS** (free, reliable) - First choice
2. **Weatherstack** - If NWS fails
3. **Visual Crossing** - If Weatherstack fails
4. **Xweather** - If Visual Crossing fails
5. **OpenWeatherMap** - Final fallback

## Usage

### Automatic (Recommended)
```bash
# Uses best available API automatically
GET /api/weather?location=Vermont
```

### Specific Provider
```bash
# Use a specific API
GET /api/weather?location=Vermont&provider=weatherstack
GET /api/weather?location=Vermont&provider=visualcrossing
GET /api/weather?location=Vermont&provider=nws
```

## Xweather Setup (Optional)

If you want to use Xweather, you need:
1. Sign up at https://www.xweather.com/
2. Get your Client ID and Secret
3. Add to `.env.local`:
   ```env
   XWEATHER_CLIENT_ID=your_client_id
   XWEATHER_CLIENT_SECRET=your_client_secret
   ```

## Testing

Test each API:
```bash
# Test NWS (free)
curl "http://localhost:3000/api/weather?location=Vermont&provider=nws"

# Test Weatherstack
curl "http://localhost:3000/api/weather?location=Vermont&provider=weatherstack"

# Test Visual Crossing
curl "http://localhost:3000/api/weather?location=Vermont&provider=visualcrossing"

# Test auto (tries all)
curl "http://localhost:3000/api/weather?location=Vermont&provider=auto"
```

## Benefits

- **Reliability**: If one API is down, automatically uses another
- **No single point of failure**: Multiple backup sources
- **Cost efficiency**: Uses free NWS first
- **Better coverage**: Different APIs may have better data for different locations

## Response Format

All APIs return the same format:
```json
{
  "temperature": 5.2,
  "humidity": 75,
  "pressure": 1013,
  "description": "Partly cloudy",
  "windSpeed": 3.5,
  "location": "Burlington, US",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "source": "NWS"
}
```

The `source` field tells you which API was used.







