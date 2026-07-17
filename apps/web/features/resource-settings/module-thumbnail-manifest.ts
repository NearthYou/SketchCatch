export const MODULE_THUMBNAIL_MODULE_IDS = [
  "container-image-delivery",
  "container-runtime",
  "identity-access-boundary",
  "load-balanced-compute",
  "network-foundation",
  "operations-monitoring",
  "relational-data-layer",
  "secure-object-storage",
  "serverless-api",
  "static-web-delivery"
] as const;

export type ModuleThumbnailId = (typeof MODULE_THUMBNAIL_MODULE_IDS)[number];

export type ModuleThumbnailAsset = {
  readonly captureVersion: 1;
  readonly diagramHash: `sha256:${string}`;
  readonly moduleId: ModuleThumbnailId;
  readonly src: string;
};

const MODULE_DIAGRAM_HASHES: Record<ModuleThumbnailId, `sha256:${string}`> = {
  "container-image-delivery": "sha256:89428f0701b17610231222742cfa617244d28268a98fe47c8722fb33c69ba685",
  "container-runtime": "sha256:32630b2336fb97207cd7d059a3c14bebb8f2c04888f2de0bb075c358d15ccbc5",
  "identity-access-boundary": "sha256:d1323510b4ddf6aae0acc651d23147ea0012f3147755423c52fc628fe3f320ac",
  "load-balanced-compute": "sha256:0f12728d4f022833b441c429422560ad1648ae8b3b1e48d61826fa8376b0331d",
  "network-foundation": "sha256:24eaef2f26280b868115c54011f0b3e33524eea0030a7e2f88ef0119bd0c658c",
  "operations-monitoring": "sha256:e2840d625a5adc914a40dd90cc5aaa906b637742aa3858f519eb8f80d80b9dde",
  "relational-data-layer": "sha256:d517304a27034adfe7b37fd5a42af0329469993238874244a5c4950e0b02fe96",
  "secure-object-storage": "sha256:e83e848383f081ce5a5281ca9cc728a1f899901caca0db7d9af26b2e25e5dcac",
  "serverless-api": "sha256:f6a4121de32b90267f009183e9c5f1d79dc54cc76ff0897c38bcf64688135a5b",
  "static-web-delivery": "sha256:14273267e257d5a48f548fdfb40563c075b4c484d6af6bfb35b34edde81ebebb"
};

export const MODULE_THUMBNAIL_ASSETS: Record<ModuleThumbnailId, ModuleThumbnailAsset> =
  Object.fromEntries(
    MODULE_THUMBNAIL_MODULE_IDS.map((moduleId) => [
      moduleId,
      {
        captureVersion: 1,
        diagramHash: MODULE_DIAGRAM_HASHES[moduleId],
        moduleId,
        src: `/module-thumbnails/v1/${moduleId}.webp`
      }
    ])
  ) as Record<ModuleThumbnailId, ModuleThumbnailAsset>;

export function getModuleThumbnailAsset(moduleId: string): ModuleThumbnailAsset | null {
  if (!Object.hasOwn(MODULE_THUMBNAIL_ASSETS, moduleId)) return null;

  return MODULE_THUMBNAIL_ASSETS[moduleId as ModuleThumbnailId];
}
