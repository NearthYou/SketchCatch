import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveArchitectureResourceQuantities } from "./aiArchitectureResourceQuantities.js";

test("resolveArchitectureResourceQuantities reads explicit EC2 and S3 counts near resource names", () => {
  assert.deepEqual(resolveArchitectureResourceQuantities("EC2 3대와 S3 2개가 필요해"), {
    ec2Instances: 3,
    s3Buckets: 2
  });
  assert.deepEqual(resolveArchitectureResourceQuantities("3 EC2 instances and 2 S3 buckets"), {
    ec2Instances: 3,
    s3Buckets: 2
  });
  assert.deepEqual(resolveArchitectureResourceQuantities("three EC2 instances and two S3 buckets"), {
    ec2Instances: 3,
    s3Buckets: 2
  });
});

test("resolveArchitectureResourceQuantities keeps equivalent upload requests at one server and one bucket", () => {
  const prompts = [
    "EC2 서버 하나랑 이미지 저장용 S3 버킷이 있는 연습용 구조를 만들어줘",
    "연습용으로 서버 한 대에서 이미지 파일을 저장하는 구조를 만들어줘",
    "연습용 파일 업로드 서버 구조를 만들어줘",
    "연습용으로 서버가 파일을 받아 이미지 저장 공간에 보관하는 구조를 설계해줘",
    "연습용 작은 서버 서비스에서 사용자가 이미지를 올리는 구조를 만들어줘"
  ];

  for (const prompt of prompts) {
    assert.deepEqual(
      resolveArchitectureResourceQuantities(prompt),
      { ec2Instances: 1, s3Buckets: 1 },
      prompt
    );
  }
});

