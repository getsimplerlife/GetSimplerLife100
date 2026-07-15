import { db } from "../db/index";
import { sql } from "drizzle-orm";

export interface DocumentChunk {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

export interface DocumentRecord {
  id: string;
  title: string;
  mimeType: string;
  uploadedAt: number;
  chunkCount: number;
}

// Chunks text into overlapping segments
function chunkText(text: string, chunkSize: number = 1000, chunkOverlap: number = 200): string[] {
  const chunks: string[] = [];
  if (!text) return chunks;
  
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    if (end > text.length) {
      end = text.length;
    } else {
      // Try to find a clean break (newline or space) near the end to avoid breaking words/sentences
      const lastSpace = text.lastIndexOf(" ", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const bestBreak = Math.max(lastSpace, lastNewline);
      if (bestBreak > start + chunkSize / 2) {
        end = bestBreak;
      }
    }
    chunks.push(text.slice(start, end).trim());
    start = end - chunkOverlap;
    if (start >= text.length - chunkOverlap) {
      break;
    }
    if (start < 0) start = 0;
  }
  return chunks.filter(c => c.length > 10); // filter out tiny/empty chunks
}

// Generate embeddings via OpenAI embedding-3-small
async function getEmbeddings(inputs: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set for embedding generation");
  }

  if (inputs.length === 0) return [];

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: inputs,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Embeddings API error ${response.status}: ${errorText}`);
  }

  const result = await response.json() as any;
  // Sort by index to preserve input order
  const sortedData = result.data.sort((a: any, b: any) => a.index - b.index);
  return sortedData.map((item: any) => item.embedding);
}

// Dot product similarity (since embeddings are normalized to unit length, dot product equals cosine similarity)
function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

export class KnowledgeBase {
  static async addDocument(
    userId: string,
    title: string,
    mimeType: string,
    text: string
  ): Promise<string> {
    const documentId = crypto.randomUUID();
    const chunks = chunkText(text, 1000, 200);
    
    // Generate embeddings in batch
    const embeddings: number[][] = [];
    const batchSize = 100;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchEmbeddings = await getEmbeddings(batch);
      embeddings.push(...batchEmbeddings);
    }

    const now = Date.now();

    // 1. Save parent document record
    const docData = {
      title,
      mimeType,
      uploadedAt: now,
      chunkCount: chunks.length,
    };
    await db.run(
      sql.raw(
        `INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) 
         VALUES ('${documentId}', '${userId}', 'knowledge_documents', '${JSON.stringify(docData).replace(/'/g, "''")}', ${now}, ${now})`
      )
    );

    // 2. Save document chunks and embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = crypto.randomUUID();
      const chunkData = {
        documentId,
        documentTitle: title,
        chunkIndex: i,
        content: chunks[i],
        embedding: embeddings[i],
      };
      await db.run(
        sql.raw(
          `INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) 
           VALUES ('${chunkId}', '${userId}', 'knowledge_chunks', '${JSON.stringify(chunkData).replace(/'/g, "''")}', ${now}, ${now})`
        )
      );
    }

    return documentId;
  }
  
  static async deleteDocument(userId: string, documentId: string): Promise<void> {
    // Select all chunks for safety
    const rows = await db.all(
      sql.raw(`SELECT id, data FROM portal_data WHERE user_id = '${userId}' AND section = 'knowledge_chunks'`)
    );
    const toDelete: string[] = [];
    for (const row of rows) {
      const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      if (data && data.documentId === documentId) {
        toDelete.push(row.id);
      }
    }
    
    for (const id of toDelete) {
      await db.run(
        sql.raw(`DELETE FROM portal_data WHERE id = '${id}' AND user_id = '${userId}' AND section = 'knowledge_chunks'`)
      );
    }
    
    // Delete parent
    await db.run(
      sql.raw(`DELETE FROM portal_data WHERE id = '${documentId}' AND user_id = '${userId}' AND section = 'knowledge_documents'`)
    );
  }

  static async listDocuments(userId: string): Promise<any[]> {
    const rows = await db.all(
      sql.raw(
        `SELECT id, data, created_at FROM portal_data WHERE user_id = '${userId}' AND section = 'knowledge_documents' ORDER BY created_at DESC`
      )
    );
    return rows.map((row: any) => {
      const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      return { id: row.id, ...data, createdAt: row.created_at };
    });
  }

  static async search(
    query: string,
    userId: string,
    limit: number = 5
  ): Promise<{ content: string; documentTitle: string; similarity: number }[]> {
    const queryEmbeddings = await getEmbeddings([query]);
    const queryEmbedding = queryEmbeddings[0];
    if (!queryEmbedding) return [];

    const rows = await db.all(
      sql.raw(
        `SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'knowledge_chunks'`
      )
    );

    const results: { content: string; documentTitle: string; similarity: number }[] = [];

    for (const row of rows) {
      const chunk = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      if (chunk && chunk.embedding && Array.isArray(chunk.embedding)) {
        const sim = dotProduct(queryEmbedding, chunk.embedding);
        results.push({
          content: chunk.content,
          documentTitle: chunk.documentTitle,
          similarity: sim,
        });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }
}

export async function queryKnowledgeBase(
  query: string,
  userId: string
): Promise<{ answer: string; citations: string[] }> {
  const chunks = await KnowledgeBase.search(query, userId, 5);
  
  if (chunks.length === 0) {
    return {
      answer: "No documents have been uploaded to the knowledge base yet. Please upload files (such as company handbooks or compliance documents) so that I can assist you with your questions.",
      citations: [],
    };
  }

  const contextText = chunks
    .map((c, i) => `[Source ${i + 1} - ${c.documentTitle}]:\n${c.content}`)
    .join("\n\n");

  const systemPrompt = `You are the Internal Knowledge Assistant. Your job is to answer the user's question using ONLY the provided document sources.
  
If you can't find the answer in the sources, say honestly that you don't know based on the uploaded documents. Do not make things up.

For every factual claim you make, cite your source using bracket notation like [Source 1], [Source 2], etc. based on the list below. Do not output anything other than the factual answer and citations.

Document Context:
${contextText}`;

  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set for querying");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query }
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Chat API error ${response.status}: ${errorText}`);
  }

  const result = await response.json() as any;
  const answer = result.choices[0].message.content.trim();

  const citationsSet = new Set<string>();
  for (let i = 0; i < chunks.length; i++) {
    const citationTag = `[Source ${i + 1}]`;
    if (answer.includes(citationTag)) {
      citationsSet.add(chunks[i].documentTitle);
    }
  }

  return {
    answer,
    citations: Array.from(citationsSet),
  };
}
