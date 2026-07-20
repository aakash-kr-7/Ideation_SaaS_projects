import { GeminiClient, type GeminiGenerator } from "./gemini.ts";

export interface StorageProvider {
  upload(path: string, bytes: Uint8Array, options: { contentType: string; upsert: boolean }): Promise<{ path: string }>;
}

export interface ResearchDependencies {
  createGemini: () => GeminiGenerator;
  storage: StorageProvider;
}

export function createProductionDependencies(db: any): ResearchDependencies {
  return {
    createGemini: () => new GeminiClient(),
    storage: {
      async upload(path, bytes, options) {
        const { error } = await db.storage.from("exports").upload(path, bytes, options);
        if (error) throw error;
        return { path };
      },
    },
  };
}
