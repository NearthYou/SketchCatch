import "../config/load-env.js";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { AiTextProvider } from "./aiLlmExplanation.js";

const DEFAULT_OPENAI_MODEL = "gpt-5.5";
const OPENAI_TIMEOUT_MS = 30_000;
const OPENAI_MAX_RETRIES = 0;

const conflictClarificationSchema = z.object({
  status: z.literal("needs_clarification"),
  question: z.string().trim().min(1).max(600),
  suggestions: z.array(z.string().trim().min(1).max(300)).min(2).max(4)
});

type OpenAiConflictClarification = z.infer<typeof conflictClarificationSchema>;

type OpenAiArchitectureConflictResolverClient = {
  readonly responses: {
    readonly parse: (request: {
      readonly model: string;
      readonly instructions: string;
      readonly input: string;
      readonly text: { readonly format: unknown; readonly verbosity?: "low" | "medium" | "high" };
      readonly store?: boolean;
    }) => Promise<{ readonly output_parsed: OpenAiConflictClarification | null }>;
  };
};

export function createOpenAiArchitectureConflictResolverProviderFromEnv(): AiTextProvider | undefined {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return undefined;
  }

  const client = createDefaultOpenAiArchitectureConflictResolverClient({
    apiKey,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: OPENAI_MAX_RETRIES
  });

  return createOpenAiArchitectureConflictResolverProvider({
    client,
    model: process.env.OPENAI_ARCHITECTURE_CONFLICT_MODEL ?? process.env.OPENAI_MODEL
  });
}

export function createOpenAiArchitectureConflictResolverProvider(input: {
  readonly client: OpenAiArchitectureConflictResolverClient;
  readonly model?: string | undefined;
}): AiTextProvider {
  const model = input.model ?? DEFAULT_OPENAI_MODEL;

  return {
    provider: "openai",
    service: "openai_responses",
    model,
    generate: async (request) => {
      const response = await input.client.responses.parse({
        model,
        instructions: request.instructions,
        input: JSON.stringify({
          prompt: request.prompt,
          structuredContext: request.payload
        }),
        text: {
          format: zodTextFormat(conflictClarificationSchema, "architecture_requirement_conflict"),
          verbosity: "low"
        },
        store: false
      });
      const parsed = conflictClarificationSchema.parse(response.output_parsed);
      const text = JSON.stringify(parsed);

      return {
        text,
        outputCharacters: text.length
      };
    }
  };
}

function createDefaultOpenAiArchitectureConflictResolverClient(input: {
  readonly apiKey: string;
  readonly timeout: number;
  readonly maxRetries: number;
}): OpenAiArchitectureConflictResolverClient {
  const client = new OpenAI({
    apiKey: input.apiKey,
    timeout: input.timeout,
    maxRetries: input.maxRetries
  });

  return {
    responses: {
      parse: async (request) => {
        const response = await client.responses.parse({
          model: request.model,
          instructions: request.instructions,
          input: request.input,
          text: {
            format: zodTextFormat(conflictClarificationSchema, "architecture_requirement_conflict"),
            verbosity: "low"
          },
          store: false
        });

        return {
          output_parsed: response.output_parsed as OpenAiConflictClarification | null
        };
      }
    }
  };
}
