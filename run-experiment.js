/**
 * Experiment Runner Script
 * Automates data collection for science experiment
 * 
 * Usage:
 *   node run-experiment.js --level 1 --road "I-89" --location "Burlington"
 *   node run-experiment.js --level 1 --all-roads
 *   node run-experiment.js --level 1 --all-levels
 */

const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const TEST_ROADS = [
  { name: 'I-89', location: 'Burlington' },
  { name: 'I-91', location: 'Brattleboro' },
  { name: 'US Route 7', location: 'Burlington' },
  { name: 'VT Route 100', location: 'Waterbury' },
  { name: 'VT Route 9', location: 'Brattleboro' },
  { name: 'I-89', location: 'Montpelier' },
  { name: 'US Route 2', location: 'Montpelier' },
  { name: 'VT Route 15', location: 'Essex Junction' },
  { name: 'VT Route 22A', location: 'Middlebury' },
  { name: 'VT Route 125', location: 'Middlebury' },
];

const TIME_PERIODS = [
  { name: 'Early Morning', start: '05:00', end: '08:00' },
  { name: 'Midday', start: '12:00', end: '14:00' },
  { name: 'Evening', start: '17:00', end: '19:00' },
];

// Parse command line arguments
const args = process.argv.slice(2);
const level = args.find(arg => arg.startsWith('--level'))?.split('=')[1] || args[args.indexOf('--level') + 1];
const road = args.find(arg => arg.startsWith('--road'))?.split('=')[1] || args[args.indexOf('--road') + 1];
const location = args.find(arg => arg.startsWith('--location'))?.split('=')[1] || args[args.indexOf('--location') + 1];
const allRoads = args.includes('--all-roads');
const allLevels = args.includes('--all-levels');

/**
 * Call the road safety assessment API
 */
async function getAssessment(roadName, roadLocation, level) {
  const url = `${BASE_URL}/api/road/safety-assessment?route=${encodeURIComponent(roadName)}&location=${encodeURIComponent(roadLocation)}`;
  
  console.log(`[Level ${level}] Fetching: ${roadName} in ${roadLocation}...`);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(url);
    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000; // seconds
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.assessment) {
      throw new Error('No assessment data returned');
    }
    
    const assessment = data.assessment;
    
    return {
      success: true,
      road: roadName,
      location: roadLocation,
      level: level,
      timestamp: new Date().toISOString(),
      safetyScore: assessment.safetyScore,
      safetyLevel: assessment.safetyRating,
      processingTime: processingTime,
      confidence: assessment.dataQuality?.confidence || 'N/A',
      dataSources: assessment.dataQuality?.dataSources || [],
      condition: assessment.condition,
      temperatureF: assessment.temperatureF,
      roadCondition: assessment.roadCondition,
      criticalWarnings: assessment.criticalWarnings || [],
    };
  } catch (error) {
    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000;
    
    return {
      success: false,
      road: roadName,
      location: roadLocation,
      level: level,
      timestamp: new Date().toISOString(),
      error: error.message,
      processingTime: processingTime,
    };
  }
}

/**
 * Run a single trial
 */
async function runTrial(road, timePeriod, level, trialNumber) {
  console.log(`\n[Trial ${trialNumber}] ${road.name} - ${timePeriod.name} - Level ${level}`);
  console.log('─'.repeat(60));
  
  const result = await getAssessment(road.name, road.location, level);
  
  // Display results
  if (result.success) {
    console.log(`✓ Success`);
    console.log(`  Safety Score: ${result.safetyScore}`);
    console.log(`  Safety Level: ${result.safetyLevel}`);
    console.log(`  Processing Time: ${result.processingTime.toFixed(2)}s`);
    console.log(`  Confidence: ${result.confidence}`);
    console.log(`  Data Sources: ${result.dataSources.join(', ') || 'N/A'}`);
    console.log(`  Condition: ${result.condition}`);
    console.log(`  Temperature: ${result.temperatureF}°F`);
  } else {
    console.log(`✗ Failed: ${result.error}`);
  }
  
  return {
    trialNumber,
    level,
    road: road.name,
    location: road.location,
    timePeriod: timePeriod.name,
    ...result,
  };
}

/**
 * Run all trials for a level
 */
