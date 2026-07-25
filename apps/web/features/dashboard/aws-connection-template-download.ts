type TemplateDownloadDocument = Pick<Document, "body" | "createElement">;

type TemplateDownloadUrl = Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;

// gg: Console 바로가기를 만들지 못해도 같은 연결 Template을 사용자가 직접 AWS에서 승인할 수 있게 합니다.
export function downloadAwsConnectionTemplate(
  input: {
    readonly stackName: string;
    readonly templateBody: string;
  },
  options: {
    readonly document?: TemplateDownloadDocument;
    readonly url?: TemplateDownloadUrl;
  } = {}
): void {
  const documentRef = options.document ?? document;
  const url = options.url ?? URL;
  const objectUrl = url.createObjectURL(
    new Blob([input.templateBody], { type: "application/x-yaml;charset=utf-8" })
  );
  const anchor = documentRef.createElement("a");

  anchor.download = `${input.stackName}.yaml`;
  anchor.href = objectUrl;
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  url.revokeObjectURL(objectUrl);
}
