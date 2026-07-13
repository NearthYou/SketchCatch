export type UploadedProjectThumbnail = {
  readonly createdAt: Date;
  readonly id: string;
  readonly objectKey: string;
};

/** DB timestamp가 같아도 모든 worker가 같은 최신 캡처를 선택하게 합니다. */
export function compareProjectThumbnailsNewestFirst(
  left: Pick<UploadedProjectThumbnail, "createdAt" | "id">,
  right: Pick<UploadedProjectThumbnail, "createdAt" | "id">
): number {
  const timeDifference = right.createdAt.getTime() - left.createdAt.getTime();

  if (timeDifference !== 0) {
    return timeDifference;
  }

  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

type ProjectThumbnailCleanupInput = {
  readonly deleteObject: (objectKey: string) => Promise<void>;
  readonly deleteRow: (assetId: string) => Promise<void>;
  readonly listUploaded: () => Promise<readonly UploadedProjectThumbnail[]>;
  readonly onDeleteError?:
    | ((error: unknown, thumbnail: UploadedProjectThumbnail) => void)
    | undefined;
};

// 업로드 완료 순서와 무관하게 canonical 최신 캡처 하나만 남깁니다.
export async function cleanupSupersededProjectThumbnails({
  deleteObject,
  deleteRow,
  listUploaded,
  onDeleteError
}: ProjectThumbnailCleanupInput): Promise<void> {
  const uploadedThumbnails = await listUploaded();
  const staleThumbnails = [...uploadedThumbnails]
    .sort(compareProjectThumbnailsNewestFirst)
    .slice(1);

  for (const thumbnail of staleThumbnails) {
    try {
      await deleteObject(thumbnail.objectKey);
      await deleteRow(thumbnail.id);
    } catch (error) {
      onDeleteError?.(error, thumbnail);
    }
  }
}
