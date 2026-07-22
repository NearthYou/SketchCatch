export type ProjectAssetStorage = {
  putObject(input: {
    objectKey: string;
    contentType: string;
    body: Buffer | string;
  }): Promise<void>;
  getObject(input: { objectKey: string }): Promise<Buffer>;
  deleteObject(input: { objectKey: string }): Promise<void>;
  deleteObjectVersion?(input: { objectKey: string; versionId: string }): Promise<void>;
  deletePrefix?(input: { prefix: string }): Promise<void>;
  objectExists(input: { objectKey: string; byteSize: number | null }): Promise<boolean>;
};
