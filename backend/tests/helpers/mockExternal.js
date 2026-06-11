import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

export function mockAllExternal(jest) {
  jest.unstable_mockModule("resend", () => ({
    Resend: class {
      emails = { send: jest.fn().mockResolvedValue({ data: { id: "mock-email-id" } }) }
    },
  }));

  jest.unstable_mockModule("bullmq", () => ({
    Queue: class {
      add = jest.fn().mockResolvedValue({ id: "mock-job-id" })
      getJobs = jest.fn().mockResolvedValue([])
    },
  }));

  jest.unstable_mockModule("openai", () => ({
    default: class {
      chat = {
        completions: {
          create: jest.fn().mockImplementation(() => {
            const chunks = [
              { choices: [{ delta: { content: "test response " } }] },
              { choices: [{ delta: { content: "from mocked OpenAI" } }], usage: { prompt_tokens: 10, completion_tokens: 20 } },
            ];
            let i = 0;
            return {
              [Symbol.asyncIterator]: () => ({
                next: () => Promise.resolve({
                  done: i >= chunks.length,
                  value: chunks[i++],
                }),
              }),
            };
          }),
        },
      }
    },
  }));

  jest.unstable_mockModule("mem0ai", () => ({
    MemoryClient: class {
      add = jest.fn().mockResolvedValue({})
      search = jest.fn().mockResolvedValue([])
    },
  }));

  jest.unstable_mockModule("../utils/ragUtilities.js", () => ({
    scrapeWebpage: jest.fn().mockResolvedValue({ internalLinks: [], body: "" }),
    generateVectorEmbeddings: jest.fn().mockResolvedValue([]),
  }));

  jest.unstable_mockModule("../utils/ragClients.js", () => ({
    qdrant: {
      upsert: jest.fn().mockResolvedValue({}),
      search: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({}),
    },
    treeindex: jest.fn(),
  }));

  jest.unstable_mockModule("../utils/qdrantCleanup.js", () => ({
    cleanupQdrantCollections: jest.fn().mockResolvedValue(undefined),
  }));
}
