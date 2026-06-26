import { GetObjectCommand, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireS3BucketName } from "../config/env.js";
import { getS3Client } from "../s3/client.js";

export type PrepareTerraformWorkspaceInput = {
    objectKey: string;
    fileName?: string | null;
};

export type PrepareTerraformWorkspaceOptions = {
    rootDir?: string;
    downloadTerraformArtifact?: (objectKey: string) => Promise<Buffer | Uint8Array | string>;
};

export type PreparedTerraformWorkspace = {
    workdir: string;
    mainFilePath: string;
    cleanup: () => Promise<void>;
};

export async function prepareTerraformWorkspace(
    input: PrepareTerraformWorkspaceInput,
    options: PrepareTerraformWorkspaceOptions = {}
): Promise<PreparedTerraformWorkspace> {
    const workdir = await mkdtemp(join(options.rootDir ?? tmpdir(), "sketchcatch-terraform-"));
    const fileName = toSafeTerraformFileName(input.fileName);
    const mainFilePath = join(workdir, fileName);

    const downloadTerraformArtifact = options.downloadTerraformArtifact ?? downloadTerraformArtifactFromS3;
    
    const content = await downloadTerraformArtifact(input.objectKey);

    await writeFile(mainFilePath, toBuffer(content));

    return {
        workdir,
        mainFilePath,
        cleanup: () => rm(workdir, { recursive: true, force: true })
    };
}

export async function downloadTerraformArtifactFromS3(objectKey: string): Promise<Buffer> {
    const result = await getS3Client().send(
        new GetObjectCommand({
            Bucket: requireS3BucketName(),
            Key: objectKey
        })
    );

    return s3BodyToBuffer(result.Body);
}

function toSafeTerraformFileName(fileName: string | null | undefined): string {
    const candidate = fileName?.split(/[\\/]/).at(-1)?.trim();

    if (!candidate || candidate === "." || candidate === ".." || !candidate.endsWith(".tf")) {
        return "main.tf";
    }

    const safeFileName = candidate.replace(/[^a-zA-Z0-9._-]/g, "_");

    return safeFileName || "main.tf";
}

function toBuffer(content: Buffer | Uint8Array | string): Buffer {
    if (Buffer.isBuffer(content)) {
        return content;
    }

    return Buffer.from(content);
}

async function s3BodyToBuffer(body: GetObjectCommandOutput["Body"]): Promise<Buffer> {
    if (!body) {
        throw new Error("S3 object body is empty");
    }

    if (typeof body === "string") {
        return Buffer.from(body);
    }

    if (body instanceof Uint8Array) {
        return Buffer.from(body);
    }

    if ("transformToByteArray" in body && typeof body.transformToByteArray === "function") {
        return Buffer.from(await body.transformToByteArray());
    }

    const chunks: Buffer[] = [];

    for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
        chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
}