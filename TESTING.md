# Testing Guide for Weather API Integration

## Step 1: Environment Setup ✅

Make sure you have a `.env.local` file in your project root with:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
WEATHER_API_KEY=your_openweathermap_api_key
```

## Step 2: Database Setup ✅

1. Go to your Supabase dashboard
2. Click "SQL Editor"
3. Copy and paste the SQL from `supabase-setup.sql`
4. Click "Run" to create the `weather_data` table

## Step 3: Test the API Endpoint

### Option A: Test in Browser
1. Start your dev server: `npm run dev`
2. Open browser and go to: `http://localhost:3000/api/weather?location=Vermont`
3. You should see JSON weather data

### Option B: Test with curl (Terminal)
```bash
curl http://localhost:3000/api/weather?location=Vermont
```

### Option C: Test in Browser DevTools
Open browser console and run:
```javascript
fetch('/api/weather?location=Vermont')
  .then(res => res.json())
  .then(data => console.log(data))
```

## Step 4: Verify Data in Supabase

1. Go to Supabase dashboard
2. Click "Table Editor"
3. Select `weather_data` table
4. You should see the weather data that was just fetched

## Step 5: Test Different Locations

Try these URLs:
- `http://localhost:3000/api/weather?location=New York`
- `http://localhost:3000/api/weather?location=London`
- `http://localhost:3000/api/weather?location=Tokyo`

## Common Issues

### Error: "WEATHER_API_KEY is not set"
- Make sure `.env.local` exists and has `WEATHER_API_KEY`
- Restart your dev server after adding env variables

### Error: "Invalid OpenWeatherMap API key"
- Check your API key at openweathermap.org
- Make sure there are no extra spaces in `.env.local`

### Error: "relation 'weather_data' does not exist"
- Run the SQL from `supabase-setup.sql` in Supabase SQL Editor

### Error: "Failed to fetch weather data"
- Check your internet connection
- Verify your OpenWeatherMap API key is valid
- Check the browser console for detailed error messages








