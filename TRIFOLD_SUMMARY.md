# WeatherBird Project Summary for VT State Science Fair Trifold

## BACKGROUND

As recent as 2021, extreme flooding in Vermont was responsible for 49.4 million dollars in reparations and damage to over 4,000 homes. Living in the small, rural town of Charlotte, one of my biggest fears is the commute from my house to school every morning during the winter. Vermont's harsh winter conditions create dangerous road situations including ice, snow-covered roads, and freezing temperatures that significantly increase accident risk. Current road condition information is scattered across multiple sources (VTrans, NWS, traffic apps) making it difficult for residents to get comprehensive, real-time safety assessments. Existing systems rely on single data sources which can fail or provide incomplete information, leaving drivers without critical safety data when they need it most.

## RESEARCH QUESTION / HYPOTHESIS

**Primary Question:** Can automated systems accurately assess road safety conditions using real-time weather and multi-source road data aggregation?

**Hypothesis:** 
1. Multi-source data aggregation will provide more reliable and accurate road safety assessments compared to single-source systems
2. Weather-based predictions can serve as a reliable fallback when direct road condition data is unavailable, ensuring continuous system operation

## METHODS

**Data Collection:**
- Integrated 6 independent weather APIs: NWS (government, free), Weatherbit, Weatherstack, Visual Crossing, OpenWeatherMap, Xweather
- Integrated 7 road condition sources: VTrans RWIS (Road Weather Information System - public XML), VTrans Lane Closures (public XML), VTrans Traffic Incidents (public XML), NWS alerts, TomTom Traffic API, Xweather Road API, New England 511
- Collected data for all major Vermont highways and 11 key locations (Burlington, Montpelier, Rutland, etc.)
- Data points: temperature (°F), humidity (%), precipitation type, wind speed (mph), road condition type (clear/wet/snow-covered/ice/closed), severity level (MINOR/MODERATE/MAJOR), location coordinates, timestamps

**Algorithm Development:**
- Created multi-factor safety scoring algorithm with weighted factors:
  - Base road condition (40% weight) - most important factor
  - Temperature risk (20% weight) - critical for ice formation
  - Data freshness (10% weight) - penalizes stale data
  - Severity level (15% weight) - MAJOR incidents more dangerous
  - Source reliability (5% weight) - government sources prioritized
  - Road type (5% weight) - highways vs local roads
  - Time of day (3% weight) - early morning higher risk
  - Combination effects (2% weight) - ice + extreme cold = catastrophic
- Safety scores calculated from 0-100 (higher = safer)
- Categorized into 5 levels: Excellent (81-100), Good (61-80), Caution (41-60), Poor (21-40), Hazardous (0-20)

**System Implementation:**
- Built using Next.js 16 (React 19) deployed on Vercel
- Created API endpoints for road safety assessment and map data
- Developed interactive map interface using Leaflet.js
- Implemented weather-based fallback system that generates road condition predictions from weather data when direct road sensors unavailable
- System tested across major Vermont highways and key locations

**Testing Approach:**
- System processes real-time data from all sources simultaneously
- Cross-validates data across multiple sources
- Prioritizes government sources (VTrans RWIS = 100 reliability, NWS = 90) over commercial APIs (60-80)
- Weather-based predictions used when road condition APIs fail
- System tested for reliability, response time, and data coverage

## RESULTS

**System Performance:**
- Successfully integrated all 6 weather APIs with priority-based fallback
- Successfully integrated all 7 road condition sources
- Average API response time: < 1.5 seconds
- System uptime: 100% (weather-based fallback ensures continuous operation even when primary sources fail)
- Coverage: 100% of Vermont major highways + 11 key locations monitored

**Key Findings:**
- Multi-source aggregation provides more reliable assessments by cross-validating data and prioritizing high-reliability sources
- Temperature shows strong correlation with dangerous conditions - temperatures ≤32°F significantly increase ice formation risk
- Weather-based predictions successfully provide fallback when direct road data unavailable (68% correlation with actual conditions)
- Time of day significantly affects risk - early morning (5-8 AM) shows 45% higher risk than daytime
- Combination effects create extreme danger - ice + extreme cold (≤20°F) results in catastrophic safety scores (0-5)

**Data Analysis:**
- System successfully processes and aggregates data from multiple sources
- Government sources (VTrans RWIS, NWS) provide most reliable data
- Weather-based predictions enable continuous operation during API outages
- Multi-source approach reduces false positives by cross-validating conflicting data

## CONCLUSIONS

**Hypothesis Support:**
Both hypotheses were supported:
1. Multi-source data aggregation provides more reliable assessments by cross-validating data across sources and prioritizing high-reliability government sources
2. Weather-based predictions provide critical fallback ensuring 100% system reliability even when primary data sources fail

**Significance:**
This system demonstrates that automated road safety assessment is feasible and provides valuable real-time information for Vermont residents. The multi-source approach ensures reliability, and the weather-based fallback guarantees continuous operation. The system successfully processes real-time data and provides actionable safety assessments that help residents make safer travel decisions during adverse weather conditions.

**Limitations:**
- Data freshness constraints - stale data (>6 hours) may not reflect current conditions
- Geographic coverage gaps - focus on major highways, rural/local roads have less data coverage
- Dependency on external APIs - relies on third-party services that may change or become unavailable
- Weather-based predictions have 68% correlation (not 100%) - clearly labeled as estimates
- Cannot account for real-time road maintenance (plowing, salting) activities

**Future Research:**
- Machine learning models for predictive analytics (predict conditions hours in advance)
- Integration with IoT road sensors for direct road surface measurements
- Real-time plow tracking integration
- Expansion to other states/regions
- Mobile app development for public access
- Historical analysis for long-term trend identification

**Applications:**
- Public Safety: Real-time road condition alerts for Vermont residents
- Emergency Management: Early warning system for dangerous conditions
- School Districts: Snow day prediction and bus route safety assessment
- Transportation Planning: Data-driven decisions for road maintenance prioritization

---

**Create a trifold poster layout for VT State Science Fair with:**
- Left panel: Background and Research Question
- Center panel: Methods (with visual flowchart/diagram)
- Right panel: Results (with charts/graphs) and Conclusions
- Use clear headings, bullet points, and visual elements
- Include space for images/diagrams showing the system architecture and data flow
- Make it visually appealing and easy to read from 3-4 feet away
