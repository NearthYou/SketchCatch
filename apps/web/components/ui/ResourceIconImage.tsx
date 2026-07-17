"use client";

import { Box } from "lucide-react";
import { useState } from "react";
import { shouldRenderResourceIconImage } from "./resource-icon-fallback";

export function ResourceIconImage({
  alt,
  className,
  fallbackClassName,
  fallbackSize = 18,
  src
}: {
  readonly alt: string;
  readonly className: string;
  readonly fallbackClassName?: string | undefined;
  readonly fallbackSize?: number | undefined;
  readonly src: string | undefined;
}) {
  const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null);

  if (!src || !shouldRenderResourceIconImage(src, failedIconUrl)) {
    return (
      <span aria-hidden="true" className={fallbackClassName ?? className}>
        <Box size={fallbackSize} strokeWidth={1.75} />
      </span>
    );
  }

  return (
    <img
      alt={alt}
      className={className}
      draggable={false}
      onError={() => setFailedIconUrl(src)}
      src={src}
    />
  );
}
