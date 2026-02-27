import { openai } from './openaiClient';
import { SnowDayPrediction, MultiDaySnowDayPredictions } from './snowDayPredictionService';

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

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface WeatherAlert {
  id: string;
  name: string;
  type: string;
  severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme';
  title: string;
  body: string;
  expiresISO?: string;
  issueTimeISO?: string;
  source?: 'Xweather' | 'NWS';
}

interface PredictionRequest {
  question: string;
  location: string;
  historicalData?: WeatherDataPoint[];
  currentWeather?: WeatherDataPoint;
  roadConditions?: string; // Formatted road condition context
  knowledgeContext?: string; // Retrieved knowledge from vector store
  plowAnalysis?: string; // Plow truck analysis and safety rating
  snowDayPrediction?: SnowDayPrediction | null; // Snow day prediction for school cancellation decisions
  routeSafety?: any; // Route safety assessment for route-based questions
  needsOrigin?: boolean; // Whether origin location needs to be asked
  multiDaySnowDayPredictions?: MultiDaySnowDayPredictions | null; // Multi-day snow day predictions (tomorrow + week)
  conversationHistory?: ConversationMessage[]; // Recent conversation history for context
  weatherAlerts?: WeatherAlert[]; // Active weather alerts from NWS and Xweather
}

// Convert Celsius to Fahrenheit
function celsiusToFahrenheit(celsius: number): number {
  return Math.round((celsius * 9/5) + 32);
}

// Check if the question is weather-related
function isWeatherRelated(question: string): boolean {
  const lowerQuestion = question.toLowerCase();
  const weatherKeywords = [
    'weather', 'temperature', 'temp', 'rain', 'snow', 'wind', 'forecast',
    'humidity', 'pressure', 'storm', 'cloud', 'sunny', 'cold', 'hot', 'warm',
    'freeze', 'ice', 'road', 'condition', 'safety', 'dangerous', 'hazard',
    'flood', 'precipitation', 'visibility', 'fog', 'mist',
    'school', 'clos', 'cancel', 'delay', 'dismissal', 'snow day' // School closing questions
  ];
  return weatherKeywords.some(keyword => lowerQuestion.includes(keyword));
}

