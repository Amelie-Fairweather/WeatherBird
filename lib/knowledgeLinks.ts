/**
 * Service for linking knowledge base documents to Supabase database records
 * This creates bidirectional links between Pinecone (vector store) and Supabase (relational data)
 */

import { supabase } from './supabaseClient';

export interface KnowledgeDocument {
  id: number;
  pinecone_id: string;
  title?: string;
  category?: string;
  source?: string;
  content?: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeWeatherLink {
  id: number;
  knowledge_document_id: number;
  weather_data_id: number;
  relationship_type?: string;
  created_at: string;
}

/**
 * Create or update a knowledge document record in Supabase
 * This tracks the document and links it to Pinecone via pinecone_id
 */
export async function upsertKnowledgeDocument(
  pineconeId: string,
  data: {
    title?: string;
    category?: string;
    source?: string;
    content?: string;
  }
): Promise<KnowledgeDocument> {
  const { data: document, error } = await supabase
    .from('knowledge_documents')
    .upsert(
      {
        pinecone_id: pineconeId,
        title: data.title,
        category: data.category,
        source: data.source,
        content: data.content,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'pinecone_id',
      }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert knowledge document: ${error.message}`);
  }

  return document;
}

/**
 * Link a knowledge document to a weather data record
 */
export async function linkKnowledgeToWeather(
  pineconeId: string,
  weatherDataId: number,
  relationshipType: string = 'related'
): Promise<KnowledgeWeatherLink> {
  // First, get the knowledge document ID
  const { data: knowledgeDoc, error: docError } = await supabase
    .from('knowledge_documents')
    .select('id')
    .eq('pinecone_id', pineconeId)
    .single();

  if (docError || !knowledgeDoc) {
    throw new Error(`Knowledge document not found: ${pineconeId}`);
  }

  // Create the link
  const { data: link, error: linkError } = await supabase
    .from('knowledge_weather_links')
    .insert({
      knowledge_document_id: knowledgeDoc.id,
      weather_data_id: weatherDataId,
      relationship_type: relationshipType,
    })
    .select()
    .single();

  if (linkError) {
    // If link already exists, return it
    if (linkError.code === '23505') {
      const { data: existingLink } = await supabase
        .from('knowledge_weather_links')
        .select('*')
        .eq('knowledge_document_id', knowledgeDoc.id)
        .eq('weather_data_id', weatherDataId)
        .single();
      return existingLink!;
    }
    throw new Error(`Failed to create link: ${linkError.message}`);
  }

  return link;
}

/**
 * Get all weather data linked to a knowledge document
 */
export async function getLinkedWeatherData(
  pineconeId: string
): Promise<any[]> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select(`
      id,
      knowledge_weather_links (
        relationship_type,
        weather_data:weather_data_id (
          id,
          location,
          temperature,
          humidity,
          pressure,
          description,
          wind_speed,
          timestamp
        )
      )
    `)
    .eq('pinecone_id', pineconeId)
    .single();

  if (error || !data) {
    return [];
  }

  // Flatten the results
  const weatherData = (data.knowledge_weather_links as any[])?.map(
    (link: any) => link.weather_data
  ) || [];

  return weatherData;
}

/**
 * Get all knowledge documents linked to a weather data record
 */
export async function getLinkedKnowledgeDocuments(
  weatherDataId: number
): Promise<KnowledgeDocument[]> {
  const { data, error } = await supabase
    .from('knowledge_weather_links')
    .select(`
      relationship_type,
      knowledge_documents:knowledge_document_id (
        id,
        pinecone_id,
        title,
        category,
        source,
        content
      )
    `)
    .eq('weather_data_id', weatherDataId);

  if (error || !data) {
    return [];
  }

  return (data as any[]).map((link: any) => link.knowledge_documents);
}

/**
 * Get knowledge document by Pinecone ID
 */
export async function getKnowledgeDocument(
  pineconeId: string
): Promise<KnowledgeDocument | null> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('*')
    .eq('pinecone_id', pineconeId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Search knowledge documents by category or source
 */
export async function searchKnowledgeDocuments(filters: {
  category?: string;
  source?: string;
}): Promise<KnowledgeDocument[]> {
  let query = supabase.from('knowledge_documents').select('*');

  if (filters.category) {
    query = query.eq('category', filters.category);
  }

  if (filters.source) {
    query = query.eq('source', filters.source);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error searching knowledge documents:', error);
    return [];
  }

  return data || [];
}







