import { openai } from './openaiClient';

interface WeatherDataPoint {
  location: string;
  temperature: number;
  humidity: number;
  pressure: number;
  description: string;
  windSpeed: number;
  timestamp: string;
  source?: string; // Which API was used (NWS, Weatherstack, etc.)
}

interface PredictionRequest {
  question: string;
  location: string;
  historicalData?: WeatherDataPoint[];
  currentWeather?: WeatherDataPoint;
  roadConditions?: string; // Formatted road condition context
  knowledgeContext?: string; // Retrieved knowledge from vector store
  plowAnalysis?: string; // Plow truck analysis and safety rating
}

// Check if the question is weather-related
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

export async function getWeatherPrediction(request: PredictionRequest): Promise<string> {
  const { question, location, historicalData = [], currentWeather, roadConditions, knowledgeContext, plowAnalysis } = request;

  // Only include weather data if the question is weather-related
  const includeWeatherData = isWeatherRelated(question);

  // Build context - PRIORITIZE current/live API data first
  let context = '';
  
  // PRIMARY DATA SOURCE: Current weather from live APIs (NWS, Weatherstack, Visual Crossing, Xweather, OpenWeatherMap)
  if (includeWeatherData && currentWeather) {
    const source = (currentWeather as any).source || 'Live Weather API';
    context = `\n\n=== CURRENT WEATHER (LIVE API DATA) ===\n`;
    context += `This is REAL-TIME data from weather APIs. Use this as your PRIMARY source.\n`;
    context += `Data Source: ${source} (NWS, Weatherstack, Visual Crossing, Xweather, or OpenWeatherMap)\n`;
    context += `Location: ${currentWeather.location}\n`;
    context += `Temperature: ${currentWeather.temperature}°C\n`;
    context += `Condition: ${currentWeather.description}\n`;
    context += `Humidity: ${currentWeather.humidity}%\n`;
    context += `Pressure: ${currentWeather.pressure} hPa\n`;
    context += `Wind Speed: ${currentWeather.windSpeed} m/s\n`;
    context += `Timestamp: ${new Date(currentWeather.timestamp).toLocaleString()}\n`;
  }
  
  // SECONDARY DATA: Historical data for trends/context only
  if (includeWeatherData && historicalData.length > 0) {
    context += `\n\n=== HISTORICAL WEATHER DATA (for trends/context only) ===\n`;
    context += `Past 7 days - use this to identify patterns or trends, but PRIORITIZE current weather above:\n`;
    historicalData.slice(-10).forEach((data, index) => {
      const date = new Date(data.timestamp).toLocaleDateString();
      context += `${index + 1}. ${date}: ${data.temperature}°C, ${data.description}, Humidity: ${data.humidity}%, Pressure: ${data.pressure}hPa\n`;
    });
  }

  const systemPrompt = `You are Maple, a friendly bird weather assistant for Vermont. Talk like a real person - warm, natural, and helpful.

CRITICAL DATA RULES - THESE ARE MANDATORY:
- PRIMARY SOURCE: Always prioritize the "CURRENT WEATHER (LIVE API DATA)" section - this is real-time data from multiple weather APIs (NWS, Weatherstack, Visual Crossing, Xweather, OpenWeatherMap)
- SECONDARY SOURCE: Historical data is only for context/trends - do NOT use it as current conditions
- ROAD CONDITIONS: Use the Road Conditions data from NWS alerts and Xweather Road Weather API
- ONLY use the weather data provided to you in the user's message - DO NOT make up, guess, or hallucinate any weather information
- If specific data isn't provided (like temperature, conditions, road status), you MUST say "I don't have that information right now" rather than guessing
- Base your responses EXCLUSIVELY on the Current Weather (LIVE API DATA), Road Conditions, Historical Weather Data (for trends only), and Knowledge Base Information provided to you
- NEVER invent forecasts, temperatures, or conditions that weren't explicitly given to you
- NEVER confuse historical data with current conditions - if current weather is provided, that's what's happening NOW
- If the provided data is incomplete or missing, acknowledge that limitation honestly

CRITICAL RULES:
- ONLY provide weather information when the user explicitly asks about weather, temperature, road conditions, or safety
- For greetings (hi, hello, hey) or casual conversation, respond politely and conversationally WITHOUT giving weather data
- Keep it SHORT and SIMPLE - 1-3 sentences max, only go longer if it's a safety emergency
- No confusing jargon - explain things in plain English
- Be friendly and conversational, like you're texting a friend
- Use "I" and "you" naturally
- Skip unnecessary details - just give the key info
- If you don't know something, just say so simply

TONE:
- Very friendly and approachable
- Casual but helpful
- A bit playful when appropriate
- Serious when safety is involved

EXAMPLES OF GOOD RESPONSES:

For greetings/casual chat:
- "Hey! I'm Maple, your weather assistant for Vermont. How can I help you today?"
- "Hi there! Nice to meet you. I'm here to help with weather questions - what would you like to know?"
- "Hello! I'm Maple. Ask me anything about Vermont weather or road conditions!"

For weather questions:
- "Hey! It's looking like light snow tonight around 2°C. Roads might get a bit slick, so take it easy out there!"
- "I see rain coming in the next few hours with this humidity. Be sure to check out the rain page if it starts to get heavy!"
- "It's going to be chilly today - around 5°C and clear. Perfect for a walk!"

BAD EXAMPLES (what NOT to do):
- If user says "hi", DON'T respond with temperature/weather info
- If user says "hello", DON'T give a weather forecast
- Don't dump weather data unless specifically asked
- "Based on the comprehensive analysis of meteorological data points..." (too technical)
- "The current atmospheric conditions, when cross-referenced with regional climate models..." (too complex)`;

  // Add Vermont-specific context (only if weather-related)
  const vermontContext = includeWeatherData && (location.toLowerCase().includes('vermont') || location.toLowerCase().includes('vt'))
    ? `\n\nVermont Context:
- Vermont experiences harsh winters with significant snowfall
- The roads can get really slick and hard to drive on without snow tires or chains
- Spring flooding is common, especially in river valleys
- Mountain roads can be particularly dangerous in winter
- Black ice is a major concern during temperature fluctuations
- Road conditions can change rapidly in Vermont's variable climate`
    : '';

  // Add road conditions if available (only if weather-related)
  const roadContext = includeWeatherData && roadConditions ? `\n\n${roadConditions}` : '';

  // Add knowledge base context if available (only if weather-related)
  const knowledgeBaseContext = includeWeatherData && knowledgeContext 
    ? `\n\nRelevant Knowledge Base Information:\n${knowledgeContext}`
    : '';

  // Add plow analysis if available (only if weather-related)
  const plowContext = includeWeatherData && plowAnalysis 
    ? `\n\n${plowAnalysis}`
    : '';

  // Build the user prompt - only include weather context if relevant
  const userPrompt = includeWeatherData
    ? `IMPORTANT: Use ONLY the data provided below. Do NOT make up or guess any information.

DATA PRIORITY ORDER:
1. CURRENT WEATHER (LIVE API DATA) - This is your PRIMARY source for current conditions
2. ROAD CONDITIONS - Use this for road safety information
3. HISTORICAL DATA - Only use this for trends/patterns, NOT for current conditions
4. KNOWLEDGE BASE - Additional context information

Location: ${location}
${context}${roadContext ? `\n\n${roadContext}` : ''}${knowledgeBaseContext}${plowContext}${vermontContext}

User Question: ${question}

Respond as Maple - be friendly, brief, and clear. Use ONLY the data provided above, prioritizing CURRENT WEATHER (LIVE API DATA) as your primary source. If specific information isn't in the data above, say you don't have that information. Give the key info in 1-3 sentences. If it's dangerous, say so clearly but still keep it short.`
    : `User Question: ${question}

Respond as Maple - be friendly and conversational. This is NOT a weather question, so just respond naturally without providing weather data. Keep it brief (1-2 sentences).`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using a cost-effective model, can upgrade to gpt-4 if needed
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5, // Lower temperature for more factual, less creative responses
      max_tokens: 200, // Enough room to cite data sources if needed
    });

    return completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    throw new Error('Failed to get AI prediction');
  }
}


