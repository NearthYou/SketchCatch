import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTranscribeRequirementService,
  type TranscribeAwsClient
} from "./aiTranscribe.js";

process.env.NODE_ENV = "test";

test("createTranscribeRequirementService blocks AWS calls when Transcribe credit is not confirmed", async () => {
  const calls: unknown[] = [];
  const service = createTranscribeRequirementService({
    client: {
      send: async (command) => {
        calls.push(command);
        return {};
      }
    },
    creditPolicy: {
      bedrock: false,
      amazonQ: false,
      transcribe: false,
      billingMode: "aws_credit_only"
    },
    region: "ap-northeast-2",
    languageCode: "ko-KR",
    mediaBucket: "voice-inputs"
  });

  const result = await service.start({
    mediaUri: "s3://voice-inputs/request.wav",
    mediaFormat: "wav"
  });

  assert.equal(result.status, "failed");
  assert.equal(result.confirmedByUser, false);
  assert.equal(result.providerMetadata.provider, "fallback");
  assert.equal(result.providerMetadata.routeTarget, "voice_requirement_transcription");
  assert.equal(calls.length, 0);
});

test("createTranscribeRequirementService starts a Transcribe job for allowed S3 media", async () => {
  const calls: unknown[] = [];
  const client: TranscribeAwsClient = {
    send: async (command) => {
      calls.push(command);
      return {
        TranscriptionJob: {
          TranscriptionJobName: "job-123",
          TranscriptionJobStatus: "IN_PROGRESS"
        }
      };
    }
  };
  const service = createTranscribeRequirementService({
    client,
    creditPolicy: {
      bedrock: false,
      amazonQ: false,
      transcribe: true,
      billingMode: "aws_credit_only"
    },
    region: "ap-northeast-2",
    languageCode: "ko-KR",
    mediaBucket: "voice-inputs"
  });

  const result = await service.start({
    mediaUri: "s3://voice-inputs/request.wav",
    mediaFormat: "wav"
  });

  assert.equal(result.status, "transcribing");
  assert.equal(result.confirmedByUser, false);
  assert.equal(result.providerMetadata.provider, "amazon_transcribe");
  assert.equal(result.providerMetadata.service, "amazon_transcribe");
  assert.equal(calls.length, 1);
});

test("createTranscribeRequirementService returns awaiting confirmation when transcript is ready", async () => {
  const service = createTranscribeRequirementService({
    client: {
      send: async () => ({
        TranscriptionJob: {
          TranscriptionJobName: "job-123",
          TranscriptionJobStatus: "COMPLETED",
          Transcript: {
            TranscriptFileUri: "https://example.test/transcript.json"
          }
        }
      })
    },
    fetchTranscriptJson: async () => ({
      results: {
        transcripts: [{ transcript: "EC2와 S3가 있는 연습용 아키텍처를 만들어줘" }]
      }
    }),
    creditPolicy: {
      bedrock: false,
      amazonQ: false,
      transcribe: true,
      billingMode: "aws_credit_only"
    },
    region: "ap-northeast-2",
    languageCode: "ko-KR",
    mediaBucket: "voice-inputs"
  });

  const result = await service.getConfirmation("job-123");

  assert.equal(result.status, "awaiting_user_confirmation");
  assert.equal(result.transcriptText, "EC2와 S3가 있는 연습용 아키텍처를 만들어줘");
  assert.equal(result.confirmedByUser, false);
});

test("confirmTranscript creates a Requirement Prompt only after user confirmation", () => {
  const service = createTranscribeRequirementService({
    client: {
      send: async () => ({})
    },
    creditPolicy: {
      bedrock: false,
      amazonQ: false,
      transcribe: false,
      billingMode: "aws_credit_only"
    },
    region: "ap-northeast-2",
    languageCode: "ko-KR",
    mediaBucket: "voice-inputs"
  });

  const result = service.confirmTranscript({
    transcriptText: "원본 전사",
    confirmedText: "수정된 요구사항",
    confirmedByUserId: "user-1"
  });

  assert.equal(result.requirementPrompt.text, "수정된 요구사항");
  assert.equal(result.requirementPrompt.confirmedByUser, true);
  assert.equal(result.confirmation.confirmedByUser, true);
});