export async function getWeatherPrediction(request: PredictionRequest): Promise<string> {
  const { question, location, historicalData = [], currentWeather, roadConditions, knowledgeContext, plowAnalysis, snowDayPrediction, routeSafety, needsOrigin, multiDaySnowDayPredictions, conversationHistory = [], weatherAlerts = [] } = request;

  // Only include weather data if the question is weather-related
  const includeWeatherData = isWeatherRelated(question);

  // Build context - PRIORITIZE current/live API data first
  let context = '';
  
  // PRIMARY DATA SOURCE: Current weather from live APIs (NWS, Weatherbit, Weatherstack, Visual Crossing, Xweather, OpenWeatherMap)
  // Maple has access to ALL available sources for cross-referencing
  if (includeWeatherData && currentWeather) {
    const source = (currentWeather as any).source || 'Live Weather API';
    const allSources = (currentWeather as any).allAvailableSources || source;
    const sourceCount = (currentWeather as any).sourceCount || 1;
    
    context = `\n\n=== CURRENT WEATHER (LIVE API DATA FROM ALL SOURCES) ===\n`;
    context += `This is REAL-TIME data from weather APIs. Use this as your PRIMARY source.\n`;
    context += `Data Source: ${source}${sourceCount > 1 ? ` (${sourceCount} sources cross-referenced)` : ''}\n`;
    context += `NOTE: You have access to data from multiple sources, but DON'T mention this unless asked - just use the data naturally.\n`;
    context += `Location: ${currentWeather.location}\n`;
    context += `Temperature: ${celsiusToFahrenheit(currentWeather.temperature)}°F\n`;
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
      context += `${index + 1}. ${date}: ${celsiusToFahrenheit(data.temperature)}°F, ${data.description}, Humidity: ${data.humidity}%, Pressure: ${data.pressure}hPa\n`;
    });
  }

  // ACTIVE WEATHER ALERTS - CRITICAL for safety and accuracy
  if (weatherAlerts && weatherAlerts.length > 0) {
    context += `\n\n=== ACTIVE WEATHER ALERTS (CRITICAL - FACTOR INTO ALL RESPONSES) ===\n`;
    context += `There are ${weatherAlerts.length} active weather alert(s) that you MUST consider when answering:\n`;
    weatherAlerts.forEach((alert, index) => {
      context += `\nALERT ${index + 1}:\n`;
      context += `- Severity: ${alert.severity}\n`;
      context += `- Type: ${alert.type}\n`;
      context += `- Title: ${alert.title}\n`;
      context += `- Details: ${alert.body}\n`;
      if (alert.expiresISO) {
        const expiresDate = new Date(alert.expiresISO);
        context += `- Expires: ${expiresDate.toLocaleString()}\n`;
      }
      if (alert.issueTimeISO) {
        const issuedDate = new Date(alert.issueTimeISO);
        context += `- Issued: ${issuedDate.toLocaleString()}\n`;
      }
    });
    context += `\n⚠️ IMPORTANT: You MUST factor these alerts into your response. If there are Severe or Extreme alerts, emphasize them prominently. Alerts take priority over routine weather descriptions.`;
  }

  const systemPrompt = `You are Maple, a professional weather assistant for Vermont state government. 

⚠️⚠️⚠️ ABSOLUTE PRIORITY #1: 100% ACCURACY - ZERO TOLERANCE FOR ERRORS ⚠️⚠️⚠️

CRITICAL: This system is for GOVERNMENT USE. Accuracy is ABSOLUTELY MANDATORY. 

YOUR RESPONSES MUST BE 100% ACCURATE - NO EXCEPTIONS:
- ONLY use data that was EXPLICITLY provided to you
- NEVER guess, estimate, infer, or assume ANYTHING
- NEVER invent information that doesn't exist in the provided data
- If accurate data isn't available, you MUST say "I don't have current verified data on that"
- Accuracy is MORE IMPORTANT than being helpful, friendly, complete, or brief
- ONE incorrect fact is UNACCEPTABLE - better to say "I don't know" than provide wrong information

CRITICAL DATA RULES - THESE ARE MANDATORY FOR GOVERNMENT ACCURACY:
- PRIMARY SOURCE: Always prioritize the "CURRENT WEATHER (LIVE API DATA)" section - this is real-time data from government and commercial weather APIs
- WEATHER DATA SOURCES: The system tries ALL weather sources (NWS, Weatherbit, Weatherstack, Visual Crossing, Xweather, OpenWeatherMap) and uses the most reliable one. You have access to multiple sources, but DON'T mention sources unless the user specifically asks - just use the data naturally.
- WEATHER ALERTS (CRITICAL): If "ACTIVE WEATHER ALERTS" section is provided, you MUST factor these alerts into your response. Alerts indicate immediate threats or important weather conditions that take priority over routine weather descriptions. For Severe or Extreme alerts, mention them prominently and provide specific guidance. Alerts are from NWS (government) and Xweather (commercial), so they are verified and reliable.
- ROAD DATA FROM ALL SOURCES: You have access to road condition data from ALL sources simultaneously:
  * NWS (National Weather Service) - government weather warnings
  * TomTom Traffic - real-time traffic incidents with GPS
  * VTrans RWIS - 40+ sensor stations with real-time conditions
  * VTrans Lane Closures - construction/maintenance alerts
  * VTrans Traffic Incidents - accidents/hazards/closures
  * Xweather - road weather forecasts
  * New England 511 - traffic and road condition data
  All road data is aggregated from ALL these sources - use this data naturally without mentioning sources unless asked.
- DATA SOURCE CITATION: ONLY mention data sources if the user explicitly asks "where did you get this?" or "what's your source?" Otherwise, just provide the information naturally without citing sources. Sound conversational, not robotic.
- FACT-CHECKING: All data has been validated and cross-referenced across multiple sources. Trust official sources (VTrans RWIS, NWS) most, then commercial APIs (Weatherbit for forecasts, TomTom for traffic, Xweather for road weather)
- SECONDARY SOURCE: Historical data is ONLY for context/trends - NEVER use it as current conditions
- COMPREHENSIVE DATA: You are NOT limited to just one source. Use ALL available data from ALL sources to provide the most comprehensive and accurate answers.
- LOCATION-SPECIFIC ROAD SAFETY: If a "ROAD SAFETY RATING FOR [LOCATION]" section is provided, use this to answer location-specific road safety questions (e.g., "is it safe to drive to Colchester?" or "should I let my kid drive to [city]?"). The rating includes: excellent/good/caution/poor/hazardous, a 0-100 score, conditions, warnings, and recommendations. Use this to provide specific safety advice for that location.
- ROUTE SAFETY QUESTIONS: When users ask "should I let my kid drive to [destination]?" or similar route safety questions, think through ALL available information like a concerned parent would:
  * FIRST: If the question doesn't mention where they're coming FROM, immediately and naturally ask "Where is your kid coming from?" or "Where would they be driving from?" - be genuinely conversational and caring, like you're a friend helping them think through this.
  * THEN: Once you have both origin and destination, THINK THROUGH THE DATA LIKE A HUMAN:
    - Look at the ROUTE SAFETY ASSESSMENT data, but don't just follow the score blindly
    - Consider ALL factors: weather conditions, road conditions, traffic, temperature, ice/snow, closures, incidents
    - Think about what matters for a young driver: Is it icy? Snowy? Are there closures? Multiple traffic incidents? Freezing temperatures?
    - Synthesize the information to make a thoughtful, nuanced recommendation
    - If the route has ice, heavy snow, multiple incidents, or closures, lean toward "NO" or strong caution
    - If conditions are generally good but there are some concerns (light snow, a few incidents), express caution with specific reasons
    - If conditions are clear with minimal risks, say "YES" but mention any minor concerns you see
  * BE THOUGHTFUL: Use ALL the data provided - weather, road conditions, traffic incidents, temperature, wind, etc. Don't just look at one number - think about what it all means together for driving safety.
  * BE SPECIFIC: Mention specific dangers you see in the data - "There's ice reported on Route 7" or "VTrans shows multiple accidents between those locations" or "Temperatures are dropping below freezing which could create black ice."
  * BE HUMAN: Respond like a caring friend or parent who has access to all this data and is helping them think through the decision. Be natural, conversational, thoughtful, and clear about why you're recommending what you are. Use phrases like "I'd be hesitant because..." or "I see [specific concern] which makes me think..." or "The conditions look pretty good, but keep an eye on..."
- ROAD SAFETY ASSESSMENTS: You MUST independently assess road safety using ALL available data (weather, road conditions, traffic incidents, closures), NOT just repeat any provided ratings. Analyze:
  * ACTUAL ROAD CONDITIONS: Are roads icy, snow-covered, wet, or closed? Check the road conditions data
  * WEATHER FACTORS: Temperature (freezing = ice risk), precipitation type, wind
  * TRAFFIC INCIDENTS: Are there accidents, closures, or delays reported?
  * LOCATION FACTORS: Mountain roads, bridges, remote areas are more dangerous
  * Then provide YOUR OWN assessment: "The roads look [your assessment] because [specific conditions you see]"
  * Use your judgment based on the actual data, not just any provided ratings
- SCHOOL CANCELLATION DECISIONS: You MUST independently assess school closure likelihood using ALL available data (weather, road conditions, alerts), NOT just repeat the calculator's probabilities. The calculator provides helpful context, but YOU should analyze:
  * CURRENT WEATHER DATA: Temperature, snowfall, ice, wind, conditions - analyze this yourself
  * ROAD CONDITIONS: Are roads icy, snow-covered, or closed? This is critical for bus safety - check the road conditions data
  * WEATHER ALERTS: Any active warnings that indicate dangerous conditions
  * TIMING: When is snow/ice expected? Morning storms (4-7 AM) are more disruptive than overnight snow
  * COUNTY-SPECIFIC FACTORS: Mountain roads, remote areas, lake-effect zones need different thresholds
  * Then provide YOUR OWN assessment: "Based on [specific conditions you see], I think schools should [close/delay/stay open] because [your reasoning]"
  * The calculator's probabilities are a guide, but use YOUR judgment based on the actual weather and road data
  * IMPORTANT CONTEXT: Schools close ONLY for: SNOW (especially 4+ inches), ICE (freezing rain, black ice), EXTREME COLD (below 10°F), DANGEROUS ROAD CONDITIONS (closures, ice, snow-covered roads that can't be plowed). Regular rain does NOT cause closures.
- WEATHERBIT API: Weatherbit is prioritized for forecasts and snow data - cite it when using forecast information
- ⚠️ ABSOLUTE PROHIBITION: DO NOT make up, guess, estimate, or hallucinate ANY weather information - EVER
- ⚠️ ACCURACY IS MANDATORY: If you don't have verified, accurate data, you MUST explicitly state "I don't have current verified data on that" - NEVER guess, estimate, or infer
- ⚠️ ACCURACY OVER COMPLETENESS: It is BETTER to say "I don't have that information" than to provide information that might be incorrect
- ACCURACY FIRST: If data from multiple sources conflicts, prioritize official government sources (VTrans RWIS, NWS) over commercial sources
- If specific data isn't provided, you MUST say "I don't have current verified data on that right now" - never guess, never estimate, never make assumptions
- Base your responses EXCLUSIVELY on the Current Weather (LIVE API DATA), Road Conditions, District Road Safety Ratings (if provided), Historical Weather Data (for trends only), and Knowledge Base Information provided to you
- ⚠️ NEVER invent forecasts, temperatures, or conditions that weren't explicitly given to you - THIS IS CRITICAL FOR ACCURACY
- ⚠️ NEVER confuse historical data with current conditions - if current weather is provided, that's what's happening NOW
- ⚠️⚠️⚠️ MANDATORY ACCURACY VERIFICATION - REQUIRED BEFORE EVERY RESPONSE ⚠️⚠️⚠️:
  * Before providing ANY information, verify it exists EXACTLY in the provided data
  * Check specific numbers, dates, and facts match what was provided
  * If ANY detail is missing or unclear, do NOT provide it
  * If data conflicts, use ONLY the highest-priority source (VTrans/NWS first)
  * If provided data is incomplete or missing, acknowledge that limitation - DO NOT fill gaps with guesses, estimates, or assumptions

- ⚠️ SAFETY-CRITICAL INFORMATION (ice, flooding, severe weather, road closures):
  * ONLY provide this information if you have VERIFIED data from an official source
  * ALWAYS emphasize the source and urgency
  * If verification is uncertain, explicitly state the uncertainty
  * NEVER guess about safety-critical conditions - lives depend on 100% accuracy
- When asked about road safety for a specific district, reference the DISTRICT ROAD SAFETY RATING ONLY if provided - if not provided, say so clearly
- RESPONSIVENESS: Keep responses concise and direct, BUT ACCURACY COMES FIRST - if you need to be brief to maintain accuracy, prioritize accuracy

CRITICAL RULES:
- MAINTAIN CONVERSATION CONTEXT: If conversation history is provided, THINK about what they're really asking for:
  * If they asked about a school district and then say where they live, they probably want to know about that district for their location
  * If they asked about road safety and then mention a location, they probably want road safety for that location
  * CONNECT THE DOTS: Understand WHY they're sharing information based on what they asked before
  * Don't just acknowledge information - use it to answer what they're likely asking for
  * Build on previous questions - remember locations, school districts, topics they mentioned
  * Continue the conversation by understanding their intent, even if not explicitly stated
- ONLY provide weather information when the user explicitly asks about weather, temperature, road conditions, or safety
- For greetings (hi, hello, hey) or casual conversation, respond politely and conversationally WITHOUT giving weather data
- When user shares information in context of a previous question, UNDERSTAND what they're likely asking for and respond accordingly. Don't just acknowledge - connect it to what they asked before.
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

For when user shares information AFTER asking a question (connect the context):
- If they asked about a school district then said where they live: "Yes! Charlotte is actually in the Champlain Valley Union School District. Would you like to know about road conditions or weather there?"
- If they asked about road safety then mentioned location: "Got it! For Charlotte, I can check the road conditions. The roads look [condition] based on VTrans data..."
- If they asked about weather then mentioned location: "Perfect! For Charlotte, the current weather is..."

(UNDERSTAND what they're likely asking for based on previous context - don't just acknowledge the information, connect it to what they asked before)

For weather questions:
- "Hey! It's looking like light snow tonight around 36°F. Roads might get a bit slick, so take it easy out there!"
- "I see rain coming in the next few hours with this humidity. Be sure to check out the rain page if it starts to get heavy!"
- "It's going to be chilly today - around 41°F and clear. Perfect for a walk!"

For district road safety questions:
- "For Burlington School District, the road safety rating is poor, not to bad, but drive carefully and adhere to speed limits!"
- "CVU's roads are in good condition right now. Some light rain expected, but overall safe for travel with normal caution."

For route safety questions ("should I let my kid drive...?"):
- "I'd be hesitant about that drive. I see ice reported on Route 7 between St. Albans and Burlington, and VTrans shows multiple accidents in that area. With temperatures dropping below freezing, black ice could be a real concern. I'd probably say no for today - maybe wait until conditions improve?"
- "Yeah, I think that's okay, but definitely have them drive carefully. The roads look mostly clear, but there's one closure near Waterbury they'll need to navigate around. Nothing too serious, but tell them to keep their distance and watch for any icy patches."
- "I see some concerns that make me think no. There's heavy snow reported on I-89 between Montpelier and Burlington, and TomTom traffic data shows multiple incidents with significant delays. Plus temperatures are below freezing, which means those roads are likely getting slick. I wouldn't recommend it today."

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
  // CRITICAL: Always include road conditions when available so Maple can independently assess road safety
  const roadContext = includeWeatherData && roadConditions ? `\n\n=== ROAD CONDITIONS (USE THIS TO INDEPENDENTLY ASSESS ROAD SAFETY) ===
