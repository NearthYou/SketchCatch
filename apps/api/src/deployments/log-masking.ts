const SECRET_PATTERNS = [
  /-----BEGIN ([A-Z0-9][A-Z0-9 ]{0,63})-----[\s\S]*?-----END \1-----/g,
  /["']?\bauthorization\b["']?\s*[:=]\s*["']?(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+["']?/gi,
  /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})\b/g,
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
