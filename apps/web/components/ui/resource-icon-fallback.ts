export function shouldRenderResourceIconImage(
  iconUrl: string | undefined,
  failedIconUrl: string | null
): boolean {
  return Boolean(iconUrl) && iconUrl !== failedIconUrl;
}