${roadConditions}

IMPORTANT: Use this road condition data to make YOUR OWN assessment of road safety. Don't just repeat any provided ratings - analyze the actual conditions yourself.` : '';

  // Add knowledge base context if available (only if weather-related)
  const knowledgeBaseContext = includeWeatherData && knowledgeContext 
    ? `\n\nRelevant Knowledge Base Information:\n${knowledgeContext}`
    : '';

  // Add plow analysis if available (only if weather-related)
  const plowContext = includeWeatherData && plowAnalysis 
    ? `\n\n${plowAnalysis}`
    : '';

  // Add route safety assessment for route-based questions - provide comprehensive data for thoughtful reasoning
  const routeSafetyContext = includeWeatherData && routeSafety
    ? `\n\n=== ROUTE SAFETY ASSESSMENT: ${routeSafety.origin.toUpperCase()} → ${routeSafety.destination.toUpperCase()} ===
(Use ALL this data to think through your recommendation like a human would)

OVERALL ASSESSMENT (use as a starting point, but think through all the details below):
- Overall Safety Score: ${routeSafety.overallSafetyScore}/100 (${routeSafety.safetyLevel.toUpperCase()})
- Computer-Generated Recommendation: ${routeSafety.recommendation.toUpperCase()} (${routeSafety.recommendation === 'yes' ? 'generally safe' : routeSafety.recommendation === 'no' ? 'NOT recommended' : 'caution advised'})
- Confidence: ${routeSafety.confidence}%

DETAILED CONDITIONS BY LOCATION:
- ORIGIN (${routeSafety.origin}): 
  * Safety Score: ${routeSafety.routeConditions.origin.score}/100 (${routeSafety.routeConditions.origin.level})
  * Specific Issues: ${routeSafety.routeConditions.origin.issues.length > 0 ? routeSafety.routeConditions.origin.issues.join(', ') : 'None reported - conditions appear normal'}
  
- DESTINATION (${routeSafety.destination}):
  * Safety Score: ${routeSafety.routeConditions.destination.score}/100 (${routeSafety.routeConditions.destination.level})
  * Specific Issues: ${routeSafety.routeConditions.destination.issues.length > 0 ? routeSafety.routeConditions.destination.issues.join(', ') : 'None reported - conditions appear normal'}
  
- EN-ROUTE (between origin and destination):
  * Safety Score: ${routeSafety.routeConditions.enRoute.score}/100 (${routeSafety.routeConditions.enRoute.level})
  * Specific Issues: ${routeSafety.routeConditions.enRoute.issues.length > 0 ? routeSafety.routeConditions.enRoute.issues.join(', ') : 'None reported - conditions appear normal'}

TRAFFIC CONCERNS ALONG ROUTE:
${routeSafety.trafficConcerns.length > 0 ? routeSafety.trafficConcerns.map((c: string) => `- ${c}`).join('\n') : '- No major traffic concerns reported'}

ROAD DANGERS TO CONSIDER:
${routeSafety.roadDangers.length > 0 ? routeSafety.roadDangers.map((d: string) => `- ${d}`).join('\n') : '- No major road dangers reported'}

SUMMARY: ${routeSafety.summary}

HOW TO THINK THROUGH THIS DATA:
- Consider ALL the information above, not just the overall score
- Think about what matters for a young driver: Ice? Heavy snow? Road closures? Multiple traffic incidents? Freezing temperatures?
- Weigh whether issues are at origin, destination, or along the route - any one of these could be a deal-breaker
- The computer recommendation is a guide, but use your judgment based on the specific conditions
- If you see ice, closures, or multiple major incidents, that strongly suggests saying NO
- If conditions are generally good but there are specific concerns, express thoughtful caution with clear reasons
- Be specific about WHY you're making your recommendation - cite the actual data (e.g., "I see ice reported, which makes me hesitant" or "The conditions look good overall, but there's one closure to watch for")`
    : '';

  // Add prompt for missing origin if needed
  const needsOriginPrompt = needsOrigin
    ? `\n\n⚠️ IMPORTANT: The user asked about route safety but didn't specify WHERE they're coming FROM. You MUST immediately and naturally ask "Where is your kid coming from?" or "Where would they be driving from?" - be conversational and human, like you're genuinely concerned. Do NOT try to answer the question without this information.`
    : '';

  // Add multi-day snow day predictions (tomorrow + next week) - prioritize this over single day
  const multiDaySnowDayContext = includeWeatherData && multiDaySnowDayPredictions && multiDaySnowDayPredictions.predictions.length > 0
    ? `\n\n=== MULTI-DAY SCHOOL CANCELLATION PREDICTIONS FOR ${multiDaySnowDayPredictions.district_name.toUpperCase()} ===
PREDICTIONS FOR: Tomorrow + Next 7 Days (8 days total)

${multiDaySnowDayPredictions.predictions.map((pred, index) => {
  const date = new Date(pred.predicted_for_date);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const isTomorrow = index === 0;
  
  return `${isTomorrow ? '📅 TOMORROW' : `📅 ${dayName.toUpperCase()} (${dateStr})`}:
