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
    "sha256:75a2b8cdcf48fccb30accdfbd792e9c2e24be176288ba9f08a62c7dc11af715e",
  "container-runtime": "sha256:22b8b33b1eec95c8dbe4ffeea88614be5b8893872694273181c303a93bfdc2ef",
  "identity-access-boundary":
    "sha256:a4ec1d064c84b79892d44eecb30de12eeabf2891a965016cea7ba14959944387",
  "load-balanced-compute":
    "sha256:5ae02b646a64e9a63993d56d1ea08ce593b48b132a80b686b8bcf008068fe3c0",
  "network-foundation": "sha256:4b0f4680d1b3cfb4a576a2351476fba635e27d7516493bd7fc85346ae3bdbd73",
  "operations-monitoring":
    "sha256:e0013addedf5501d38ef1223eff5be5d7659baf2e017b8b8e030e59cbd5901fe",
  "relational-data-layer":
    "sha256:0395707fbeb0b6c8b773046a14c397f1eb9c675519fa5be33aad6b2fd18f531a",
  "secure-object-storage":
    "sha256:197404c8947cb9434d709f64158cf3eb8cd95a47052229ba1807e81452af503f",
  "serverless-api": "sha256:eb00393ff816fcc6ba91943eb8e46bb8a91dfe76f929056b50658a540db3a0f5",
  "static-web-delivery": "sha256:2f889b07e335651d9df1e6db010bf24c3a69754de3555cbf746a982f1e462cde"
};

const MODULE_DIAGRAM_HASHES: Record<ModuleThumbnailId, `sha256:${string}`> = {
  "container-image-delivery":
    "sha256:64e350300bf23d04e2c15ab842c9f84470183a3747633f51b563f153ce4ca15b",
  "container-runtime": "sha256:1eaac28701f4a967200b17ba50c920c82ddac2ca04a57b199862244399ece1d5",
  "identity-access-boundary":
    "sha256:e0cb596813b8707eee62b7aa38434c37ae76e6789e885cb3e3b78cbb45e51be7",
  "load-balanced-compute":
    "sha256:4926a9466420e437678fec9aa505098999ad609b671e13300719d6d48be3a019",
  "network-foundation": "sha256:2521545b44ff397de719282860a9357b8f4ce2da6f0e1b820e6905bda6de0243",
  "operations-monitoring":
    "sha256:c419bde8d4ad536d3b1213afc659945aaad81aff3b12831c4181dc838259d965",
  "relational-data-layer":
    "sha256:20e001a9610b04de0a47a4ff2e7734433b9918d6e7a21c871e59bc556a1d9010",
  "secure-object-storage":
    "sha256:d1b4fcd27e5fe3c272b34be210af31d60a2f9cc408d60fe3f219a62764757fe4",
  "serverless-api": "sha256:9dcf52e87d8d82143445f5d0ec7030bc276c5d03ca4d0bd0a80edcdd39ef5a91",
  "static-web-delivery": "sha256:0984cffee622b89c63aec8d92ded55a458eba1d7e3c15b079575ffdafac54735"
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
