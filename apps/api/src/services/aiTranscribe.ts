import { randomUUID } from "node:crypto";
import {
  GetTranscriptionJobCommand,
  type LanguageCode,
  StartTranscriptionJobCommand,
  TranscribeClient
} from "@aws-sdk/client-transcribe";
import type {
  AiBillingMode,
  AiProviderMetadata,
  ConfirmTranscribeRequest,
  ConfirmTranscribeResponse,
  TranscribeConfirmation,
  VoiceRequirementInput
} from "@sketchcatch/types";
import {
  createNormalizedAiCacheKey,
  estimateAiUsage,
  maskSecretsForAi
} from "./aiProviderSafety.js";
import type { AiCreditPolicy } from "./aiLlmExplanation.js";

export type TranscribeAwsClient = {
  readonly send: (command: unknown) => Promise<unknown>;
};

export type TranscribeRequirementService = {
  readonly start: (input: VoiceRequirementInput) => Promise<TranscribeConfirmation>;
  readonly getConfirmation: (jobName: string) => Promise<TranscribeConfirmation>;
  readonly confirmTranscript: (input: ConfirmTranscribeRequest) => ConfirmTranscribeResponse;
};

export type CreateTranscribeRequirementServiceOptions = {
  readonly client?: TranscribeAwsClient | undefined;
  readonly fetchTranscriptJson?: ((uri: string) => Promise<unknown>) | undefined;
  readonly creditPolicy?: AiCreditPolicy | undefined;
  readonly region?: string | undefined;
  readonly languageCode?: string | undefined;
  readonly mediaBucket?: string | undefined;
};

type TranscribeJobResponse = {
  readonly TranscriptionJob?: {
    readonly TranscriptionJobName?: string | undefined;
    readonly TranscriptionJobStatus?: string | undefined;
    readonly FailureReason?: string | undefined;
    readonly Transcript?: {
      readonly TranscriptFileUri?: string | undefined;
    } | undefined;
  } | undefined;
};

export function createConfiguredTranscribeRequirementService(): TranscribeRequirementService {
  const region = process.env.AWS_REGION ?? "ap-northeast-2";

  return createTranscribeRequirementService({
    client: new TranscribeClient({ region }) as TranscribeAwsClient,
    creditPolicy: readAiCreditPolicyFromEnv(),
    region,
    languageCode: process.env.TRANSCRIBE_LANGUAGE_CODE ?? "ko-KR",
    mediaBucket: process.env.TRANSCRIBE_MEDIA_BUCKET
  });
}

