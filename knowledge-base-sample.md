# Sample Knowledge Base Documents for Weatherbird

Use these documents to populate your knowledge base. You can add them via the `/api/knowledge/add` endpoint.

## Document 1: Vermont Winter Driving Safety

**ID:** `vermont-winter-driving-001`
**Category:** Road Safety
**Text:**
```
Vermont experiences harsh winters with significant snowfall from November through March. Mountain roads can be particularly dangerous during winter months. Black ice is a major concern, especially during temperature fluctuations when roads freeze and thaw. Drivers should maintain slower speeds, increase following distance, and ensure vehicles are equipped with proper winter tires. The Vermont Agency of Transportation recommends checking road conditions before traveling during winter weather events. Mountain passes like Route 17 and Route 108 can become impassable during heavy snowstorms.
```

## Document 2: Spring Flooding in Vermont

**ID:** `vermont-spring-flooding-001`
**Category:** Flood Safety
**Text:**
```
Spring flooding is common in Vermont, especially in river valleys and low-lying areas. The state experiences rapid snowmelt combined with spring rains, which can cause rivers to overflow. The Winooski River, Connecticut River, and Otter Creek are particularly prone to flooding. Residents in flood-prone areas should monitor river levels and have an evacuation plan ready. Never drive through flooded roads - just six inches of moving water can sweep away a vehicle. The National Weather Service issues flood watches and warnings that should be taken seriously.
```

## Document 3: Vermont Weather Patterns

**ID:** `vermont-weather-patterns-001`
**Category:** Weather Knowledge
**Text:**
```
Vermont has a humid continental climate with four distinct seasons. Winters are cold and snowy, with average temperatures ranging from 15°F to 30°F. Summers are warm and humid, with temperatures typically between 65°F and 80°F. The state receives an average of 80 inches of snow annually, with higher amounts in the Green Mountains. Lake Champlain can moderate temperatures in the western part of the state. Weather conditions can change rapidly, especially in mountainous areas, making it important to stay updated on current forecasts.
```

## Document 4: Road Condition Reporting

**ID:** `vermont-road-conditions-001`
**Category:** Road Safety
**Text:**
```
The Vermont Agency of Transportation provides real-time road condition information through the New England 511 system. Road conditions are categorized as: clear, wet, snow-covered, ice, or closed. During winter storms, road crews work to maintain passable conditions on major routes, but secondary roads may not be cleared immediately. Travelers should check conditions before heading out and be prepared for changing conditions. The state maintains over 2,700 miles of state highways, and conditions can vary significantly across different regions.
```

## Document 5: Emergency Preparedness

**ID:** `vermont-emergency-prep-001`
**Category:** Emergency
**Text:**
```
Vermont residents should be prepared for various weather emergencies including severe winter storms, flooding, and ice storms. Emergency kits should include: non-perishable food, water, flashlights, batteries, first aid supplies, and warm clothing. During winter storms, power outages can last for days. Have alternative heating sources ready and ensure carbon monoxide detectors are working. The Vermont Emergency Management agency coordinates response efforts and provides updates during emergencies. Stay informed through local news, weather radios, and official emergency alerts.
```

## How to Add These Documents

You can add these documents using a script or API call:

```bash
curl -X POST http://localhost:3000/api/knowledge/add \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {
        "id": "vermont-winter-driving-001",
        "text": "Vermont experiences harsh winters...",
        "metadata": {
          "title": "Vermont Winter Driving Safety",
          "category": "Road Safety",
          "source": "Weatherbird Knowledge Base"
        }
      }
      // ... add other documents
    ]
  }'
```

Or create a script to add them all at once.







