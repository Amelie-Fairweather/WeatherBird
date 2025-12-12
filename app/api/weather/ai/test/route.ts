import { getWeatherPrediction } from '@/lib/aiService';
import { fetchWeatherFromProvider } from '@/lib/unifiedWeatherService';
import { getHistoricalWeatherData, WeatherDataPoint } from '@/lib/supabaseQueries';
import { fetchAllRoadConditions, formatRoadConditionsForAI } from '@/lib/roadDataService';
import { getAllActiveRoadConditions, formatRoadConditionsForAI as formatVTransRoadConditions } from '@/lib/vtransService';
import { calculateRoadSafetyRating, formatPlowAnalysisForAI, analyzePlowDistribution } from '@/lib/plowAnalysisService';
import { searchSimilar } from '@/lib/vectorStore';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const location = 'Vermont';
    // Fetch current weather data from multiple sources (auto-selects best available)
    const weatherData = await fetchWeatherFromProvider(location, 'auto');
    const currentWeather = {
      location: weatherData.location,
      temperature: weatherData.temperature,
      humidity: weatherData.humidity,
      pressure: weatherData.pressure,
      description: weatherData.description,
      windSpeed: weatherData.windSpeed,
      timestamp: weatherData.timestamp,
      source: weatherData.source, // Pass through the API source
    };
    console.log(`[Maple] GET - Weather data retrieved from: ${weatherData.source || 'unknown'}`);
    
    // Fetch historical weather data from Supabase
    const historicalData = await getHistoricalWeatherData(location, 7);
    
    // Fetch road conditions from multiple sources (NWS + Xweather)
    const allRoadConditions = await fetchAllRoadConditions(location);
    const roadConditionsText = formatRoadConditionsForAI(allRoadConditions);
    
    // Get manual/VTrans road conditions from Supabase
    const vtransRoadConditions = await getAllActiveRoadConditions();
    const vtransRoadConditionsText = formatVTransRoadConditions(vtransRoadConditions);
    
    // Combine all sources
    const combinedRoadConditionsText = roadConditionsText + '\n' + vtransRoadConditionsText;
    
    // Search knowledge base for relevant context
    const knowledgeResults = await searchSimilar('What is the weather in Vermont?', 3);
    const knowledgeContext = knowledgeResults
      .map((result, i) => `${i + 1}. ${result.text}`)
      .join('\n\n');
    
  const prediction = await getWeatherPrediction({
    question: 'What is the weather in Vermont?',
      location: location,
      currentWeather: currentWeather,
      historicalData: historicalData,
      roadConditions: combinedRoadConditionsText,
      knowledgeContext: knowledgeContext,
  });
  return NextResponse.json({ prediction });
  } catch (error) {
    console.error('Error in GET:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Check if the question is weather-related (same logic as in aiService)
function isWeatherRelated(question: string): boolean {
  const lowerQuestion = question.toLowerCase();
  const weatherKeywords = [
    'weather', 'temperature', 'temp', 'rain', 'snow', 'wind', 'forecast',
    'humidity', 'pressure', 'storm', 'cloud', 'sunny', 'cold', 'hot', 'warm',
    'freeze', 'ice', 'road', 'condition', 'safety', 'dangerous', 'hazard',
    'flood', 'precipitation', 'visibility', 'fog', 'mist'
  ];
  return weatherKeywords.some(keyword => lowerQuestion.includes(keyword));
}

export async function POST(request: Request) {
  try {
  const { question, location } = await request.json();
    
    // Only fetch weather data if the question is weather-related
    const includeWeatherData = isWeatherRelated(question);
    
    let currentWeather;
    let historicalData: WeatherDataPoint[] = [];
    let combinedRoadConditionsText = '';
    let knowledgeContext = '';
    let plowAnalysis = '';
    
    if (includeWeatherData) {
      // Fetch current weather data from multiple sources (auto-selects best available)
      try {
        const weatherData = await fetchWeatherFromProvider(location || 'Vermont', 'auto');
        currentWeather = {
          location: weatherData.location,
          temperature: weatherData.temperature,
          humidity: weatherData.humidity,
          pressure: weatherData.pressure,
          description: weatherData.description,
          windSpeed: weatherData.windSpeed,
          timestamp: weatherData.timestamp,
          source: weatherData.source, // Pass through the API source
        };
        console.log(`[Maple] Weather data retrieved from: ${weatherData.source || 'unknown'}`);
      } catch (error) {
        console.error('[Maple] Error fetching weather data:', error);
        // Continue without current weather
      }
      
      // Fetch historical weather data from Supabase (last 7 days)
      try {
        historicalData = await getHistoricalWeatherData(location || 'Vermont', 7);
        console.log(`[Maple] Historical data points retrieved: ${historicalData.length}`);
      } catch (error) {
        console.error('[Maple] Error fetching historical data:', error);
        // Continue without historical data
      }
      
      // Fetch road conditions from multiple sources (NWS + Xweather)
      try {
        const allRoadConditions = await fetchAllRoadConditions(location || 'Vermont');
        const roadConditionsText = formatRoadConditionsForAI(allRoadConditions);
        console.log(`[Maple] Road conditions retrieved: ${allRoadConditions.length} conditions`);
        
        // Get manual/VTrans road conditions from Supabase
        const vtransRoadConditions = await getAllActiveRoadConditions();
        const vtransRoadConditionsText = formatVTransRoadConditions(vtransRoadConditions);
        console.log(`[Maple] VTrans road conditions retrieved: ${vtransRoadConditions.length} conditions`);
        
        // Combine all sources
        combinedRoadConditionsText = roadConditionsText + '\n' + vtransRoadConditionsText;
      } catch (error) {
        console.error('[Maple] Error fetching road conditions:', error);
        // Continue without road conditions
      }
      
      // Search knowledge base for relevant context
      try {
        const knowledgeResults = await searchSimilar(question, 3);
        knowledgeContext = knowledgeResults
          .map((result, i) => `${i + 1}. ${result.text}`)
          .join('\n\n');
        console.log(`[Maple] Knowledge base results: ${knowledgeResults.length} entries`);
      } catch (error) {
        console.error('[Maple] Error searching knowledge base:', error);
        // Continue without knowledge context
      }
      
      // Try to get plow analysis (if plow data is available)
      try {
        // TODO: Fetch actual plow data when API is available
        // For now, this is a placeholder
        // const plows = await fetchPlowDataFromVTrans();
        // if (plows.length > 0) {
        //   const rating = calculateRoadSafetyRating(plows, location);
        //   const distribution = analyzePlowDistribution(plows);
        //   plowAnalysis = formatPlowAnalysisForAI(rating, distribution);
        // }
      } catch (error) {
        // Silently fail - plow analysis is optional
        console.log('[Maple] Plow analysis not available:', error);
      }
      
      // Log summary of data available
      console.log(`[Maple] Data summary - Current weather: ${currentWeather ? 'Yes' : 'No'}, Historical: ${historicalData.length} points, Road conditions: ${combinedRoadConditionsText.length > 0 ? 'Yes' : 'No'}, Knowledge: ${knowledgeContext.length > 0 ? 'Yes' : 'No'}`);
    }
    
    // Pass data to AI (weather data will be null/empty if not weather-related)
    const prediction = await getWeatherPrediction({ 
      question, 
      location: location || 'Vermont',
      currentWeather,
      historicalData,
      roadConditions: combinedRoadConditionsText,
      knowledgeContext,
      plowAnalysis,
    });
    
  return NextResponse.json({ prediction });
  } catch (error) {
    console.error('Error in POST:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}