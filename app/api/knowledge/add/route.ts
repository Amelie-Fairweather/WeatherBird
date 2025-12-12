/**
 * API endpoint to add documents to the knowledge base
 * POST /api/knowledge/add
 * Body: { documents: [{ id, text, metadata }] }
 * 
 * Optionally link to Supabase records via metadata:
 * - supabase_table: 'weather_data' | 'road_conditions' | etc.
 * - supabase_id: The ID in that table
 */

import { NextResponse } from 'next/server';
import { addDocuments, Document } from '@/lib/vectorStore';
import { upsertKnowledgeDocument, linkKnowledgeToWeather } from '@/lib/knowledgeLinks';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { documents } = body;

    if (!documents || !Array.isArray(documents)) {
      return NextResponse.json(
        { error: 'documents array is required' },
        { status: 400 }
      );
    }

    // Validate and prepare documents
    const validDocuments: Document[] = documents.map((doc: any, index: number) => {
      if (!doc.text) {
        throw new Error(`Document at index ${index} is missing required field: text`);
      }
      return {
        id: doc.id || `doc-${Date.now()}-${index}`,
        text: doc.text,
        metadata: doc.metadata || {},
      };
    });

    // Add documents to vector store (Pinecone)
    await addDocuments(validDocuments);

    // Also store in Supabase and create links
    const linkedDocs = [];
    for (const doc of validDocuments) {
      try {
        // Store in Supabase knowledge_documents table
        await upsertKnowledgeDocument(doc.id, {
          title: doc.metadata?.title,
          category: doc.metadata?.category,
          source: doc.metadata?.source,
          content: doc.text,
        });

        // If linked to weather_data, create the link
        if (doc.metadata?.supabase_table === 'weather_data' && doc.metadata?.supabase_id) {
          await linkKnowledgeToWeather(
            doc.id,
            doc.metadata.supabase_id,
            doc.metadata.relationship_type || 'related'
          );
          linkedDocs.push({
            pinecone_id: doc.id,
            weather_data_id: doc.metadata.supabase_id,
          });
        }
      } catch (linkError) {
        // Log but don't fail - the document is still in Pinecone
        console.error(`Failed to link document ${doc.id}:`, linkError);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully added ${validDocuments.length} document(s) to knowledge base`,
      count: validDocuments.length,
      linked_documents: linkedDocs.length,
    });
  } catch (error) {
    console.error('Error adding documents:', error);
    return NextResponse.json(
      {
        error: 'Failed to add documents',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

