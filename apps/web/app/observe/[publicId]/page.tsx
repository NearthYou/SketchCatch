import { ObserveClient } from "./observe-client";

export default async function ObservePage({
  params
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  return <ObserveClient publicId={publicId} />;
}
