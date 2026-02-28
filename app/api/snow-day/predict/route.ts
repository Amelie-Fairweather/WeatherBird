import { predictSnowDay, predictSnowDaysForWeek, getProbabilityCategory } from '@/lib/snowDayPredictionService';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

/**
 * POST /api/snow-day/predict
 * Predict snow day probability for a district or location
 * 
 * Body: {
 *   district: string (zip code, district name, district ID, OR location like "Vermont", "Burlington", "Montpelier")
 *   date?: string (ISO date string, optional - if not provided, returns multi-day predictions for tomorrow + week)
 *   multiDay?: boolean (optional - defaults to true for week predictions)
 * }
 * 
 * If district is not found in database, uses Vermont-wide default thresholds and location-based weather data.
 * This allows the calculator to work with any location name until district-specific data is available.
 */
export async function POST(request: Request) {
  try {
    const { district, date, multiDay } = await request.json();

    if (!district) {
      return NextResponse.json(
        { error: 'District identifier is required (zip code, district name, district ID, or location like "Vermont")' },
        { status: 400 }
      );
    }

    // If a specific date is provided, do single-day prediction
    // Otherwise, default to multi-day (tomorrow + week ahead)
    const shouldDoMultiDay = multiDay !== false && !date;

    if (shouldDoMultiDay) {
      // Get multi-day predictions (tomorrow + next 7 days)
      let multiDayPredictions;
      try {
        multiDayPredictions = await predictSnowDaysForWeek(district);
      } catch (predictionError) {
        console.error('Error in predictSnowDaysForWeek:', predictionError);
        const errorMsg = predictionError instanceof Error ? predictionError.message : 'Unknown error';
        return NextResponse.json(
          { 
            error: 'Unable to generate predictions',
            details: `Failed to generate predictions: ${errorMsg}. This may be due to weather data unavailability, district lookup issues, or an issue with the prediction service.`,
            originalError: errorMsg
          },
          { status: 500 }
        );
      }
      
      if (!multiDayPredictions || multiDayPredictions.predictions.length === 0) {
        return NextResponse.json(
          { 
            error: 'Unable to generate predictions',
            details: 'Failed to generate multi-day snow day predictions. No predictions were returned. This may be due to weather data unavailability or an issue with the prediction service.'
          },
          { status: 500 }
        );
      }

      // Return multi-day format
      return NextResponse.json({
        district: multiDayPredictions.district_name,
        multiDay: true,
        predictions: multiDayPredictions.predictions.map(pred => ({
          predicted_for_date: pred.predicted_for_date,
          probabilities: {
            full_closing: pred.full_closing_probability,
            delay: pred.delay_probability,
            early_dismissal: pred.early_dismissal_probability,
          },
          categories: {
            full_closing: getProbabilityCategory(pred.full_closing_probability),
            delay: getProbabilityCategory(pred.delay_probability),
            early_dismissal: getProbabilityCategory(pred.early_dismissal_probability),
          },
          confidence: pred.confidence,
          forecast: {
            temperature_f: Math.round((pred.forecast.temperature * 9/5) + 32),
            snowfall_inches: pred.forecast.snowfall?.toFixed(1),
            wind_speed_mph: Math.round(pred.forecast.windSpeed * 2.237),
            condition: pred.forecast.condition,
          },
          factors: pred.factors,
        })),
      });
    }

    // Single-day prediction (if date is provided)
    const forecastDate = date ? new Date(date) : (() => {
      // Default to tomorrow if no date specified
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow;
    })();

    // Get prediction
    const prediction = await predictSnowDay(district, forecastDate);

    if (!prediction) {
      return NextResponse.json(
        { 
          error: 'Unable to generate prediction',
          details: 'Failed to generate snow day prediction. This may be due to weather data unavailability or an issue with the prediction service.'
        },
        { status: 500 }
      );
    }

    // Store prediction in database for accuracy tracking
    try {
      await supabase
        .from('snow_day_predictions')
        .insert({
          district_id: prediction.district_id,
          prediction_date: prediction.prediction_date,
          predicted_for_date: prediction.predicted_for_date,
          full_closing_probability: prediction.full_closing_probability,
          delay_probability: prediction.delay_probability,
          early_dismissal_probability: prediction.early_dismissal_probability,
          forecast_temperature: prediction.forecast.temperature,
          forecast_precipitation: prediction.forecast.precipitation,
          forecast_snowfall: prediction.forecast.snowfall,
          forecast_ice: prediction.forecast.ice,
          forecast_wind_speed: prediction.forecast.windSpeed,
          forecast_source: 'weather_api',
          prediction_confidence: prediction.confidence,
          factors_considered: prediction.factors,
        });
    } catch (dbError) {
      // Log but don't fail - prediction is still valid
      console.error('Error storing prediction:', dbError);
    }

    // Format response
    return NextResponse.json({
      district: prediction.district_name,
      prediction_date: prediction.prediction_date,
      predicted_for_date: prediction.predicted_for_date,
      probabilities: {
        full_closing: prediction.full_closing_probability,
        delay: prediction.delay_probability,
        early_dismissal: prediction.early_dismissal_probability,
      },
      categories: {
        full_closing: getProbabilityCategory(prediction.full_closing_probability),
        delay: getProbabilityCategory(prediction.delay_probability),
        early_dismissal: getProbabilityCategory(prediction.early_dismissal_probability),
      },
      confidence: prediction.confidence,
      forecast: {
        temperature_f: Math.round((prediction.forecast.temperature * 9/5) + 32),
        snowfall_inches: prediction.forecast.snowfall?.toFixed(1),
        wind_speed_mph: Math.round(prediction.forecast.windSpeed * 2.237),
        condition: prediction.forecast.condition,
      },
      factors: prediction.factors,
      thresholds: prediction.thresholds ? {
        full_closing_snowfall: prediction.thresholds.full_closing_snowfall_threshold,
        delay_snowfall: prediction.thresholds.delay_snowfall_threshold,
        ice_threshold: prediction.thresholds.ice_threshold,
      } : null,
    });
  } catch (error) {
    console.error('Error in snow day prediction:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Provide more specific error messages based on error type
    let details = 'Unable to generate snow day prediction';
    if (errorMessage.includes('weather') || errorMessage.includes('Weather')) {
      details = 'Failed to fetch weather data. Please check your weather API configuration and try again.';
    } else if (errorMessage.includes('district') || errorMessage.includes('District')) {
      details = 'District lookup failed. Please verify the district identifier (zip code, name, or location) and try again.';
    } else if (errorMessage.includes('forecast') || errorMessage.includes('Forecast')) {
      details = 'Failed to retrieve weather forecast. Please try again in a moment.';
    }
    
    return NextResponse.json(
      { 
        error: 'Unable to generate predictions',
        details: details,
        originalError: errorMessage
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/snow-day/predict?district=05401&date=2024-12-15&multiDay=true
 * If no date is provided, defaults to multi-day predictions (tomorrow + week)
 * 
 * district can be: zip code, district name, district ID, OR location (e.g., "Vermont", "Burlington")
 * If district not found, uses Vermont-wide defaults with location-based weather
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const district = searchParams.get('district');
    const date = searchParams.get('date');
    const multiDayParam = searchParams.get('multiDay');

    if (!district) {
      return NextResponse.json(
        { error: 'District parameter is required (zip code, district name, district ID, or location like "Vermont")' },
        { status: 400 }
      );
    }

    // Default to multi-day if no date specified
    const shouldDoMultiDay = (multiDayParam === 'true' || multiDayParam === null) && !date;

    if (shouldDoMultiDay) {
      // Get multi-day predictions (tomorrow + next 7 days)
      let multiDayPredictions;
      try {
        multiDayPredictions = await predictSnowDaysForWeek(district);
      } catch (predictionError) {
        console.error('Error in predictSnowDaysForWeek:', predictionError);
        const errorMsg = predictionError instanceof Error ? predictionError.message : 'Unknown error';
        return NextResponse.json(
          { 
            error: 'Unable to generate predictions',
            details: `Failed to generate predictions: ${errorMsg}. This may be due to weather data unavailability, district lookup issues, or an issue with the prediction service.`,
            originalError: errorMsg
          },
          { status: 500 }
        );
      }
      
      if (!multiDayPredictions || multiDayPredictions.predictions.length === 0) {
        return NextResponse.json(
          { 
            error: 'Unable to generate predictions',
            details: 'Failed to generate multi-day snow day predictions. No predictions were returned. This may be due to weather data unavailability or an issue with the prediction service.'
          },
          { status: 500 }
        );
      }

      // Return multi-day format
      return NextResponse.json({
        district: multiDayPredictions.district_name,
        multiDay: true,
        predictions: multiDayPredictions.predictions.map(pred => ({
          predicted_for_date: pred.predicted_for_date,
          probabilities: {
            full_closing: pred.full_closing_probability,
            delay: pred.delay_probability,
            early_dismissal: pred.early_dismissal_probability,
          },
          categories: {
            full_closing: getProbabilityCategory(pred.full_closing_probability),
            delay: getProbabilityCategory(pred.delay_probability),
            early_dismissal: getProbabilityCategory(pred.early_dismissal_probability),
          },
          confidence: pred.confidence,
          forecast: {
            temperature_f: Math.round((pred.forecast.temperature * 9/5) + 32),
            snowfall_inches: pred.forecast.snowfall?.toFixed(1),
            wind_speed_mph: Math.round(pred.forecast.windSpeed * 2.237),
            condition: pred.forecast.condition,
          },
          factors: pred.factors,
        })),
      });
    }

    // Single-day prediction (if date is provided)
    const forecastDate = date ? new Date(date) : (() => {
      // Default to tomorrow if no date specified
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow;
    })();
    
    const prediction = await predictSnowDay(district, forecastDate);

    if (!prediction) {
      return NextResponse.json(
        { 
          error: 'Unable to generate prediction',
          details: 'Failed to generate snow day prediction. This may be due to weather data unavailability or an issue with the prediction service.'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      district: prediction.district_name,
      prediction_date: prediction.prediction_date,
      predicted_for_date: prediction.predicted_for_date,
      probabilities: {
        full_closing: prediction.full_closing_probability,
        delay: prediction.delay_probability,
        early_dismissal: prediction.early_dismissal_probability,
      },
      categories: {
        full_closing: getProbabilityCategory(prediction.full_closing_probability),
        delay: getProbabilityCategory(prediction.delay_probability),
        early_dismissal: getProbabilityCategory(prediction.early_dismissal_probability),
      },
      confidence: prediction.confidence,
      forecast: {
        temperature_f: Math.round((prediction.forecast.temperature * 9/5) + 32),
        snowfall_inches: prediction.forecast.snowfall?.toFixed(1),
        wind_speed_mph: Math.round(prediction.forecast.windSpeed * 2.237),
        condition: prediction.forecast.condition,
      },
      factors: prediction.factors,
    });
  } catch (error) {
    console.error('Error in snow day prediction:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Provide more specific error messages based on error type
    let details = 'Unable to generate snow day prediction';
    if (errorMessage.includes('weather') || errorMessage.includes('Weather')) {
      details = 'Failed to fetch weather data. Please check your weather API configuration and try again.';
    } else if (errorMessage.includes('district') || errorMessage.includes('District')) {
      details = 'District lookup failed. Please verify the district identifier (zip code, name, or location) and try again.';
    } else if (errorMessage.includes('forecast') || errorMessage.includes('Forecast')) {
      details = 'Failed to retrieve weather forecast. Please try again in a moment.';
    }
    
    return NextResponse.json(
      { 
        error: 'Unable to generate predictions',
        details: details,
        originalError: errorMessage
      },
      { status: 500 }
    );
  }
}









