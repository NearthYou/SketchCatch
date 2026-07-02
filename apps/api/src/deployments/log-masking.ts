const SECRET_PATTERNS = [
  /\/\/([^:\s/@]+):([^@\s]+)@/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /["']?\b(?:aws_access_key_id|awsAccessKeyId|accessKeyId|aws_secret_access_key|awsSecretAccessKey|secretAccessKey|aws_session_token|awsSessionToken|sessionToken|auth_token_secret|authTokenSecret|database_url|databaseUrl|external_id|externalId|client_secret|clientSecret|private_key|privateKey|secret_key|secretKey|password|token|secret)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi
];

export function maskDeploymentMessage(message: string): string {
  return SECRET_PATTERNS.reduce(
    (maskedMessage, pattern) => maskedMessage.replace(pattern, "[REDACTED]"),
    message
  );
}
