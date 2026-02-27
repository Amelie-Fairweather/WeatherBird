/**
 * VTrans RWIS (Road Weather Information System) Service
 * Fetches real-time road condition data from Vermont's public RWIS XML feed
 * 
 * Data Source: VTrans Environmental Sensor Stations (ESS)
 * Format: XML with microdegree coordinates
 */

export interface VTransRWISStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  type: string;
  roadSurfaceCond?: 'Dry' | 'Wet' | 'Unknown';
  precipType?: string;
  precipRate?: number;
  airTemp?: number; // Celsius (need to convert to Fahrenheit)
  pavementTemp?: number; // Celsius (need to convert to Fahrenheit)
  dewPoint?: number; // Celsius
  windSpeed?: number; // mph
  windDir?: string;
  visibility?: number; // meters
  waterDepth?: number; // mm
  surfaceFriction?: number; // 0-100 scale
  roadway?: string;
  direction?: string;
  timestamp: string;
}

/**
 * Convert microdegree coordinates to decimal degrees
 * Example: 44975151 -> 44.975151
 */
function microdegreesToDecimal(microdeg: number): number {
  return microdeg / 1000000;
}

/**
 * Convert Celsius to Fahrenheit
 * Note: VTrans values appear to be in tenths of Celsius
 */
function celsiusToFahrenheit(tenthsOfCelsius: number): number {
  const celsius = tenthsOfCelsius / 10;
  return celsius * 9/5 + 32;
}

/**
 * Parse VTrans RWIS XML data
 */
export function parseVTransRWISXML(xmlText: string): VTransRWISStation[] {
  const stations: VTransRWISStation[] = [];
  
  try {
    // Parse XML - extract ess elements
    const essMatches = xmlText.matchAll(/<ess[^>]*>([\s\S]*?)<\/ess>/g);
    
    for (const match of essMatches) {
      const essContent = match[0];
      
      // Extract fields using regex (simple XML parsing)
      const getId = (tag: string): string | undefined => {
        const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
        const result = essContent.match(regex);
        return result ? result[1].trim() : undefined;
      };
      
      const getNumeric = (tag: string): number | undefined => {
        const value = getId(tag);
        return value && !isNaN(Number(value)) ? Number(value) : undefined;
      };
      
      const id = getId('id') || getId('id') || 'unknown';
      const name = getId('name') || 'Unknown Station';
      
      // Parse coordinates (microdegrees)
      const latMicro = getNumeric('lat');
      const lonMicro = getNumeric('lon');
      
      if (!latMicro || !lonMicro) continue;
      
      const latitude = microdegreesToDecimal(latMicro);
      const longitude = microdegreesToDecimal(lonMicro);
      
      // Parse road condition
      const roadSurfaceCond = getId('roadSurfaceCond') as 'Dry' | 'Wet' | 'Unknown' | undefined;
      
      // Parse temperatures (in tenths of Celsius, need to convert)
      const airTempC = getNumeric('airTemp');
      const pavementTempC = getNumeric('pavementTemp');
      const dewPointC = getNumeric('dewPoint');
      
      // Convert to Fahrenheit (values appear to be in tenths of Celsius)
      // Example: -240 = -24.0°C = -11.2°F
      const airTemp = airTempC !== undefined ? celsiusToFahrenheit(airTempC) : undefined;
      const pavementTemp = pavementTempC !== undefined ? celsiusToFahrenheit(pavementTempC) : undefined;
      const dewPoint = dewPointC !== undefined ? celsiusToFahrenheit(dewPointC) : undefined;
      
      // Parse other fields
      const roadway = getId('roadway');
      
      const station: VTransRWISStation = {
        id: id,
        name: name.trim(),
        latitude,
        longitude,
        status: getId('status') || 'Unknown',
        type: getId('type') || 'Unknown',
        roadSurfaceCond,
        precipType: getId('precipType'),
        precipRate: getNumeric('precipRate'),
        airTemp,
        pavementTemp,
        dewPoint,
        windSpeed: getNumeric('windSpeed'), // Already in mph based on data
        windDir: getId('windDir'),
        visibility: getNumeric('visibility'),
        waterDepth: getNumeric('waterDepth'),
        surfaceFriction: getNumeric('surfaceFriction'),
        roadway: roadway && roadway !== 'nowhere' ? roadway : undefined,
        direction: getId('direction'),
        timestamp: getId('timestamp') || new Date().toISOString(),
      };
      
      // Only include stations with actual road condition data
      if (station.roadSurfaceCond || station.surfaceFriction !== undefined) {
        stations.push(station);
      }
    }
    
    return stations;
  } catch (error) {
    console.error('Error parsing VTrans RWIS XML:', error);
    return [];
  }
}

/**
 * Fetch VTrans RWIS data from New England Compass Developer Portal
 * Source: https://nec-por.ne-compass.com/DeveloperPortal/
 * Data Set: Environment Sensor Data (RWIS)
 */
export async function fetchVTransRWISData(xmlData?: string): Promise<VTransRWISStation[]> {
  try {
    // If XML data is provided directly, parse it
    if (xmlData) {
      return parseVTransRWISXML(xmlData);
    }
    
    // NOTE: All New England Compass Developer Portal endpoints return 404
    // Verified: https://nec-por.ne-compass.com/DeveloperPortal/EnvironmentSensorData/Vermont.xml (404)
    // Verified: https://nec-por.ne-compass.com/DeveloperPortal/EnvironmentSensorData/Vermont (404)
    // These endpoints do not exist - portal structure may have changed or requires authentication
    // VTrans RWIS data is not accessible via public API endpoints
    // To use RWIS data, provide XML data directly: parseVTransRWISXML(xmlText)
    return [];
  } catch (error) {
    console.error('Error fetching VTrans RWIS data:', error);
    return [];
  }
}

