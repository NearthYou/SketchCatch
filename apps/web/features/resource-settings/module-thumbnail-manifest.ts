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
  readonly assetHash: `sha256:${string}`;
  readonly captureVersion: 1;
  readonly diagramHash: `sha256:${string}`;
  readonly moduleId: ModuleThumbnailId;
  readonly src: string;
};

const MODULE_ASSET_HASHES: Record<ModuleThumbnailId, `sha256:${string}`> = {
  "container-image-delivery":
    "sha256:9925a0199c009d624a40387df6c5073afe30b5316db385a5436bbdc9b4490537",
  "container-runtime": "sha256:dee7781996b3985bb53d89067b283074aeab1f0a7f63a42b678662cfc8d6760b",
  "identity-access-boundary":
    "sha256:3ddb9436346226c2a279936b52ecfe34a958e8363c29d23934d1c09ffda0d1c2",
  "load-balanced-compute":
    "sha256:0e3384939d5401b487602a5818b6abbeda7cdcbff0548ceccae582e99b722459",
  "network-foundation": "sha256:5568d8c670c80f8a990e3bd90c45d7d7cda25955e98102a19f279c4ee1b74593",
  "operations-monitoring":
    "sha256:9175106c0d1f2021cd309645221d1212054eaae6cd7f8c25a9925034145a2cc8",
  "relational-data-layer":
    "sha256:0dbacc00fa5c84a6ed89f4830bcc6e314a445d2ac455a93a931c2399eeb0f2de",
  "secure-object-storage":
    "sha256:06b234017da828f284bc5fdeafb4930b142d6ee8c0a68a8e9b5692dce290e9c4",
  "serverless-api": "sha256:a219c164bb5fa137d62c31883dd014c034b6cc09e0760512cdad89795621eb14",
  "static-web-delivery": "sha256:10e75457d4438b3b0c722b5dc1b1066602ac236559139805d6b59ea6ebdd724a"
};

const MODULE_DIAGRAM_HASHES: Record<ModuleThumbnailId, `sha256:${string}`> = {
  "container-image-delivery":
    "sha256:89428f0701b17610231222742cfa617244d28268a98fe47c8722fb33c69ba685",
  "container-runtime": "sha256:32630b2336fb97207cd7d059a3c14bebb8f2c04888f2de0bb075c358d15ccbc5",
  "identity-access-boundary":
    "sha256:d1323510b4ddf6aae0acc651d23147ea0012f3147755423c52fc628fe3f320ac",
  "load-balanced-compute":
    "sha256:0f12728d4f022833b441c429422560ad1648ae8b3b1e48d61826fa8376b0331d",
  "network-foundation": "sha256:24eaef2f26280b868115c54011f0b3e33524eea0030a7e2f88ef0119bd0c658c",
  "operations-monitoring":
    "sha256:e2840d625a5adc914a40dd90cc5aaa906b637742aa3858f519eb8f80d80b9dde",
  "relational-data-layer":
    "sha256:d517304a27034adfe7b37fd5a42af0329469993238874244a5c4950e0b02fe96",
  "secure-object-storage":
    "sha256:e83e848383f081ce5a5281ca9cc728a1f899901caca0db7d9af26b2e25e5dcac",
  "serverless-api": "sha256:f6a4121de32b90267f009183e9c5f1d79dc54cc76ff0897c38bcf64688135a5b",
  "static-web-delivery": "sha256:14273267e257d5a48f548fdfb40563c075b4c484d6af6bfb35b34edde81ebebb"
};

export const MODULE_THUMBNAIL_ASSETS: Record<ModuleThumbnailId, ModuleThumbnailAsset> =
  Object.fromEntries(
    MODULE_THUMBNAIL_MODULE_IDS.map((moduleId) => [
      moduleId,
      {
        assetHash: MODULE_ASSET_HASHES[moduleId],
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