export function createTranscribeRequirementService(
  options: CreateTranscribeRequirementServiceOptions
): TranscribeRequirementService {
  const region = options.region ?? "ap-northeast-2";
  const languageCode = options.languageCode ?? "ko-KR";
  const creditPolicy = options.creditPolicy ?? readAiCreditPolicyFromEnv();
  const client = options.client ?? (new TranscribeClient({ region }) as TranscribeAwsClient);
  const fetchTranscriptJson = options.fetchTranscriptJson ?? fetchJson;

  return {
    start: async (input) => {
      if (!isTranscribeCreditConfirmed(creditPolicy)) {
        return createFailedConfirmation({
          billingMode: creditPolicy.billingMode,
          failureReason: "TRANSCRIBE_CREDIT_CONFIRMED is required",
          voiceRequirementInput: input
        });
      }

      if (!isAllowedMediaUri(input.mediaUri, options.mediaBucket)) {
        return createFailedConfirmation({
          billingMode: creditPolicy.billingMode,
          failureReason: "Voice Requirement Input media must be in the configured S3 bucket",
          voiceRequirementInput: input
        });
      }

      const jobName = `sketchcatch-voice-${randomUUID()}`;
      const command = new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        LanguageCode: (input.languageCode ?? languageCode) as LanguageCode,
        MediaFormat: input.mediaFormat,
        Media: {
          MediaFileUri: input.mediaUri
        }
      });
      const response = (await client.send(command)) as TranscribeJobResponse;

      return {
        transcriptionJobName: response.TranscriptionJob?.TranscriptionJobName ?? jobName,
        voiceRequirementInput: input,
        transcriptText: null,
        confirmedText: null,
        confirmedByUser: false,
        status: "transcribing",
        providerMetadata: createTranscribeMetadata({
          billingMode: creditPolicy.billingMode,
          cacheKeyPayload: input,
          routeTarget: "voice_requirement_transcription"
        })
      };
    },
    getConfirmation: async (jobName) => {
      if (!isTranscribeCreditConfirmed(creditPolicy)) {
        return createFailedConfirmation({
          billingMode: creditPolicy.billingMode,
          failureReason: "TRANSCRIBE_CREDIT_CONFIRMED is required",
          jobName,
          voiceRequirementInput: null
        });
      }

      const response = (await client.send(
        new GetTranscriptionJobCommand({
          TranscriptionJobName: jobName
        })
      )) as TranscribeJobResponse;
      const job = response.TranscriptionJob;
      const status = job?.TranscriptionJobStatus;

      if (status === "FAILED") {
        return createFailedConfirmation({
          billingMode: creditPolicy.billingMode,
          failureReason: job?.FailureReason ?? "Amazon Transcribe job failed",
          jobName,
          voiceRequirementInput: null
        });
      }

      if (status !== "COMPLETED") {
        return {
          transcriptionJobName: job?.TranscriptionJobName ?? jobName,
          voiceRequirementInput: null,
          transcriptText: null,
          confirmedText: null,
          confirmedByUser: false,
          status: "transcribing",
          providerMetadata: createTranscribeMetadata({
            billingMode: creditPolicy.billingMode,
            cacheKeyPayload: { jobName },
            routeTarget: "voice_requirement_transcription"
          })
        };
      }

      const transcriptUri = job?.Transcript?.TranscriptFileUri;
      const transcriptJson = transcriptUri === undefined ? null : await fetchTranscriptJson(transcriptUri);
      const transcriptText = extractTranscriptText(transcriptJson);

      return {
        transcriptionJobName: job?.TranscriptionJobName ?? jobName,
        voiceRequirementInput: null,
        transcriptText,
        confirmedText: null,
        confirmedByUser: false,
        status: transcriptText === null ? "failed" : "awaiting_user_confirmation",
        failureReason: transcriptText === null ? "Transcript text was not available" : undefined,
        providerMetadata: createTranscribeMetadata({
          billingMode: creditPolicy.billingMode,
          cacheKeyPayload: { jobName, transcriptUri },
          routeTarget: "voice_requirement_transcription",
          outputCharacters: transcriptText?.length
        })
      };
    },
    confirmTranscript: (input) => {
      const confirmedAt = new Date().toISOString();
      const confirmedText = input.confirmedText.trim();
      const confirmation: TranscribeConfirmation = {
        transcriptionJobName: null,
        voiceRequirementInput: null,
        transcriptText: input.transcriptText,
        confirmedText,
        confirmedByUser: true,
        confirmedByUserId: input.confirmedByUserId,
        status: "confirmed",
        providerMetadata: createTranscribeMetadata({
          billingMode: creditPolicy.billingMode,
          cacheKeyPayload: {
            transcriptText: input.transcriptText,
            confirmedText
          },
          routeTarget: "voice_requirement_confirmation"
        })
      };

      return {
        confirmation,
        requirementPrompt: {
          text: confirmedText,
          source: "voice_transcript",
          requirementInput: {
            mode: "voice",
            text: confirmedText,
            transcriptSource: "amazon_transcribe",
            confirmedByUser: true
          },
          confirmedByUser: true,
          confirmedByUserId: input.confirmedByUserId,
          confirmedAt
        }
      };
    }
  };
}

