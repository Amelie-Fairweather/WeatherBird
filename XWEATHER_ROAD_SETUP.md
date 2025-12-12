# Xweather Road Weather API Setup

## ✅ Integration Complete!

The Xweather Road Weather API has been integrated into your app. This provides:
- **Road condition forecasts** with GREEN/YELLOW/RED status
- **15-minute intervals** for the first 2 hours
- **Hourly forecasts** for up to 24 hours
- **Coverage:** US, Europe, Japan, Canada, Australia, New Zealand

## Setup Instructions

### 1. Get API Credentials

1. Sign up at https://www.xweather.com/
2. Navigate to your dashboard
3. Get your **Client ID** and **Client Secret**

### 2. Add to Environment Variables

Add these to your `.env.local` file:

```env
XWEATHER_CLIENT_ID=your_client_id_here
XWEATHER_CLIENT_SECRET=your_client_secret_here
```

### 3. Restart Your Dev Server

After adding the environment variables, restart your Next.js dev server:

```bash
npm run dev
```

## How It Works

The Xweather Road Weather API is automatically integrated into your road condition fetching:

1. **`lib/xweatherService.ts`** - Contains `fetchXweatherRoadWeather()` function
2. **`lib/roadDataService.ts`** - Contains `fetchXweatherRoadConditions()` and `fetchAllRoadConditions()`
3. **`app/api/weather/ai/test/route.ts`** - Automatically uses Xweather data when available

## API Endpoint

The Xweather Road Weather API endpoint:
```
https://data.api.xweather.com/roadweather/{location}?client_id={client_id}&client_secret={client_secret}
```

**Location formats supported:**
- City names: `"Burlington, VT"`
- Coordinates: `"44.4759,-73.2121"`
- Postal codes: `"05401"` (US/Canada)

## Response Format

The API returns road condition forecasts with:
- **GREEN** (summaryIndex: 0) - Dry roads, no issues
- **YELLOW** (summaryIndex: 1) - Potential for wet roads, extend caution
- **RED** (summaryIndex: 2) - Potential adverse road conditions

Each forecast includes:
- Timestamp
- Road name and type
- Location (lat/long)
- Place information
- Multiple forecast periods

## Integration Details

### Automatic Fallback

The `fetchAllRoadConditions()` function automatically:
1. Fetches from NWS (always tries, free)
2. Fetches from Xweather (if API keys are set)
3. Combines both sources
4. Returns unified road condition data

### Error Handling

- If Xweather API keys are not set, it gracefully skips Xweather and uses NWS only
- If Xweather API fails, it logs the error but doesn't break the app
- Other data sources continue to work

## Testing

Once you've added your API keys, test it:

```bash
# Test the API endpoint directly
curl "http://localhost:3000/api/weather/ai/test?location=Burlington,VT"
```

Or test in your chat interface - Maple will automatically use Xweather road condition data when making predictions!

## Documentation

Full API documentation: https://www.xweather.com/docs/weather-api/endpoints/roadweather

## Next Steps

1. ✅ Get Xweather API credentials
2. ✅ Add to `.env.local`
3. ✅ Restart dev server
4. ✅ Test in your app!

The integration is complete - just add your API keys and you're ready to go! 🎉