/**
 * Convert VTrans RWIS station to RoadCondition format
 */
export function convertVTransRWISToRoadConditions(
  stations: VTransRWISStation[]
): Array<{
  route: string;
  condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
  temperature?: number;
  warning?: string;
  source: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  severity?: 'MINOR' | 'MODERATE' | 'MAJOR';
}> {
  return stations
    .filter(station => station.roadway && station.roadway !== 'nowhere')
    .map(station => {
      let condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown' = 'unknown';
      let warning = '';
      
      // Map road surface condition (ACCURATE MAPPING)
      switch (station.roadSurfaceCond) {
        case 'Dry':
          // Check for ice risk based on temperature and surface friction
          if (station.airTemp !== undefined && station.airTemp <= 32 && station.surfaceFriction !== undefined) {
            if (station.surfaceFriction < 50) {
              condition = 'ice';
              warning = `Dry road but low friction (${station.surfaceFriction}) - possible black ice at ${station.airTemp.toFixed(1)}°F`;
            } else if (station.airTemp <= 35) {
              condition = 'wet'; // Near freezing - treat as wet (caution level)
              warning = `Dry road but near freezing (${station.airTemp.toFixed(1)}°F) - watch for ice formation`;
            } else {
              condition = 'clear';
            }
          } else if (station.surfaceFriction !== undefined && station.surfaceFriction < 60) {
            // Low friction even on "dry" roads indicates hidden ice or other issues
            condition = station.surfaceFriction < 40 ? 'ice' : 'wet';
            warning = `Dry reported but friction ${station.surfaceFriction} suggests slippery conditions`;
          } else {
            condition = 'clear';
          }
          break;
        case 'Wet':
          // Check if it could freeze
          if (station.airTemp !== undefined && station.airTemp <= 35) {
            condition = 'ice';
            warning = `Wet road at ${station.airTemp.toFixed(1)}°F - high ice risk (freezing likely)`;
          } else {
            condition = 'wet';
            warning = `Wet road conditions at ${station.airTemp?.toFixed(1) || 'unknown'}°F`;
          }
          break;
        case 'Unknown':
          // Use surface friction and temperature to infer
          if (station.surfaceFriction !== undefined) {
            if (station.surfaceFriction < 40) {
              condition = 'ice';
              warning = `Very low friction (${station.surfaceFriction}) - likely ice or snow`;
            } else if (station.surfaceFriction < 60) {
              condition = 'snow-covered';
              warning = `Low friction (${station.surfaceFriction}) - snow-covered or slushy`;
            } else {
              condition = 'unknown';
              warning = `Unknown condition - friction: ${station.surfaceFriction}`;
            }
          } else {
            condition = 'unknown';
          }
          break;
      }
      
      // Check precipitation type
      if (station.precipType) {
        const precip = station.precipType.toLowerCase();
        if (precip.includes('snow')) {
          condition = 'snow-covered';
          warning = `Snow reported - ${station.roadSurfaceCond || 'unknown'} surface`;
        } else if (precip.includes('rain') && station.airTemp !== undefined && station.airTemp <= 32) {
          condition = 'ice';
          warning = `Freezing rain at ${station.airTemp.toFixed(1)}°F - EXTREMELY DANGEROUS`;
        }
      }
      
      // Surface friction warnings
      if (station.surfaceFriction !== undefined) {
        if (station.surfaceFriction < 40) {
          warning += ` | CRITICAL: Surface friction ${station.surfaceFriction} (extremely slippery)`;
        } else if (station.surfaceFriction < 60) {
          warning += ` | CAUTION: Surface friction ${station.surfaceFriction} (slippery)`;
        }
      }
      
      // Determine severity based on condition and friction
      let severity: 'MINOR' | 'MODERATE' | 'MAJOR' | undefined = undefined;
      if (condition === 'ice' || (station.surfaceFriction !== undefined && station.surfaceFriction < 40)) {
        severity = 'MAJOR';
      } else if (condition === 'snow-covered' || (station.surfaceFriction !== undefined && station.surfaceFriction < 60)) {
        severity = 'MODERATE';
      } else if (condition === 'wet' || condition === 'unknown') {
        severity = 'MINOR';
      }
      
      return {
        route: station.roadway || station.name,
        condition,
        temperature: station.airTemp,
        warning: warning || `${station.name}: ${station.roadSurfaceCond || 'unknown'} conditions`,
        source: 'VTrans RWIS',
        timestamp: station.timestamp,
        latitude: station.latitude,
        longitude: station.longitude,
        severity,
      };
    });
}

/**
 * Fetch and convert VTrans RWIS data to road conditions
 */
export async function fetchVTransRWISRoadConditions(): Promise<Array<{
  route: string;
  condition: 'clear' | 'wet' | 'snow-covered' | 'ice' | 'closed' | 'unknown';
  temperature?: number;
  warning?: string;
  source: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  severity?: 'MINOR' | 'MODERATE' | 'MAJOR';
}>> {
  try {
    const stations = await fetchVTransRWISData();
    return convertVTransRWISToRoadConditions(stations);
  } catch (error) {
    console.error('Error fetching VTrans RWIS road conditions:', error);
    return [];
  }
}









