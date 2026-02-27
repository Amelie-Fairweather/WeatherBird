/**
 * API endpoint to link existing knowledge documents to database records
 * POST /api/knowledge/link
 * Body: { 
 *   pinecone_id: string,
 *   table: 'weather_data' | 'road_conditions',
 *   record_id: number,
 *   relationship_type?: string
 * }
 */

import { NextResponse } from 'next/server';
import { linkKnowledgeToWeather } from '@/lib/knowledgeLinks';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pinecone_id, table, record_id, relationship_type } = body;

    if (!pinecone_id || !table || !record_id) {
      return NextResponse.json(
        { error: 'pinecone_id, table, and record_id are required' },
        { status: 400 }
      );
    }

    // Currently only support weather_data links
    // Can be extended for other tables
    if (table === 'weather_data') {
      const link = await linkKnowledgeToWeather(
        pinecone_id,
        record_id,
        relationship_type || 'related'
      );

      return NextResponse.json({
        success: true,
        message: 'Link created successfully',
        link,
      });
    } else {
      return NextResponse.json(
        { error: `Linking to table '${table}' is not yet supported` },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error creating link:', error);
    return NextResponse.json(
      {
        error: 'Failed to create link',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

















