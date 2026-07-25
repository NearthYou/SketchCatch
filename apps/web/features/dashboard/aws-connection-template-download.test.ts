import assert from "node:assert/strict";
import test from "node:test";
import { downloadAwsConnectionTemplate } from "./aws-connection-template-download";

test("CloudFormation template fallback downloads the exact connection template", () => {
  const appended: HTMLAnchorElement[] = [];
  let clicked = false;
  let revoked = "";
  const anchor = {
    click: () => {
      clicked = true;
    },
    download: "",
    hidden: false,
    href: "",
    remove: () => undefined
  } as unknown as HTMLAnchorElement;

  downloadAwsConnectionTemplate(
    {
      stackName: "sketchcatch-connection-1",
      templateBody: "Resources: {}"
    },
    {
      document: {
        body: {
          append: (node: Node) => {
            appended.push(node as HTMLAnchorElement);
          }
        } as unknown as HTMLBodyElement,
        createElement: () => anchor
      },
      url: {
        createObjectURL: () => "blob:connection-template",
        revokeObjectURL: (url) => {
          revoked = url;
        }
      }
    }
  );

  assert.deepEqual(appended, [anchor]);
  assert.equal(anchor.download, "sketchcatch-connection-1.yaml");
  assert.equal(anchor.href, "blob:connection-template");
  assert.equal(anchor.hidden, true);
  assert.equal(clicked, true);
  assert.equal(revoked, "blob:connection-template");
});
