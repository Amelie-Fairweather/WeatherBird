/**
 * Vector store service using Pinecone
 * Handles storing and retrieving document embeddings
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { createEmbedding } from './embeddingsService';

// Initialize Pinecone client
let pineconeClient: Pinecone | null = null;

function getPineconeClient(): Pinecone {
  if (!pineconeClient) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error('PINECONE_API_KEY is not set in environment variables');
    }
    pineconeClient = new Pinecone({ apiKey });
  }
  return pineconeClient;
}

export interface Document {
  id: string;
  text: string;
  metadata?: {
    title?: string;
    source?: string;
    category?: string;
    timestamp?: string;
    // Database linking fields
    supabase_table?: string; // e.g., 'weather_data', 'road_conditions'
    supabase_id?: number; // The ID in the Supabase table
    [key: string]: any;
  };
}

/**
 * Initialize or get the Pinecone index
 */
export async function getIndex(indexName: string = 'weatherbird-knowledge') {
  const pinecone = getPineconeClient();
  
  // List existing indexes
  const indexes = await pinecone.listIndexes();
  const indexExists = indexes.indexes?.some(idx => idx.name === indexName);

  if (!indexExists) {
    // Create index if it doesn't exist
    await pinecone.createIndex({
      name: indexName,
      dimension: 1536, // text-embedding-3-small dimension
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1',
        },
      },
    });
    
    // Wait for index to be ready
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  return pinecone.index(indexName);
}

/**
 * Add a document to the vector store
 */
export async function addDocument(
  document: Document,
  indexName: string = 'weatherbird-knowledge'
): Promise<void> {
  try {
    const index = await getIndex(indexName);
    
    // Create embedding for the document text
    const embedding = await createEmbedding(document.text);
    
    // Prepare metadata
    const metadata = {
      text: document.text,
      ...document.metadata,
    };
    
    // Upsert to Pinecone
    await index.upsert([
      {
        id: document.id,
        values: embedding,
        metadata: metadata,
      },
    ]);
  } catch (error) {
    console.error('Error adding document to vector store:', error);
    throw error;
  }
}

/**
 * Add multiple documents to the vector store
 */
export async function addDocuments(
  documents: Document[],
  indexName: string = 'weatherbird-knowledge'
): Promise<void> {
  try {
    const index = await getIndex(indexName);
    
    // Create embeddings for all documents
    const texts = documents.map(doc => doc.text);
    const embeddings = await createEmbedding(texts);
    
    // Prepare vectors for upsert
    const vectors = documents.map((doc, i) => ({
      id: doc.id,
      values: embeddings[i],
      metadata: {
        text: doc.text,
        ...doc.metadata,
      },
    }));
    
    // Upsert in batches (Pinecone recommends batches of 100)
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await index.upsert(batch);
    }
  } catch (error) {
    console.error('Error adding documents to vector store:', error);
    throw error;
  }
}

/**
 * Search for similar documents
 * @param query - The search query
 * @param topK - Number of results to return (default: 5)
 * @param filter - Optional metadata filter
 * @returns Array of matching documents with scores
 */
export async function searchSimilar(
  query: string,
  topK: number = 5,
  indexName: string = 'weatherbird-knowledge',
  filter?: Record<string, any>
): Promise<Array<{ text: string; metadata: any; score: number }>> {
  try {
    const index = await getIndex(indexName);
    
    // Create embedding for the query
    const queryEmbedding = await createEmbedding(query);
    
    // Search Pinecone
    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK: topK,
      includeMetadata: true,
      ...(filter && { filter }),
    });
    
    // Format results
    return (queryResponse.matches || []).map(match => ({
      text: (match.metadata?.text as string) || '',
      metadata: match.metadata || {},
      score: match.score || 0,
    }));
  } catch (error) {
    console.error('Error searching vector store:', error);
    return [];
  }
}

/**
 * Delete a document from the vector store
 */
export async function deleteDocument(
  documentId: string,
  indexName: string = 'weatherbird-knowledge'
): Promise<void> {
  try {
    const index = await getIndex(indexName);
    await index.deleteOne(documentId);
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
}

