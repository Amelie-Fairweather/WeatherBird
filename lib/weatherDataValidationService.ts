/**
 * Weather Data Validation Service
 * Validates and fact-checks weather data from multiple API sources
 * Critical for government-grade accuracy
 */

export interface WeatherDataValidation {
  isValid: boolean;
  confidence: number; // 0-100
  issues: string[];
  recommendations: string[];
  sourceReliability: number;
}

/**
 * Validate weather data from API response
 */
export function validateWeatherData(data: any): WeatherDataValidation {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let confidence = 100;
  let sourceReliability = 50;

  // Check required fields
  if (!data) {
    return {
      isValid: false,
      confidence: 0,
      issues: ['No data provided'],
      recommendations: ['Data fetch may have failed'],
      sourceReliability: 0,
    };
  }

  // Validate temperature
  if (data.temperature !== undefined) {
    if (typeof data.temperature !== 'number' || isNaN(data.temperature)) {
      issues.push('Invalid temperature value');
      confidence -= 30;
    } else {
      // Reasonable range check for Vermont (-50°F to 110°F in Celsius: -45°C to 43°C)
      const tempC = data.temperature;
      if (tempC < -45 || tempC > 43) {
        issues.push(`Temperature ${tempC}°C seems extreme for Vermont`);
        confidence -= 10;
        recommendations.push('Verify temperature reading with another source');
      }
    }
  } else {
    issues.push('Temperature data missing');
    confidence -= 20;
  }

  // Validate humidity
  if (data.humidity !== undefined) {
    if (typeof data.humidity !== 'number' || isNaN(data.humidity) || data.humidity < 0 || data.humidity > 100) {
      issues.push('Invalid humidity value (must be 0-100%)');
      confidence -= 15;
    }
  }

  // Validate pressure
  if (data.pressure !== undefined) {
    if (typeof data.pressure !== 'number' || isNaN(data.pressure) || data.pressure < 800 || data.pressure > 1100) {
      issues.push('Invalid pressure value (must be 800-1100 hPa)');
      confidence -= 10;
    }
  }

  // Validate timestamp
  if (data.timestamp) {
    const timestamp = new Date(data.timestamp);
    const now = new Date();
    const ageMs = now.getTime() - timestamp.getTime();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    if (isNaN(timestamp.getTime())) {
      issues.push('Invalid timestamp format');
      confidence -= 20;
    } else if (timestamp.getTime() > now.getTime() + 60000) {
      issues.push('Timestamp is in the future');
      confidence -= 30;
    } else if (ageMs > maxAge) {
      const ageMinutes = Math.round(ageMs / 60000);
      issues.push(`Data is ${ageMinutes} minutes old`);
      confidence -= Math.min(30, ageMinutes / 10); // Reduce confidence for older data
      recommendations.push('Consider fetching fresh data');
    }
  } else {
    issues.push('Timestamp missing');
    confidence -= 15;
  }

  // Validate location
  if (!data.location || typeof data.location !== 'string' || data.location.trim().length === 0) {
    issues.push('Location data missing');
    confidence -= 10;
  }

  // Check data source reliability
  const source = (data.source || '').toLowerCase();
  if (source.includes('nws') || source.includes('national weather service')) {
    sourceReliability = 95; // Government source - highest reliability
  } else if (source.includes('weatherbit')) {
    sourceReliability = 85;
  } else if (source.includes('weatherstack')) {
    sourceReliability = 80;
  } else if (source.includes('visual crossing')) {
    sourceReliability = 75;
  } else if (source.includes('openweather')) {
    sourceReliability = 70;
  }

  // Adjust confidence based on source reliability
  confidence = (confidence + sourceReliability) / 2;

  return {
    isValid: issues.filter(i => i.includes('missing') || i.includes('Invalid')).length === 0,
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    issues,
    recommendations: recommendations.length > 0 ? recommendations : ['Data appears valid'],
    sourceReliability,
  };
}

/**
 * Cross-reference weather data from multiple sources
 */
export function crossReferenceWeatherData(sources: Array<{ source: string; data: any }>): {
  consensus: {
    temperature?: number;
    description?: string;
    humidity?: number;
    pressure?: number;
    confidence: number;
  };
  conflicts: Array<{
    field: string;
    values: Array<{ source: string; value: any }>;
  }>;
} {
  const consensus: any = { confidence: 0 };
  const conflicts: Array<{ field: string; values: Array<{ source: string; value: any }> }> = [];

  if (sources.length === 0) {
    return { consensus: { confidence: 0 }, conflicts: [] };
  }

  // Group values by field
  const fields = ['temperature', 'description', 'humidity', 'pressure'] as const;
  
  fields.forEach(field => {
    const values = sources
      .map(s => ({ source: s.source, value: s.data[field] }))
      .filter(v => v.value !== undefined && v.value !== null);

    if (values.length === 0) return;

    if (values.length === 1) {
      consensus[field] = values[0].value;
      return;
    }

    // For numeric fields, check if values are close
    if (field === 'temperature' || field === 'humidity' || field === 'pressure') {
      const numericValues = values.map(v => Number(v.value)).filter(v => !isNaN(v));
      if (numericValues.length > 0) {
        const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
        const maxDeviation = field === 'temperature' ? 5 : field === 'humidity' ? 10 : 20;
        const allClose = numericValues.every(v => Math.abs(v - avg) <= maxDeviation);

        if (allClose) {
          consensus[field] = avg;
        } else {
          conflicts.push({ field, values });
        }
      }
    } else {
      // For text fields, check for exact match
      const uniqueValues = new Set(values.map(v => String(v.value).toLowerCase()));
      if (uniqueValues.size === 1) {
        consensus[field] = values[0].value;
      } else {
        conflicts.push({ field, values });
      }
    }
  });

  // Calculate overall confidence
  const totalFields = Object.keys(consensus).length - 1; // Exclude confidence
  const conflictCount = conflicts.length;
  consensus.confidence = totalFields > 0 
    ? Math.round(((totalFields - conflictCount) / (totalFields + conflictCount)) * 100)
    : 0;

  return { consensus, conflicts };
}









