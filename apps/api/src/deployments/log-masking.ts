const SECRET_PATTERNS = [
  /\/\/([^:\s/@]+):([^@\s]+)@/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /["']?\baws_access_key_id\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
  /["']?\baws_secret_access_key\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
  /["']?\baws_session_token\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
  /["']?\bauth_token_secret\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
  /["']?\bdatabase_url\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
  /["']?\bpassword\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
  /["']?\btoken\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
  /["']?\bsecret\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi
];

export function maskDeploymentMessage(message: string): string {
  return SECRET_PATTERNS.reduce(
    (maskedMessage, pattern) => maskedMessage.replace(pattern, "[REDACTED]"),
    message
  );
}
