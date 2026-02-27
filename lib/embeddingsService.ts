/**
 * Service for creating embeddings using OpenAI
 * Converts text documents into vector embeddings for semantic search
 */

import { openai } from './openaiClient';

/**
 * Create embeddings for a text string
 * @param text - The text to convert to embeddings
 * @returns Array of numbers representing the embedding vector
 */
export async function createEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small', // Cost-effective, good quality
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error creating embedding:', error);
    throw new Error('Failed to create embedding');
  }
}

/**
 * Create embeddings for multiple texts
 * @param texts - Array of texts to convert to embeddings
 * @returns Array of embedding vectors
 */
export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });

    return response.data.map(item => item.embedding);
  } catch (error) {
    console.error('Error creating embeddings:', error);
    throw new Error('Failed to create embeddings');
  }
}

/**
 * Split text into chunks for embedding
 * Useful for long documents that need to be split into smaller pieces
 */
export function chunkText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
  }

  return chunks;
}

















