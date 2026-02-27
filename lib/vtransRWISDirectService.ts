/**
 * VTrans RWIS Direct XML Parser
 * Since you have the XML data directly, this provides a function to parse it
 * without needing to fetch from an endpoint
 */

import { parseVTransRWISXML, convertVTransRWISToRoadConditions } from './vtransRWISService';

/**
 * Parse XML data directly (when you have the XML string)
 */
export async function parseVTransRWISXMLDirect(xmlText: string): Promise<Array<{
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
    const stations = parseVTransRWISXML(xmlText);
    return convertVTransRWISToRoadConditions(stations);
  } catch (error) {
    console.error('Error parsing VTrans RWIS XML directly:', error);
    return [];
  }
}









