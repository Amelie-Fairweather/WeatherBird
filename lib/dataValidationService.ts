/**
 * Data Validation and Accuracy Service
 * Ensures all data from APIs is fact-checked and validated before display
 * Critical for government-grade accuracy
 */

import { RoadCondition } from './roadDataService';

/**
 * Validate road condition data for accuracy and completeness
 */
export function validateRoadCondition(condition: RoadCondition): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Route name is preferred but not required if we have valid GPS coordinates
  // This allows TomTom incidents and other sources with coordinates but no route name to pass validation
  const hasValidCoords = condition.latitude !== undefined && 
                        condition.longitude !== undefined &&
                        typeof condition.latitude === 'number' &&
                        typeof condition.longitude === 'number' &&
                        !isNaN(condition.latitude) && 
                        !isNaN(condition.longitude) &&
                        condition.latitude >= -90 && condition.latitude <= 90 &&
                        condition.longitude >= -180 && condition.longitude <= 180;
  
  if (!condition.route || condition.route.trim().length === 0) {
    if (!hasValidCoords) {
      // Only require route if we don't have valid coordinates
      errors.push('Route is required when GPS coordinates are not available');
    } else {
      // If we have coordinates, route name is optional - use a default
      warnings.push('Route name missing - will use GPS coordinates for mapping');
    }
  }

  if (!condition.condition) {
    errors.push('Condition type is required');
  } else {
    const validConditions = ['clear', 'wet', 'snow-covered', 'ice', 'closed', 'unknown'];
    if (!validConditions.includes(condition.condition)) {
      errors.push(`Invalid condition type: ${condition.condition}`);
    }
  }

  if (!condition.source || condition.source.trim().length === 0) {
    errors.push('Data source is required');
  }

  if (!condition.timestamp) {
    errors.push('Timestamp is required');
  } else {
    // Check timestamp is reasonable (not too old, not in future)
    const timestamp = new Date(condition.timestamp);
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (isNaN(timestamp.getTime())) {
      errors.push('Invalid timestamp format');
    } else if (timestamp.getTime() > now.getTime() + 60000) {
      // More than 1 minute in future
      warnings.push('Timestamp is in the future - may be incorrect');
    } else if (now.getTime() - timestamp.getTime() > maxAge) {
      warnings.push(`Data is ${Math.round((now.getTime() - timestamp.getTime()) / (60 * 60 * 1000))} hours old - may be stale`);
    }
  }

  // Validate GPS coordinates if present
  // If coordinates are invalid, treat them as missing (not an error) so roads can still be mapped by name
  if (condition.latitude !== undefined) {
    if (isNaN(condition.latitude) || condition.latitude < -90 || condition.latitude > 90) {
      // Invalid coordinate - treat as missing (not an error) so road can be mapped by name
      warnings.push('Invalid latitude - will use route name mapping instead');
      // Don't add to errors - allow the condition to pass validation
    } else {
      // Check if coordinates are in Vermont bounds (approximate)
      if (condition.latitude < 42.5 || condition.latitude > 45.5) {
        warnings.push('Latitude is outside Vermont bounds - verify location');
      }
    }
  }

  if (condition.longitude !== undefined) {
    if (isNaN(condition.longitude) || condition.longitude < -180 || condition.longitude > 180) {
      // Invalid coordinate - treat as missing (not an error) so road can be mapped by name
      warnings.push('Invalid longitude - will use route name mapping instead');
      // Don't add to errors - allow the condition to pass validation
    } else {
      // Check if coordinates are in Vermont bounds (approximate)
      if (condition.longitude > -71 || condition.longitude < -73.5) {
        warnings.push('Longitude is outside Vermont bounds - verify location');
      }
    }
  }
  
  // If coordinates are invalid, we'll keep them as warnings but NOT clear them
  // This allows the dangerous roads function to try to use them or fall back to highway matching
  // Only clear coordinates if they're completely unusable (NaN or extreme values)
  if (condition.latitude !== undefined && condition.longitude !== undefined) {
    const latValid = !isNaN(condition.latitude) && condition.latitude >= -90 && condition.latitude <= 90;
    const lonValid = !isNaN(condition.longitude) && condition.longitude >= -180 && condition.longitude <= 180;
    // Don't clear coordinates - let the dangerous roads function decide what to do with them
    // It can use them if valid, or fall back to highway name matching
  }

  // Validate temperature if present
  if (condition.temperature !== undefined) {
    if (isNaN(condition.temperature)) {
      errors.push('Invalid temperature value');
    } else {
      // Reasonable temperature range for Vermont (-50°F to 110°F)
      const tempF = condition.temperature;
      if (tempF < -50 || tempF > 110) {
        warnings.push(`Temperature ${tempF}°F seems extreme - verify accuracy`);
      }
    }
  }

  // Validate severity if present
  if (condition.severity) {
    const validSeverities = ['MINOR', 'MODERATE', 'MAJOR'];
    if (!validSeverities.includes(condition.severity)) {
      errors.push(`Invalid severity: ${condition.severity}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate and filter road conditions, removing invalid entries
 * Returns validated conditions and validation report
 */
export function validateAndFilterRoadConditions(
  conditions: RoadCondition[]
): {
  validConditions: RoadCondition[];
  invalidCount: number;
  warningCount: number;
  validationReport: string;
} {
  const validConditions: RoadCondition[] = [];
  let invalidCount = 0;
  let warningCount = 0;
  const issues: string[] = [];

  conditions.forEach((condition, index) => {
    const validation = validateRoadCondition(condition);

    if (validation.isValid) {
      validConditions.push(condition);
      if (validation.warnings.length > 0) {
        warningCount++;
        issues.push(`Condition ${index + 1} (${condition.route}): ${validation.warnings.join(', ')}`);
      }
    } else {
      invalidCount++;
      issues.push(`Invalid condition ${index + 1} (${condition.route || 'unknown'}): ${validation.errors.join(', ')}`);
      console.warn(`[Data Validation] Rejected invalid road condition:`, {
        route: condition.route,
        errors: validation.errors,
      });
    }
  });

  const validationReport = [
    `Validated ${conditions.length} road conditions:`,
    `- Valid: ${validConditions.length}`,
    `- Invalid (removed): ${invalidCount}`,
    `- With warnings: ${warningCount}`,
    ...(issues.length > 0 ? [`\nIssues:`, ...issues.slice(0, 10)] : []), // Limit to first 10 issues
  ].join('\n');

  return {
    validConditions,
    invalidCount,
    warningCount,
    validationReport,
  };
}

/**
 * Cross-reference data from multiple sources for accuracy
 * Identifies conflicting information between sources
 */
export function crossReferenceRoadConditions(
  conditions: RoadCondition[]
): {
  conflicts: Array<{
    route: string;
    location: string;
    conflicts: Array<{ source: string; condition: string; timestamp: string }>;
  }>;
  consensus: Array<{
    route: string;
    location: string;
    condition: string;
    sources: string[];
    confidence: number;
  }>;
} {
  const conflicts: Array<{
    route: string;
    location: string;
    conflicts: Array<{ source: string; condition: string; timestamp: string }>;
  }> = [];

  const consensus: Array<{
    route: string;
    location: string;
    condition: string;
    sources: string[];
    confidence: number;
  }> = [];

  // Group conditions by route and location
  const grouped = new Map<string, RoadCondition[]>();

  conditions.forEach(condition => {
    // Create key from route and approximate location
    const locationKey = condition.latitude && condition.longitude
      ? `${condition.route}_${Math.round(condition.latitude * 100)}_${Math.round(condition.longitude * 100)}`
      : condition.route;

    if (!grouped.has(locationKey)) {
      grouped.set(locationKey, []);
    }
    grouped.get(locationKey)!.push(condition);
  });

  // Analyze each group
  grouped.forEach((group, locationKey) => {
    if (group.length === 1) {
      // Single source - high confidence
      const condition = group[0];
      consensus.push({
        route: condition.route,
        location: `${condition.latitude || 'N/A'}, ${condition.longitude || 'N/A'}`,
        condition: condition.condition,
        sources: [condition.source],
        confidence: 60, // Single source
      });
      return;
    }

    // Multiple sources - check for consensus
    const conditionCounts = new Map<string, { count: number; sources: string[]; timestamps: string[] }>();

    group.forEach(condition => {
      const key = condition.condition;
      if (!conditionCounts.has(key)) {
        conditionCounts.set(key, { count: 0, sources: [], timestamps: [] });
      }
      const entry = conditionCounts.get(key)!;
      entry.count++;
      entry.sources.push(condition.source);
      entry.timestamps.push(condition.timestamp);
    });

    // Find most common condition
    let maxCount = 0;
    let mostCommonCondition = '';
    conditionCounts.forEach((value, condition) => {
      if (value.count > maxCount) {
        maxCount = value.count;
        mostCommonCondition = condition;
      }
    });

    const total = group.length;
    const confidence = Math.round((maxCount / total) * 100);

    if (confidence >= 50) {
      // Consensus reached
      const entry = conditionCounts.get(mostCommonCondition)!;
      consensus.push({
        route: group[0].route,
        location: `${group[0].latitude || 'N/A'}, ${group[0].longitude || 'N/A'}`,
        condition: mostCommonCondition,
        sources: entry.sources,
        confidence,
      });
    } else {
      // Conflict detected
      const conflictData: Array<{ source: string; condition: string; timestamp: string }> = [];
      group.forEach(condition => {
        conflictData.push({
          source: condition.source,
          condition: condition.condition,
          timestamp: condition.timestamp,
        });
      });

      conflicts.push({
        route: group[0].route,
        location: `${group[0].latitude || 'N/A'}, ${group[0].longitude || 'N/A'}`,
        conflicts: conflictData,
      });
    }
  });

  return { conflicts, consensus };
}

/**
 * Prioritize data sources by reliability for fact-checking
 */
export function prioritizeDataSources(condition: RoadCondition): number {
  const source = condition.source.toLowerCase();
  
  // Priority 1: Official government sources (highest reliability)
  if (source.includes('vtrans') || source.includes('rwis')) return 100;
  if (source.includes('nws') || source.includes('national weather service')) return 95;
  
  // Priority 2: Commercial weather APIs with good track records
  if (source.includes('xweather') || source.includes('aeris')) return 80;
  if (source.includes('weatherstack')) return 75;
  if (source.includes('visual crossing')) return 75;
  if (source.includes('weatherbit')) return 70;
  
  // Priority 3: Traffic/incident APIs
  if (source.includes('tomtom')) return 70;
  if (source.includes('new england 511') || source.includes('511')) return 65;
  
  // Priority 4: Other sources
  if (source.includes('openweather')) return 60;
  
  // Default priority
  return 50;
}

/**
 * Fact-check condition by comparing with multiple sources
 * Returns confidence score (0-100) and recommendations
 */
export function factCheckRoadCondition(
  condition: RoadCondition,
  allConditions: RoadCondition[]
): {
  confidence: number;
  sourceReliability: number;
  crossReference: {
    matchingSources: number;
    conflictingSources: number;
    totalSources: number;
  };
  recommendation: string;
} {
  const sourceReliability = prioritizeDataSources(condition);

  // Find other conditions for the same route/location
  const nearbyConditions = allConditions.filter(c => {
    if (c.route === condition.route) return true;
    
    // Check if coordinates are within 0.1 degrees (~11km)
    if (condition.latitude && condition.longitude && c.latitude && c.longitude) {
      const latDiff = Math.abs(condition.latitude - c.latitude);
      const lonDiff = Math.abs(condition.longitude - c.longitude);
      return latDiff < 0.1 && lonDiff < 0.1;
    }
    
    return false;
  });

  const matchingSources = nearbyConditions.filter(
    c => c.condition === condition.condition && c.source !== condition.source
  ).length;

  const conflictingSources = nearbyConditions.filter(
    c => c.condition !== condition.condition && c.source !== condition.source
  ).length;

  const totalSources = nearbyConditions.length;

  // Calculate confidence based on source reliability and cross-referencing
  let confidence = sourceReliability;
  
  if (totalSources > 0) {
    const consensusRatio = matchingSources / totalSources;
    // Boost confidence if other sources agree, reduce if they conflict
    confidence = Math.min(100, sourceReliability + (consensusRatio * 30) - (conflictingSources * 20));
  }

  let recommendation = '';
  if (confidence >= 80) {
    recommendation = 'High confidence - multiple sources agree';
  } else if (confidence >= 60) {
    recommendation = 'Moderate confidence - verify with additional sources';
  } else if (conflictingSources > 0) {
    recommendation = `Warning: ${conflictingSources} conflicting source(s) - verify accuracy`;
  } else {
    recommendation = 'Low confidence - single source, recommend verification';
  }

  return {
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    sourceReliability,
    crossReference: {
      matchingSources,
      conflictingSources,
      totalSources,
    },
    recommendation,
  };
}