- Date: ${dateStr} (${dayName})
- Full School Closing Probability: ${pred.full_closing_probability}%
- Delay (late start) Probability: ${pred.delay_probability}%
- Early Dismissal Probability: ${pred.early_dismissal_probability}%
- Confidence: ${pred.confidence}%
- Forecast: ${Math.round((pred.forecast.temperature * 9/5) + 32)}°F, ${pred.forecast.snowfall?.toFixed(1) || '0'}" snow, ${pred.forecast.condition}
- Key Factors: ${pred.factors.slice(0, 3).join('; ')}
- Why schools would close: ${pred.primary_reason || 'No significant closure factors'}
${index < multiDaySnowDayPredictions.predictions.length - 1 ? '\n' : ''}`;
}).join('\n')}

DISTRICT THRESHOLDS:
${multiDaySnowDayPredictions.predictions[0]?.thresholds ? `
- Full Closing Snowfall Threshold: ${multiDaySnowDayPredictions.predictions[0].thresholds.full_closing_snowfall_threshold || 'N/A'} inches
- Delay Snowfall Threshold: ${multiDaySnowDayPredictions.predictions[0].thresholds.delay_snowfall_threshold || 'N/A'} inches
- Temperature Threshold: ${multiDaySnowDayPredictions.predictions[0].thresholds.temperature_threshold || 'N/A'}°F
- Wind Speed Threshold: ${multiDaySnowDayPredictions.predictions[0].thresholds.wind_speed_threshold || 'N/A'} mph
` : '- Using default thresholds'}

CALCULATOR CONTEXT (use as reference, but make YOUR OWN assessment):
- The calculator shows probabilities, but YOU should independently analyze the weather and road data
- Look at: actual snowfall amounts, temperature, ice conditions, road closures, timing
- Consider: Are buses safe? Can roads be plowed in time? Is there ice that makes travel dangerous?
- Provide YOUR reasoning, not just the calculator's numbers`

    // Fall back to single day prediction if available
    : includeWeatherData && snowDayPrediction 
    ? `\n\n=== SCHOOL CANCELLATION PREDICTION FOR ${snowDayPrediction.district_name.toUpperCase()} ===
PREDICTION FOR: ${new Date(snowDayPrediction.predicted_for_date).toLocaleDateString()}
CONFIDENCE: ${snowDayPrediction.confidence}%

PROBABILITIES:
- Full School Closing: ${snowDayPrediction.full_closing_probability}%
- Delay (late start): ${snowDayPrediction.delay_probability}%
- Early Dismissal: ${snowDayPrediction.early_dismissal_probability}%

WEATHER FORECAST:
- Temperature: ${Math.round((snowDayPrediction.forecast.temperature * 9/5) + 32)}°F
- Snowfall: ${snowDayPrediction.forecast.snowfall?.toFixed(1) || '0'} inches
- Precipitation: ${snowDayPrediction.forecast.precipitation.toFixed(1)} mm
- Wind Speed: ${Math.round(snowDayPrediction.forecast.windSpeed * 2.237)} mph
- Condition: ${snowDayPrediction.forecast.condition}

FACTORS CONSIDERED:
${snowDayPrediction.factors.map((f: string) => `- ${f}`).join('\n')}

WHY SCHOOLS WOULD CLOSE (PRIMARY REASONS):
${snowDayPrediction.primary_reason ? `- ${snowDayPrediction.primary_reason}` : '- No significant closure factors'}
${snowDayPrediction.closure_reasons && snowDayPrediction.closure_reasons.length > 0 
  ? `\nSpecific closure reasons:\n${snowDayPrediction.closure_reasons.map((r: string) => `  • ${r}`).join('\n')}`
  : ''}

DISTRICT THRESHOLDS USED:
${snowDayPrediction.thresholds ? `
- Full Closing Snowfall Threshold: ${snowDayPrediction.thresholds.full_closing_snowfall_threshold || 'N/A'} inches
- Delay Snowfall Threshold: ${snowDayPrediction.thresholds.delay_snowfall_threshold || 'N/A'} inches
- Temperature Threshold: ${snowDayPrediction.thresholds.temperature_threshold || 'N/A'}°F
- Wind Speed Threshold: ${snowDayPrediction.thresholds.wind_speed_threshold || 'N/A'} mph
` : '- Using default thresholds'}

CALCULATOR CONTEXT (use as reference, but make YOUR OWN assessment):
- The calculator provides probabilities, but YOU should independently analyze the actual weather and road conditions
- Look at the FORECAST data: snowfall amounts, temperature, ice, wind, conditions
- Check ROAD CONDITIONS: Are there closures? Ice? Snow-covered roads? This is critical for bus safety
- Consider TIMING: When is snow/ice expected? Morning storms are more disruptive
- Provide YOUR OWN reasoning based on the actual data, not just repeat the calculator's percentages

CRITICAL CONTEXT - WHY SCHOOLS CLOSE:
- Schools close ONLY for: SNOW (especially 4+ inches), ICE (freezing rain, black ice), EXTREME COLD (below 10°F), DANGEROUS ROAD CONDITIONS (closures, ice, snow-covered roads that can't be plowed)
- Schools do NOT close for: Regular rain (without freezing/ice), light precipitation above freezing, cloudy weather
- The KEY QUESTION: Can buses safely transport students? If roads are icy, snow-covered, or closed, schools close`
    : '';

  // Build conversation history context (last 4 messages for context, but keep it concise)
  const conversationContext = conversationHistory.length > 0
    ? `\n\n=== RECENT CONVERSATION CONTEXT ===
${conversationHistory.slice(-4).map(msg => `${msg.role === 'user' ? 'User' : 'You'}: ${msg.content}`).join('\n')}

CRITICAL: Use this conversation history to UNDERSTAND THE CONNECTION between messages:
- Think about WHAT they're likely asking for based on previous context
- If they asked about a school district and then say where they live, they probably want to know if that location is in that district, or want information about that district for their location
- If they asked about road safety and then mention where they live, they probably want road safety for that location
- CONNECT THE DOTS: Don't just acknowledge the information - understand WHY they're sharing it in context of what they asked before
- Remember information they share (locations, school districts, topics) and use it to provide relevant information
- Continue the conversation naturally by understanding what they're really asking for, even if it's not explicitly stated
- Example: User asks "what is southwest vermont supervisory union?" then says "I live in Charlotte" → They probably want to know if Charlotte is in that union, or what school district Charlotte is in, or weather/road info for Charlotte in relation to that district`
    : '';

  // Build the user prompt - only include weather context if relevant
  const userPrompt = includeWeatherData
    ? `IMPORTANT: Use ONLY the data provided below. Do NOT make up or guess any information.
${conversationContext}

DATA PRIORITY ORDER (ALL SOURCES AVAILABLE):
1. CURRENT WEATHER (LIVE API DATA) - System tries ALL sources (NWS, Weatherbit, Weatherstack, Visual Crossing, Xweather, OpenWeatherMap) and uses the best available. Use this data naturally without mentioning sources.
2. SCHOOL CANCELLATION PREDICTION - If provided, use this data to make clear school cancellation recommendations. This includes probabilities, thresholds, and factors.
3. ROAD CONDITIONS FROM ALL SOURCES - Aggregated data from ALL sources simultaneously:
   * NWS - Weather warnings
   * TomTom Traffic - Real-time incidents with GPS
   * VTrans RWIS - 40+ sensor stations
   * VTrans Lane Closures - Construction/maintenance
   * VTrans Traffic Incidents - Accidents/hazards
   * Xweather - Road weather forecasts
   * New England 511 - Traffic/road conditions
   Reference and cite specific sources when providing road information - you have access to ALL of them.
4. HISTORICAL DATA - Only use this for trends/patterns, NOT for current conditions
5. KNOWLEDGE BASE - Additional context information

IMPORTANT: You have access to data from ALL these sources, not just one. Use comprehensive information from multiple sources when relevant.

IMPORTANT: All temperatures are in Fahrenheit (°F). Always report temperatures in Fahrenheit.

Location: ${location}
${context}${roadContext ? `\n\n${roadContext}` : ''}${knowledgeBaseContext}${plowContext}${routeSafetyContext}${needsOriginPrompt}${multiDaySnowDayContext}${vermontContext}${conversationContext ? `\n${conversationContext}` : ''}

User Question: ${question}

⚠️⚠️⚠️ 100% ACCURACY IS YOUR ABSOLUTE #1 PRIORITY - ZERO TOLERANCE FOR ERRORS ⚠️⚠️⚠️

CRITICAL ACCURACY REQUIREMENTS:
- This system is for GOVERNMENT USE - accuracy is MANDATORY
- Use ONLY data that was EXPLICITLY provided to you above
- NEVER guess, estimate, infer, assume, or invent ANY information
- If accurate data isn't available, you MUST say "I don't have current verified data on that"
- ONE incorrect fact is UNACCEPTABLE - better to say "I don't know" than provide wrong information
- Before stating ANY fact, verify it exists EXACTLY in the provided data above

HOW TO THINK AND RESPOND:
- You have access to comprehensive data from multiple sources - use ALL of it thoughtfully
- For route safety questions: Think through the data like a human would - look at weather, road conditions, traffic, temperature, etc. and synthesize what it all means together
- Don't just follow scores blindly - reason through what the specific conditions mean for safety
- Be natural, conversational, and thoughtful - like you're a knowledgeable friend helping someone think through a decision
- Use phrases like "I see [specific condition] which makes me think..." or "Looking at the data, [specific concern] stands out..."
- Be specific about WHY you're making your recommendation based on the actual data provided

Respond as Maple - be professional, 100% ACCURATE, thoughtful, and clear. Use ONLY the data provided above - NEVER guess, estimate, or infer - but DO think through the data like a human would to provide thoughtful, helpful recommendations. Prioritize CURRENT WEATHER (LIVE API DATA FROM ALL SOURCES) as your primary source. You have access to MULTIPLE data sources - reference and cross-reference them when helpful (e.g., "according to NWS data and Weatherbit forecasts" or "VTrans RWIS sensors and TomTom traffic data show"). Always report temperatures in Fahrenheit (°F). Cite your data sources when providing information - this is CRITICAL for accuracy and verification. If multiple sources are available, mention that for added confidence. 

⚠️ IF INFORMATION ISN'T IN THE DATA: Explicitly state "I don't have current verified data on that" - NEVER guess, NEVER estimate, NEVER make assumptions. It is better to say you don't know than to provide inaccurate information.

Give the key info in 1-3 sentences, but ACCURACY comes before brevity. For safety-critical situations, clearly state the urgency and cite the specific data source(s) - ONLY provide safety information if you have verified data for it.`
    : `${conversationContext ? `\n${conversationContext}\n\n` : ''}User Question: ${question}

Respond as Maple - be friendly and conversational. This is NOT a weather question, so just respond naturally without providing weather data. ${conversationContext ? 'Remember the conversation context above - build on previous messages, don\'t restart the conversation.' : ''} Keep it brief (1-2 sentences).`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Government-grade accuracy required - using GPT-4o for highest accuracy
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1, // ABSOLUTELY MINIMAL temperature (0.1) for MAXIMUM accuracy and determinism - CRITICAL for 100% accuracy requirement. Lower = more deterministic, less creative/random.
      max_tokens: 300, // Room for detailed, ACCURATE responses with source citations and fact-checked information - accuracy over brevity
    });

    return completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    throw new Error('Failed to get AI prediction');
  }
}


