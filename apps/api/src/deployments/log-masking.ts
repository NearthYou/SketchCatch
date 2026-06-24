const SECRET_PATTERNS = [
    /aws_access_key_id\s*=\s*["']?[^"'\s]+["']?/gi,
    /aws_secret_access_key\s*=\s*["']?[^"'\s]+["']?/gi,
    /password\s*=\s*["']?[^"'\s]+["']?/gi,
    /token\s*=\s*["']?[^"'\s]+["']?/gi,
    /secret\s*=\s*["']?[^"'\s]+["']?/gi
]

export function maskDeploymentMessage(message: string): string {
    return SECRET_PATTERNS.reduce(
        (maskedMessage, pattern) => maskedMessage.replace(pattern, "[REDACTED]"),
        message
    );
}