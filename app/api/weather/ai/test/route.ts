import { getWeatherPrediction } from '@/lib/aiService';
import { fetchWeatherFromProvider } from '@/lib/unifiedWeatherService';
import { getHistoricalWeatherData, WeatherDataPoint } from '@/lib/supabaseQueries';
import { fetchAllRoadConditions, formatRoadConditionsForAI } from '@/lib/roadDataService';
import { getAllActiveRoadConditions, formatRoadConditionsForAI as formatVTransRoadConditions } from '@/lib/vtransService';
import { calculateDistrictRoadSafety, formatRoadSafetyRatingForAI } from '@/lib/districtRoadSafetyService';
import { predictSnowDay, predictSnowDaysForWeek, SnowDayPrediction, MultiDaySnowDayPredictions } from '@/lib/snowDayPredictionService';
import { searchSimilar } from '@/lib/vectorStore';
import { calculateRouteSafety, RouteSafetyAssessment } from '@/lib/routeSafetyService';
import { NextResponse } from 'next/server';

// Fetch weather alerts for the location
async function fetchWeatherAlerts(location: string) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/weather/alerts?location=${encodeURIComponent(location)}&limit=10`);
    if (response.ok) {
      const data = await response.json();
      return data.alerts || [];
    }
  } catch (error) {
    console.error('[Maple] Error fetching weather alerts:', error);
  }
  return [];
}

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
    
    // Fetch road conditions from ALL sources (NWS, TomTom, VTrans RWIS, VTrans Lane Closures, VTrans Incidents, Xweather, New England 511)
    const allRoadConditions = await fetchAllRoadConditions(location);
    const roadConditionsText = formatRoadConditionsForAI(allRoadConditions);
    console.log(`[Maple] Road conditions from all sources: ${allRoadConditions.length} total`);
    
    // Also get manual road conditions from Supabase (for user-submitted data)
    const manualRoadConditions = await getAllActiveRoadConditions();
    const manualRoadConditionsText = formatVTransRoadConditions(manualRoadConditions);
    
    // Combine automated and manual sources
    const combinedRoadConditionsText = roadConditionsText + '\n' + manualRoadConditionsText;
    
    // Search knowledge base for relevant context
    const knowledgeResults = await searchSimilar('What is the weather in Vermont?', 3);
    const knowledgeContext = knowledgeResults
      .map((result, i) => `${i + 1}. ${result.text}`)
      .join('\n\n');
    
    // Fetch active weather alerts
    const weatherAlerts = await fetchWeatherAlerts(location);
    
  const prediction = await getWeatherPrediction({
    question: 'What is the weather in Vermont?',
      location: location,
      currentWeather: currentWeather,
      historicalData: historicalData,
      roadConditions: combinedRoadConditionsText,
      knowledgeContext: knowledgeContext,
      ...(weatherAlerts.length > 0 && { weatherAlerts }),
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

// Extract destination location from "drive to X" questions
function extractDestinationFromQuestion(question: string): string | null {
  // Patterns like "drive to Burlington", "drive to X", "let my kid drive to X"
  const driveToMatch = question.match(/drive to\s+([a-z\s]+?)(?:\?|$|\.|,|from|with)/i);
  if (driveToMatch && driveToMatch[1]) {
    return driveToMatch[1].trim();
  }
  
  // Pattern "to Burlington" or "to X"
  const toMatch = question.match(/\bto\s+([a-z\s]+?)(?:\?|$|\.|,|from)/i);
  if (toMatch && toMatch[1] && !toMatch[1].includes('let') && !toMatch[1].includes('kid')) {
    return toMatch[1].trim();
  }
  
  return null;
}

// Extract origin location from questions like "from X to Y"
function extractOriginFromQuestion(question: string): string | null {
  // Pattern "from X to Y" or "from X"
  const fromMatch = question.match(/from\s+([a-z\s]+?)(?:\s+to|\?|$|\.|,)/i);
  if (fromMatch && fromMatch[1]) {
    return fromMatch[1].trim();
  }
  
  return null;
}

// Check if question is about route safety (should I let my kid drive, is it safe to drive to X, etc.)
function isRouteSafetyQuestion(question: string): boolean {
  const lowerQuestion = question.toLowerCase();
  return /should\s+i\s+let|let\s+my\s+kid|let\s+.*\s+drive|is\s+it\s+safe\s+to\s+drive|can\s+.*\s+drive\s+to|drive\s+to.*safe/i.test(lowerQuestion);
}

// Extract district identifier from question (zip code or district name)
function extractDistrictFromQuestion(question: string): string | null {
  const lowerQuestion = question.toLowerCase();
  
  // Check for zip code pattern
  const zipMatch = question.match(/\b\d{5}\b/);
  if (zipMatch) {
    return zipMatch[0];
  }
  
  // Check for common Vermont city/town names (including Colchester)
  const cityKeywords = [
    'colchester', 'burlington', 'montpelier', 'rutland', 'barre', 'cvu', 'champlain valley',
    'williston', 'charlotte', 'shelburne', 'hinesburg', 'brattleboro', 'bennington',
    'middlebury', 'saint albans', 'st albans', 'essex', 'south burlington', 'winooski',
    'milton', 'jericho', 'richmond', 'waterbury', 'stowe', 'morrisville', 'northfield'
  ];
  
  for (const keyword of cityKeywords) {
    if (lowerQuestion.includes(keyword)) {
      return keyword; // Return city name - calculateDistrictRoadSafety can use it
    }
  }
  
  return null;
}

export async function POST(request: Request) {
  try {
    const { question, location, conversationHistory } = await request.json();
    
    // Only fetch weather data if the question is weather-related
    const includeWeatherData = isWeatherRelated(question);
    
    let currentWeather;
    let historicalData: WeatherDataPoint[] = [];
    let combinedRoadConditionsText = '';
    let knowledgeContext = '';
    const plowAnalysis = '';
      let districtRoadSafety = '';
      let snowDayPrediction: SnowDayPrediction | null = null;
      let multiDaySnowDayPredictions: MultiDaySnowDayPredictions | null = null;
      let routeSafety: RouteSafetyAssessment | null = null;
      let weatherAlerts: Array<{
        id: string;
        name: string;
        type: string;
        severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme';
        title: string;
        body: string;
        expiresISO?: string;
        issueTimeISO?: string;
        source?: 'Xweather' | 'NWS';
      }> = [];
    
    // Check if this is a route safety question (should I let my kid drive, etc.)
    const isRouteQuestion = isRouteSafetyQuestion(question);
    const destination = isRouteQuestion ? extractDestinationFromQuestion(question) : null;
    const origin = isRouteQuestion ? extractOriginFromQuestion(question) : null;
    
    // Check if question is about a specific district or location
    const districtIdentifier = await extractDistrictFromQuestion(question);
    
    // If route safety question but no origin provided, prepare to ask
    const needsOrigin: boolean = isRouteQuestion && !!destination && !origin;
    
    if (includeWeatherData) {
      // Fetch current weather data from ALL available sources for comprehensive cross-reference
      // CRITICAL: For government use, we must use ALL sources to ensure accuracy
      // This allows Maple to cross-reference and cite multiple sources
      try {
        // Try fetching from multiple sources in parallel for comprehensive data
        const weatherSources = ['nws', 'weatherbit', 'weatherstack', 'visualcrossing', 'openweathermap', 'xweather'] as const;
        const weatherPromises = weatherSources.map(async (source) => {
          try {
            const data = await fetchWeatherFromProvider(location || 'Vermont', source);
            return { source, data, success: true };
          } catch (error) {
            return { source, error: error instanceof Error ? error.message : 'Unknown error', success: false };
          }
        });
        
        const weatherResults = await Promise.all(weatherPromises);
        const successfulSources = weatherResults.filter(r => r.success && r.data);
        
        if (successfulSources.length === 0) {
          throw new Error('No weather sources available');
        }
        
        // Use the primary source (first successful, prioritized by reliability)
        const primaryWeather = await fetchWeatherFromProvider(location || 'Vermont', 'auto');
        
        // Additional validation check (double-check data quality)
        if (!primaryWeather || !primaryWeather.temperature || !primaryWeather.timestamp) {
          throw new Error('Invalid weather data received from provider');
        }
        
        // Check data freshness (reject if older than 30 minutes for accuracy)
        const dataAge = Date.now() - new Date(primaryWeather.timestamp).getTime();
        const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
        if (dataAge > MAX_AGE_MS) {
          console.warn(`[Maple] Warning: Weather data is ${Math.round(dataAge / 60000)} minutes old - may be stale`);
        }
        
        // Include information about all available sources for AI context
        const availableSources = successfulSources.map(r => r.source).join(', ');
        const sourceCount = successfulSources.length;
        
        currentWeather = {
          location: primaryWeather.location,
          temperature: primaryWeather.temperature,
          humidity: primaryWeather.humidity,
          pressure: primaryWeather.pressure,
          description: primaryWeather.description,
          windSpeed: primaryWeather.windSpeed,
          timestamp: primaryWeather.timestamp,
          source: primaryWeather.source, // Primary source
        };
        console.log(`[Maple] Weather data from primary source: ${primaryWeather.source} (${sourceCount} total sources available: ${availableSources})`);
        
        // Store additional source info for AI context (will be added to prompt)
        (currentWeather as typeof currentWeather & { allAvailableSources: string; sourceCount: number }).allAvailableSources = availableSources;
        (currentWeather as typeof currentWeather & { allAvailableSources: string; sourceCount: number }).sourceCount = sourceCount;
      } catch (error) {
        console.error('[Maple] Error fetching weather data:', error);
        // For government deployment: This is critical - we should fail gracefully
        // but clearly indicate data is unavailable rather than guessing
        throw new Error(`Unable to retrieve current weather data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // Fetch historical weather data from Supabase (last 7 days)
      try {
        historicalData = await getHistoricalWeatherData(location || 'Vermont', 7);
        console.log(`[Maple] Historical data points retrieved: ${historicalData.length}`);
      } catch (error) {
        console.error('[Maple] Error fetching historical data:', error);
        // Continue without historical data
      }
      
      // Fetch road conditions from ALL sources simultaneously (NOT just one source)
      // fetchAllRoadConditions() aggregates data from ALL these sources:
      // - NWS (National Weather Service) - weather warnings
      // - TomTom Traffic - real-time traffic incidents with GPS
      // - VTrans RWIS - 40+ sensor stations with real-time conditions
      // - VTrans Lane Closures - construction/maintenance alerts
      // - VTrans Traffic Incidents - accidents/hazards/closures
      // - Xweather - road weather forecasts
      // - New England 511 - traffic and road condition data
      // All data is:
      // - Fetched from ALL sources (not just one)
      // - Validated (required fields, data types, GPS bounds, timestamps)
      // - Filtered (invalid entries removed)
      // - Cross-referenced for fact-checking
      // - Prioritized (official sources like VTrans/NWS prioritized over commercial APIs)
      try {
        const allRoadConditions = await fetchAllRoadConditions(location || 'Vermont');
        const roadConditionsText = formatRoadConditionsForAI(allRoadConditions);
        console.log(`[Maple] Road conditions from ALL sources: ${allRoadConditions.length} validated conditions (NWS, TomTom, VTrans RWIS, VTrans Closures, VTrans Incidents, Xweather, New England 511)`);
        
        // Also get manual road conditions from Supabase (for user-submitted data)
        const manualRoadConditions = await getAllActiveRoadConditions();
        const manualRoadConditionsText = formatVTransRoadConditions(manualRoadConditions);
        console.log(`[Maple] Manual road conditions retrieved: ${manualRoadConditions.length} entries`);
        
        // Combine automated (validated) and manual sources
        combinedRoadConditionsText = roadConditionsText + '\n' + manualRoadConditionsText;
      } catch (error) {
        console.error('[Maple] Error fetching road conditions:', error);
        // Continue without road conditions
      }

      // Fetch active weather alerts from both NWS and Xweather
      try {
        weatherAlerts = await fetchWeatherAlerts(location || 'Vermont');
        console.log(`[Maple] Active weather alerts: ${weatherAlerts.length} alert(s) from NWS and Xweather`);
      } catch (error) {
        console.error('[Maple] Error fetching weather alerts:', error);
        // Continue without alerts (weatherAlerts already initialized as empty array)
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
      
      // Calculate route safety if this is a route safety question with both origin and destination
      if (isRouteQuestion && destination && origin) {
        try {
          routeSafety = await calculateRouteSafety(origin, destination);
          if (routeSafety) {
            console.log(`[Maple] Route safety calculated: ${origin} → ${destination}, Score: ${routeSafety.overallSafetyScore}/100, Recommendation: ${routeSafety.recommendation}`);
          }
        } catch (error) {
          console.error('[Maple] Error calculating route safety:', error);
          // Continue without route safety - will use general road conditions
        }
      }
      
      // Calculate location-based road safety rating if location is mentioned (city, district, or zip)
      // This handles questions like "is it safe to drive to Colchester?" or "should I let my kid drive to [city]?"
      if (districtIdentifier) {
        try {
          // Try to get road safety for the location (could be district name, city name like "Colchester", or zip code)
          const safetyRating = await calculateDistrictRoadSafety(districtIdentifier);
          if (safetyRating) {
            districtRoadSafety = formatRoadSafetyRatingForAI(safetyRating);
            console.log(`[Maple] Road safety rating calculated for ${safetyRating.district}: ${safetyRating.rating} (${safetyRating.score}/100)`);
          } else {
            // If district lookup failed, we still have general road conditions for the location
            console.log(`[Maple] Location-specific rating not available for "${districtIdentifier}", using general road conditions`);
          }
        } catch (error) {
          console.error('[Maple] Error calculating location road safety:', error);
          // Continue without location-specific rating - will use general road conditions
        }
      }
      
      // Also fetch location-specific road conditions if a location is mentioned
      if (districtIdentifier && includeWeatherData) {
        try {
          // Get road conditions specifically for this location
          const locationConditions = await fetchAllRoadConditions(districtIdentifier);
          if (locationConditions.length > 0) {
            const locationConditionsText = formatRoadConditionsForAI(locationConditions);
            // Add location-specific conditions to the context
            combinedRoadConditionsText = `LOCATION-SPECIFIC ROAD CONDITIONS FOR ${districtIdentifier.toUpperCase()}:\n${locationConditionsText}\n\n` + combinedRoadConditionsText;
            console.log(`[Maple] Location-specific road conditions for ${districtIdentifier}: ${locationConditions.length} conditions`);
          }
        } catch (error) {
          // Silently continue - general road conditions will be used
        }
      }
      
      // Calculate snow day predictions if district/location is mentioned (for school cancellation decisions)
      // Check if question is about school closings/cancellations
      const isSchoolClosingQuestion = /school.*(clos|cancel|delay|dismissal)|(clos|cancel|delay|dismissal).*school|snow.*day|should.*close|next.*week|following.*week|this.*week|upcoming.*week/i.test(question);
      
      if ((districtIdentifier || isSchoolClosingQuestion) && includeWeatherData) {
        try {
          // Try to get multi-day predictions (tomorrow + next week) for the mentioned district
          const predictionTarget = districtIdentifier || location || 'Vermont';
          
          console.log(`[Maple] Generating multi-day snow day predictions for: ${predictionTarget} (school question: ${isSchoolClosingQuestion})`);
          
          // Always get multi-day predictions for comprehensive coverage
          const multiDayPredictions = await predictSnowDaysForWeek(predictionTarget);
          if (multiDayPredictions && multiDayPredictions.predictions.length > 0) {
            multiDaySnowDayPredictions = multiDayPredictions;
            console.log(`[Maple] ✅ Multi-day snow day predictions for ${multiDayPredictions.district_name}: ${multiDayPredictions.predictions.length} days generated`);
            console.log(`[Maple] Prediction dates: ${multiDayPredictions.predictions.map(p => p.predicted_for_date).join(', ')}`);
            
            // Also set single day prediction for tomorrow (first prediction) for backward compatibility
            snowDayPrediction = multiDayPredictions.predictions[0];
          } else {
            console.warn(`[Maple] ⚠️ Multi-day predictions failed or returned empty for ${predictionTarget}`);
            // Fallback to single day prediction if multi-day fails
            const prediction = await predictSnowDay(predictionTarget);
            if (prediction) {
              snowDayPrediction = prediction;
              console.log(`[Maple] Single day prediction for ${prediction.district_name}: Full closing ${prediction.full_closing_probability}%, Delay ${prediction.delay_probability}%, Confidence ${prediction.confidence}%`);
            } else {
              console.error(`[Maple] ❌ Failed to get any snow day predictions for ${predictionTarget}`);
            }
          }
        } catch (error) {
          console.error('[Maple] ❌ Error calculating snow day predictions:', error);
          console.error('[Maple] Error details:', error instanceof Error ? error.stack : error);
          // Continue without prediction - Maple can still provide general advice
        }
      } else {
        console.log(`[Maple] Skipping snow day predictions - district: ${!!districtIdentifier}, school question: ${isSchoolClosingQuestion}, weather data: ${includeWeatherData}`);
      }
      
      // Log summary of data available
      console.log(`[Maple] Data summary - Current weather: ${currentWeather ? 'Yes' : 'No'}, Historical: ${historicalData.length} points, Road conditions: ${combinedRoadConditionsText.length > 0 ? 'Yes' : 'No'}, Knowledge: ${knowledgeContext.length > 0 ? 'Yes' : 'No'}`);
    }
    
    // For weather-related questions, require current weather data (government accuracy requirement)
    if (includeWeatherData && !currentWeather) {
      return NextResponse.json(
        { 
          error: 'Unable to retrieve current weather data. Please try again in a moment.',
          details: 'Weather data is required for accurate responses.'
        },
        { status: 503 } // Service Unavailable
      );
    }
    
    // Pass data to AI (weather data will be null/empty if not weather-related)
    // Combine road conditions with district-specific safety rating
    const allRoadContext = districtRoadSafety 
      ? combinedRoadConditionsText + '\n' + districtRoadSafety
      : combinedRoadConditionsText;
    
    const prediction = await getWeatherPrediction({ 
      question, 
      location: location || 'Vermont',
      currentWeather,
      historicalData,
      roadConditions: allRoadContext,
      knowledgeContext,
      plowAnalysis,
      snowDayPrediction,
      multiDaySnowDayPredictions,
      ...(routeSafety && { routeSafety }),
      ...(needsOrigin && { needsOrigin }),
      ...(conversationHistory && { conversationHistory }),
      ...(weatherAlerts.length > 0 && { weatherAlerts }),
    });
    
    // Validate AI response is not empty
    if (!prediction || prediction.trim().length === 0) {
      return NextResponse.json(
        { 
          error: 'Unable to generate a response. Please try again.',
        },
        { status: 500 }
      );
    }
    
  return NextResponse.json({ 
    prediction,
    metadata: {
      dataSource: currentWeather?.source || 'N/A',
      timestamp: new Date().toISOString(),
      dataAvailable: {
        currentWeather: !!currentWeather,
        historicalData: historicalData.length > 0,
        roadConditions: combinedRoadConditionsText.length > 0,
        knowledgeBase: knowledgeContext.length > 0,
      }
    }
  });
  } catch (error) {
    console.error('Error in POST:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}