function createFailedConfirmation(input: {
  readonly billingMode: AiBillingMode;
  readonly failureReason: string;
  readonly jobName?: string | undefined;
  readonly voiceRequirementInput: VoiceRequirementInput | null;
}): TranscribeConfirmation {
  return {
    transcriptionJobName: input.jobName ?? null,
    voiceRequirementInput: input.voiceRequirementInput,
    transcriptText: null,
    confirmedText: null,
    confirmedByUser: false,
    status: "failed",
    failureReason: input.failureReason,
    providerMetadata: createTranscribeMetadata({
      provider: "fallback",
      service: "rule_fallback",
      billingMode: input.billingMode,
      cacheKeyPayload: {
        jobName: input.jobName ?? null,
        voiceRequirementInput: input.voiceRequirementInput,
        failureReason: input.failureReason
      },
      routeTarget: "voice_requirement_transcription"
    })
  };
}

function createTranscribeMetadata(input: {
  readonly provider?: "amazon_transcribe" | "fallback" | undefined;
  readonly service?: "amazon_transcribe" | "rule_fallback" | undefined;
  readonly billingMode: AiBillingMode;
  readonly cacheKeyPayload: unknown;
  readonly routeTarget: string;
  readonly outputCharacters?: number | undefined;
}): AiProviderMetadata {
  const provider = input.provider ?? "amazon_transcribe";
  const service = input.service ?? "amazon_transcribe";
  const payload = maskSecretsForAi(input.cacheKeyPayload);

  return {
    provider,
    service,
    routeTarget: input.routeTarget,
    cacheHit: false,
    cacheKey: createNormalizedAiCacheKey({
      provider,
      routeTarget: input.routeTarget,
      payload
    }),
    estimatedUsage: estimateAiUsage(payload, input.outputCharacters),
    billingMode: input.billingMode,
    generatedAt: new Date().toISOString()
  };
}

function isTranscribeCreditConfirmed(creditPolicy: AiCreditPolicy): boolean {
  return creditPolicy.billingMode === "aws_credit_only" && creditPolicy.transcribe;
}

function isAllowedMediaUri(mediaUri: string, mediaBucket: string | undefined): boolean {
  if (!mediaUri.startsWith("s3://")) {
    return false;
  }

  if (mediaBucket === undefined || mediaBucket.trim().length === 0) {
    return true;
  }

  return mediaUri.startsWith(`s3://${mediaBucket.replace(/^s3:\/\//, "").replace(/\/+$/, "")}/`);
}

async function fetchJson(uri: string): Promise<unknown> {
  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error("Failed to fetch Amazon Transcribe transcript");
  }

  return response.json() as Promise<unknown>;
}

function extractTranscriptText(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const results = (value as { readonly results?: unknown }).results;

  if (typeof results !== "object" || results === null) {
    return null;
  }

  const transcripts = (results as { readonly transcripts?: unknown }).transcripts;

  if (!Array.isArray(transcripts)) {
    return null;
  }

  const transcript = transcripts[0];

  if (typeof transcript !== "object" || transcript === null) {
    return null;
  }

  const text = (transcript as { readonly transcript?: unknown }).transcript;

  return typeof text === "string" && text.trim().length > 0 ? text.trim() : null;
}

function readAiCreditPolicyFromEnv(): AiCreditPolicy {
  return {
    bedrock: process.env.BEDROCK_CREDIT_CONFIRMED === "true",
    amazonQ: process.env.AMAZON_Q_CREDIT_CONFIRMED === "true",
    transcribe: process.env.TRANSCRIBE_CREDIT_CONFIRMED === "true",
    billingMode: readBillingMode()
  };
}

function readBillingMode(): AiBillingMode {
  switch (process.env.AI_BILLING_MODE) {
    case "aws_credit_only":
      return "aws_credit_only";
    case "standard":
      return "standard";
    case "disabled":
      return "disabled";
    default:
      return "disabled";
  }
}
