/**
 * API endpoint to search the knowledge base
 * POST /api/knowledge/search
 * Body: { query: string, topK?: number }
 */

import { NextResponse } from 'next/server';
import { searchSimilar } from '@/lib/vectorStore';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, topK = 5 } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'query string is required' },
        { status: 400 }
      );
    }

    // Search vector store
    const results = await searchSimilar(query, topK);

    return NextResponse.json({
      success: true,
      query,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Error searching knowledge base:', error);
    return NextResponse.json(
      {
        error: 'Failed to search knowledge base',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

