async function runLevel(level) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RUNNING LEVEL ${level}`);
  console.log(`${'='.repeat(60)}\n`);
  
  const results = [];
  let trialNumber = 1;
  
  for (const road of TEST_ROADS) {
    for (const timePeriod of TIME_PERIODS) {
      const result = await runTrial(road, timePeriod, level, trialNumber);
      results.push(result);
      trialNumber++;
      
      // Wait 2 seconds between trials to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return results;
}

/**
 * Calculate statistics for a level
 */
function calculateStatistics(results) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  const correctAssessments = successful.length; // You'll need to add ground truth comparison
  const totalTrials = results.length;
  
  const avgProcessingTime = successful.length > 0
    ? successful.reduce((sum, r) => sum + r.processingTime, 0) / successful.length
    : 0;
  
  const avgConfidence = successful
    .filter(r => typeof r.confidence === 'number')
    .reduce((sum, r) => sum + r.confidence, 0) / successful.filter(r => typeof r.confidence === 'number').length || 0;
  
  return {
    totalTrials,
    successfulTrials: successful.length,
    failedTrials: failed.length,
    reliability: (successful.length / totalTrials) * 100, // This is uptime, not reliability
    avgProcessingTime: avgProcessingTime.toFixed(2),
    avgConfidence: avgConfidence.toFixed(1),
    systemUptime: (successful.length / totalTrials) * 100,
  };
}

/**
 * Export results to CSV
 */
function exportToCSV(results, level) {
  const csvHeader = 'Trial #,Level,Road,Location,Time Period,Success,Safety Score,Safety Level,Processing Time (s),Confidence,Data Sources,Condition,Temperature (°F),Error\n';
  
  const csvRows = results.map(r => {
    const dataSources = Array.isArray(r.dataSources) ? r.dataSources.join('; ') : 'N/A';
    return [
      r.trialNumber,
      r.level,
      `"${r.road}"`,
      `"${r.location}"`,
      `"${r.timePeriod}"`,
      r.success ? 'Yes' : 'No',
      r.safetyScore || 'N/A',
      r.safetyLevel || 'N/A',
      r.processingTime?.toFixed(2) || 'N/A',
      r.confidence || 'N/A',
      `"${dataSources}"`,
      r.condition || 'N/A',
      r.temperatureF || 'N/A',
      r.error || '',
    ].join(',');
  }).join('\n');
  
  const csv = csvHeader + csvRows;
  const filename = `experiment-level-${level}-${new Date().toISOString().split('T')[0]}.csv`;
  const filepath = path.join(__dirname, filename);
  
  fs.writeFileSync(filepath, csv);
  console.log(`\n✓ Results exported to: ${filename}`);
  
  return filepath;
}

/**
 * Main execution
 */
async function main() {
  console.log('WeatherBird Science Experiment Runner');
  console.log('===================================\n');
  
  if (!level) {
    console.log('Usage:');
    console.log('  node run-experiment.js --level 1 --road "I-89" --location "Burlington"');
    console.log('  node run-experiment.js --level 1 --all-roads');
    console.log('  node run-experiment.js --all-levels');
    console.log('\nOptions:');
    console.log('  --level N          Level to test (1-4)');
    console.log('  --road "NAME"      Single road to test');
    console.log('  --location "NAME"  Location for road');
    console.log('  --all-roads        Test all 10 roads for specified level');
    console.log('  --all-levels       Test all 4 levels for all roads');
    process.exit(1);
  }
  
  let allResults = [];
  
  if (allLevels) {
    // Run all 4 levels
    for (let l = 1; l <= 4; l++) {
      const results = await runLevel(l);
      allResults.push(...results);
      
      const stats = calculateStatistics(results);
      console.log(`\nLevel ${l} Statistics:`);
      console.log(`  Total Trials: ${stats.totalTrials}`);
      console.log(`  Successful: ${stats.successfulTrials}`);
      console.log(`  Failed: ${stats.failedTrials}`);
      console.log(`  System Uptime: ${stats.systemUptime.toFixed(1)}%`);
      console.log(`  Avg Processing Time: ${stats.avgProcessingTime}s`);
      console.log(`  Avg Confidence: ${stats.avgConfidence}%`);
      
      exportToCSV(results, l);
    }
  } else if (allRoads) {
    // Run all roads for specified level
    const results = await runLevel(level);
    allResults = results;
    
    const stats = calculateStatistics(results);
    console.log(`\nLevel ${level} Statistics:`);
    console.log(`  Total Trials: ${stats.totalTrials}`);
    console.log(`  Successful: ${stats.successfulTrials}`);
    console.log(`  Failed: ${stats.failedTrials}`);
    console.log(`  System Uptime: ${stats.systemUptime.toFixed(1)}%`);
    console.log(`  Avg Processing Time: ${stats.avgProcessingTime}s`);
    console.log(`  Avg Confidence: ${stats.avgConfidence}%`);
    
    exportToCSV(results, level);
  } else if (road && location) {
    // Single road test
    const roadObj = { name: road, location };
    const timePeriod = TIME_PERIODS[0]; // Use first time period
    const result = await runTrial(roadObj, timePeriod, level, 1);
    allResults = [result];
  } else {
    console.log('Error: Specify --all-roads or provide --road and --location');
    process.exit(1);
  }
  
  console.log('\n✓ Experiment complete!');
  console.log('\nNext steps:');
  console.log('1. Compare AI assessments to ground truth data');
  console.log('2. Calculate reliability and accuracy metrics');
  console.log('3. Fill in your data table with results');
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { getAssessment, runTrial, runLevel, calculateStatistics };
