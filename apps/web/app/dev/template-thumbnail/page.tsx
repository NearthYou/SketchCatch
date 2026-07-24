import { notFound } from "next/navigation";
import { createTemplateThumbnailDiagram } from "../../../features/resource-settings/template-thumbnail-diagram";
import { TemplateThumbnailCaptureClient } from "./template-thumbnail-capture-client";

type TemplateThumbnailPageProps = {
  readonly searchParams?: Promise<{
    readonly templateId?: string | string[] | undefined;
  }>;
};

export default async function TemplateThumbnailPage({ searchParams }: TemplateThumbnailPageProps) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const params = await searchParams;
  const templateId = getSingleSearchParam(params?.templateId);
  const diagram = templateId ? createTemplateThumbnailDiagram(templateId) : null;

  if (!diagram) {
    notFound();
  }

  return <TemplateThumbnailCaptureClient diagram={diagram} />;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return undefined;
  return value;
}
