import { notFound } from "next/navigation";
import { createModuleThumbnailDiagram } from "../../../features/resource-settings/module-thumbnail-diagram";
import { ModuleThumbnailCaptureClient } from "./module-thumbnail-capture-client";

type ModuleThumbnailPageProps = {
  readonly searchParams?: Promise<{
    readonly moduleId?: string | string[] | undefined;
  }>;
};

export default async function ModuleThumbnailPage({ searchParams }: ModuleThumbnailPageProps) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const params = await searchParams;
  const moduleId = getSingleSearchParam(params?.moduleId);
  const diagram = moduleId ? createModuleThumbnailDiagram(moduleId) : null;

  if (!diagram) {
    notFound();
  }

  return <ModuleThumbnailCaptureClient diagram={diagram} />;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
