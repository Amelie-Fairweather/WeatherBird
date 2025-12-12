/**
 * Service for analyzing plow truck data and generating road safety ratings
 * 
 * This service can work with:
 * 1. Direct API data (if VTrans provides it)
 * 2. Scraped data from the map
 * 3. Manual data entry
 */

export interface PlowLocation {
  id: string;
  latitude: number;
  longitude: number;
  route?: string;
  direction?: number; // heading in degrees
  timestamp: string;
  status?: 'active' | 'inactive';
}

export interface RoadSafetyRating {
  route: string;
  safetyRating: number; // 1-10 scale (10 = safest)
  plowCount: number;
  plowDensity: number; // plows per mile
  reasoning: string;
  recommendations: string[];
}

/**
 * Calculate road safety rating based on plow density
 * 
 * @param plows - Array of plow locations
 * @param route - Route name or area to analyze
 * @param routeLength - Length of route in miles (optional)
 * @returns Road safety rating with reasoning
 */
export function calculateRoadSafetyRating(
  plows: PlowLocation[],
  route: string = 'Vermont',
  routeLength?: number
): RoadSafetyRating {
  const plowCount = plows.length;
  
  // If we have route length, calculate density per mile
  // Otherwise, use overall density based on Vermont's road network
  // Vermont has approximately 2,700 miles of state highways
  const estimatedRouteLength = routeLength || (route === 'Vermont' ? 2700 : 100);
  const plowDensity = plowCount / estimatedRouteLength;

  // Safety rating algorithm:
  // Base rating on plow density
  // More plows = higher safety rating
  let safetyRating = 5; // Start at neutral
  
  if (plowDensity >= 0.1) {
    // 1+ plows per 10 miles = excellent coverage
    safetyRating = 9;
  } else if (plowDensity >= 0.05) {
    // 1+ plows per 20 miles = good coverage
    safetyRating = 8;
  } else if (plowDensity >= 0.02) {
    // 1+ plows per 50 miles = moderate coverage
    safetyRating = 6;
  } else if (plowDensity >= 0.01) {
    // 1+ plows per 100 miles = minimal coverage
    safetyRating = 4;
  } else {
    // Less than 1 plow per 100 miles = poor coverage
    safetyRating = 2;
  }

  // Adjust based on absolute count
  if (plowCount === 0) {
    safetyRating = 1;
    return {
      route,
      safetyRating: 1,
      plowCount: 0,
      plowDensity: 0,
      reasoning: `No active plows detected on ${route}. Road conditions are likely hazardous and may not be maintained.`,
      recommendations: [
        'Avoid travel if possible',
        'Check road conditions before leaving',
        'Use extreme caution if travel is necessary',
        'Consider delaying travel until plows are active',
      ],
    };
  }

  // Generate reasoning
  let reasoning = '';
  if (safetyRating >= 8) {
    reasoning = `Excellent plow coverage on ${route} with ${plowCount} active plow${plowCount > 1 ? 's' : ''} (${plowDensity.toFixed(3)} plows per mile). Roads are likely well-maintained.`;
  } else if (safetyRating >= 6) {
    reasoning = `Moderate plow coverage on ${route} with ${plowCount} active plow${plowCount > 1 ? 's' : ''} (${plowDensity.toFixed(3)} plows per mile). Some areas may have limited maintenance.`;
  } else {
    reasoning = `Limited plow coverage on ${route} with only ${plowCount} active plow${plowCount > 1 ? 's' : ''} (${plowDensity.toFixed(3)} plows per mile). Road conditions may be hazardous.`;
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (safetyRating >= 8) {
    recommendations.push('Roads are likely in good condition');
    recommendations.push('Normal winter driving precautions apply');
  } else if (safetyRating >= 6) {
    recommendations.push('Exercise caution, especially on secondary roads');
    recommendations.push('Allow extra travel time');
    recommendations.push('Check specific route conditions before traveling');
  } else {
    recommendations.push('Avoid travel if possible');
    recommendations.push('Use extreme caution if travel is necessary');
    recommendations.push('Check road conditions frequently');
    recommendations.push('Consider alternative routes if available');
  }

  return {
    route,
    safetyRating,
    plowCount,
    plowDensity,
    reasoning,
    recommendations,
  };
}

/**
 * Analyze plow distribution across different regions/routes
 */
export function analyzePlowDistribution(plows: PlowLocation[]): {
  totalPlows: number;
  activePlows: number;
  regions: Record<string, number>;
} {
  const activePlows = plows.filter(p => p.status !== 'inactive').length;
  
  // Group by route if available
  const regions: Record<string, number> = {};
  plows.forEach(plow => {
    const region = plow.route || 'Unknown';
    regions[region] = (regions[region] || 0) + 1;
  });

  return {
    totalPlows: plows.length,
    activePlows,
    regions,
  };
}

/**
 * Format plow analysis for AI context
 */
export function formatPlowAnalysisForAI(
  rating: RoadSafetyRating,
  distribution?: { totalPlows: number; activePlows: number; regions: Record<string, number> }
): string {
  let context = `\n\nPlow Truck Analysis for ${rating.route}:\n`;
  context += `Safety Rating: ${rating.safetyRating}/10\n`;
  context += `Active Plows: ${rating.plowCount}\n`;
  context += `Plow Density: ${rating.plowDensity.toFixed(3)} plows per mile\n`;
  context += `Assessment: ${rating.reasoning}\n`;
  context += `Recommendations:\n`;
  rating.recommendations.forEach((rec, i) => {
    context += `  ${i + 1}. ${rec}\n`;
  });

  if (distribution) {
    context += `\nOverall Distribution:\n`;
    context += `  Total Plows: ${distribution.totalPlows}\n`;
    context += `  Active Plows: ${distribution.activePlows}\n`;
    if (Object.keys(distribution.regions).length > 0) {
      context += `  By Route:\n`;
      Object.entries(distribution.regions).forEach(([route, count]) => {
        context += `    - ${route}: ${count} plow${count > 1 ? 's' : ''}\n`;
      });
    }
  }

  return context;
}

/**
 * Attempt to fetch plow data from VTrans (if API becomes available)
 * This is a placeholder for future API integration
 */
export async function fetchPlowDataFromVTrans(): Promise<PlowLocation[]> {
  // TODO: Implement when VTrans API access is obtained
  // This would fetch real-time plow locations from VTrans API
  
  console.log('VTrans plow API not yet available. Contact VTrans for API access.');
  return [];
}





