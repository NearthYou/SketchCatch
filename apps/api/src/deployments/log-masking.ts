const SECRET_PATTERNS = [
    /["']?\baws_access_key_id\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
    /["']?\baws_secret_access_key\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
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
