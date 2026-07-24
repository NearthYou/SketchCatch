import assert from "node:assert/strict";
import test from "node:test";
import {
  GetInstanceProfileCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  GetRoleCommand,
  GetRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  ListInstanceProfilesCommand,
  ListInstanceProfileTagsCommand,
  ListPoliciesCommand,
  ListPolicyTagsCommand,
  ListRolePoliciesCommand,
  ListRolesCommand,
  ListRoleTagsCommand
} from "@aws-sdk/client-iam";
import {
  classifyIamReverseEngineeringOwnership,
  readDetailedIamResources,
  type AwsIamDetailReadClient
} from "./aws-iam-reverse-engineering-reader.js";

const credentials = {
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  AWS_SESSION_TOKEN: "test-session-token",
  AWS_REGION: "ap-northeast-2"
};

test("reads customer IAM role, inline policy, managed policy, attachment and instance profile without exposing documents", async () => {
  const trustSecret = "trust-document-must-stay-server-only";
  const inlineSecret = "inline-document-must-stay-server-only";
  const managedSecret = "managed-document-must-stay-server-only";
  const roleArn = "arn:aws:iam::123456789012:role/app-role";
  const policyArn = "arn:aws:iam::123456789012:policy/app-policy";
  const profileArn = "arn:aws:iam::123456789012:instance-profile/app-profile";
  const commands: object[] = [];
  const client: AwsIamDetailReadClient = {
    async send(command) {
      commands.push(command);
      if (command instanceof ListRolesCommand) {
        return {
          Roles: [{ Arn: roleArn, RoleName: "app-role", Path: "/" }],
          IsTruncated: false
        };
      }
      if (command instanceof GetRoleCommand) {
        return {
          Role: {
            Arn: roleArn,
            RoleName: "app-role",
            Path: "/",
            AssumeRolePolicyDocument: encodeURIComponent(
              JSON.stringify({ Version: "2012-10-17", Statement: [{ Sid: trustSecret }] })
            ),
            PermissionsBoundary: { PermissionsBoundaryArn: policyArn }
          }
        };
      }
      if (command instanceof ListRoleTagsCommand) {
        return { Tags: [{ Key: "team", Value: "platform" }], IsTruncated: false };
      }
      if (command instanceof ListAttachedRolePoliciesCommand) {
        return {
          AttachedPolicies: [{ PolicyArn: policyArn, PolicyName: "app-policy" }],
          IsTruncated: false
        };
      }
      if (command instanceof ListRolePoliciesCommand) {
        return { PolicyNames: ["inline-app"], IsTruncated: false };
      }
      if (command instanceof GetRolePolicyCommand) {
        return {
          RoleName: "app-role",
          PolicyName: "inline-app",
          PolicyDocument: encodeURIComponent(
            JSON.stringify({ Version: "2012-10-17", Statement: [{ Sid: inlineSecret }] })
          )
        };
      }
      if (command instanceof ListPoliciesCommand) {
        return {
          Policies: [
            {
              Arn: policyArn,
              PolicyName: "app-policy",
              Path: "/",
              DefaultVersionId: "v3",
              AttachmentCount: 1,
              IsAttachable: true
            }
          ],
          IsTruncated: false
        };
      }
      if (command instanceof GetPolicyCommand) {
        return {
          Policy: {
            Arn: policyArn,
            PolicyName: "app-policy",
            Path: "/",
            DefaultVersionId: "v3",
            AttachmentCount: 1,
            IsAttachable: true
          }
        };
      }
      if (command instanceof GetPolicyVersionCommand) {
        return {
          PolicyVersion: {
            VersionId: "v3",
            IsDefaultVersion: true,
            Document: encodeURIComponent(
              JSON.stringify({ Version: "2012-10-17", Statement: [{ Sid: managedSecret }] })
            )
          }
        };
      }
      if (command instanceof ListPolicyTagsCommand) {
        return { Tags: [{ Key: "service", Value: "api" }], IsTruncated: false };
      }
      if (command instanceof ListInstanceProfilesCommand) {
        return {
          InstanceProfiles: [
            {
              Arn: profileArn,
              InstanceProfileName: "app-profile",
              Path: "/",
              Roles: [{ Arn: roleArn, RoleName: "app-role" }]
            }
          ],
          IsTruncated: false
        };
      }
      if (command instanceof GetInstanceProfileCommand) {
        return {
          InstanceProfile: {
            Arn: profileArn,
            InstanceProfileName: "app-profile",
            Path: "/",
            Roles: [{ Arn: roleArn, RoleName: "app-role" }]
          }
        };
      }
      if (command instanceof ListInstanceProfileTagsCommand) {
        return { Tags: [{ Key: "service", Value: "api" }], IsTruncated: false };
      }
      throw new Error(`Unexpected command ${command.constructor.name}`);
    }
  };

  const result = await readDetailedIamResources("ap-northeast-2", credentials, () => client);

  assert.equal(result.failures.length, 0);
  assert.deepEqual(result.records.map((record) => record.providerResourceType).sort(), [
    "AWS::IAM::InstanceProfile",
    "AWS::IAM::Policy",
    "AWS::IAM::Role",
    "AWS::IAM::RolePolicy",
    "AWS::IAM::RolePolicyAttachment"
  ]);
  const role = result.records.find((record) => record.displayName === "app-role");
  assert.match(role?.providerResourceId ?? "", /^aws-ref-[a-f0-9]{24}$/u);
  assert.equal(role?.config["managementReady"], true);
  assert.equal(role?.config["ownership"], "customer");
  assert.equal(role?.config["trustPolicyRedacted"], true);
  assert.equal(role?.config["attachedPolicyCount"], 1);
  assert.deepEqual(role?.config["inlinePolicyNames"], ["inline-app"]);
  assert.deepEqual(role?.config["tags"], [{ key: "team", value: "platform" }]);
  assert.ok(
    role?.relationships.every(
      (relationship) => !relationship.targetProviderResourceId.includes("arn:aws")
    )
  );

  const inlinePolicy = result.records.find(
    (record) => record.providerResourceType === "AWS::IAM::RolePolicy"
  );
  assert.equal(inlinePolicy?.config["policyDocumentRedacted"], true);
  assert.equal(inlinePolicy?.config["managementReady"], true);

  const attachment = result.records.find(
    (record) => record.providerResourceType === "AWS::IAM::RolePolicyAttachment"
  );
  assert.deepEqual(attachment?.config, {
    managementReady: true,
    ownership: "customer",
    policyName: "app-policy",
    reverseEngineeringDetailsComplete: true,
    reverseEngineeringDetailsVersion: 1,
    reverseEngineeringIncompleteDetails: [],
    roleName: "app-role"
  });
  assert.equal(attachment?.relationships.length, 2);

  const roleServerDetail = result.serverOnlyDetails.find(
    (detail) => detail.resourceKind === "role"
  );
  const inlineServerDetail = result.serverOnlyDetails.find(
    (detail) => detail.resourceKind === "inline_policy"
  );
  const managedPolicyServerDetail = result.serverOnlyDetails.find(
    (detail) => detail.resourceKind === "managed_policy"
  );
  const profileServerDetail = result.serverOnlyDetails.find(
    (detail) => detail.resourceKind === "instance_profile"
  );
  const attachmentServerDetail = result.serverOnlyDetails.find(
    (detail) => detail.resourceKind === "role_policy_attachment"
  );
  assert.equal(roleServerDetail?.terraformImportId, "app-role");
  assert.equal(inlineServerDetail?.terraformImportId, "app-role:inline-app");
  assert.equal(managedPolicyServerDetail?.terraformImportId, policyArn);
  assert.equal(profileServerDetail?.terraformImportId, "app-profile");
  assert.equal(attachmentServerDetail?.terraformImportId, `app-role/${policyArn}`);
  assert.equal(attachmentServerDetail?.policyArn, policyArn);

  const publicJson = JSON.stringify({ records: result.records, failures: result.failures });
  assert.doesNotMatch(publicJson, new RegExp(trustSecret));
  assert.doesNotMatch(publicJson, new RegExp(inlineSecret));
  assert.doesNotMatch(publicJson, new RegExp(managedSecret));
  assert.doesNotMatch(publicJson, /arn:aws/u);
  assert.match(JSON.stringify(result.serverOnlyDetails), new RegExp(trustSecret));
  assert.match(JSON.stringify(result.serverOnlyDetails), new RegExp(inlineSecret));
  assert.match(JSON.stringify(result.serverOnlyDetails), new RegExp(managedSecret));
  assert.match(JSON.stringify(result.serverOnlyDetails), new RegExp(roleArn));
  assert.match(JSON.stringify(result.serverOnlyDetails), new RegExp(profileArn));
  assert.ok(commands.some((command) => command instanceof GetRoleCommand));
  assert.ok(commands.some((command) => command instanceof GetPolicyVersionCommand));
});

test("Instance Profile은 정확히 하나의 완전한 Role 관계가 있을 때만 관리 가능하다", async () => {
  const profileArn = "arn:aws:iam::123456789012:instance-profile/app-profile";
  const roleArn = "arn:aws:iam::123456789012:role/app-role";
  const secondRoleArn = "arn:aws:iam::123456789012:role/second-role";

  for (const roles of [
    [],
    [{ Arn: roleArn }],
    [
      { Arn: roleArn, RoleName: "app-role" },
      { Arn: secondRoleArn, RoleName: "second-role" }
    ]
  ]) {
    const client: AwsIamDetailReadClient = {
      async send(command) {
        if (command instanceof ListRolesCommand) {
          return { Roles: [], IsTruncated: false };
        }
        if (command instanceof ListPoliciesCommand) {
          return { Policies: [], IsTruncated: false };
        }
        if (command instanceof ListInstanceProfilesCommand) {
          return {
            InstanceProfiles: [
              { Arn: profileArn, InstanceProfileName: "app-profile", Path: "/", Roles: roles }
            ],
            IsTruncated: false
          };
        }
        if (command instanceof GetInstanceProfileCommand) {
          return {
            InstanceProfile: {
              Arn: profileArn,
              InstanceProfileName: "app-profile",
              Path: "/",
              Roles: roles
            }
          };
        }
        if (command instanceof ListInstanceProfileTagsCommand) {
          return { Tags: [], IsTruncated: false };
        }
        throw new Error(`Unexpected command ${command.constructor.name}`);
      }
    };

    const result = await readDetailedIamResources("ap-northeast-2", credentials, () => client);
    const profile = result.records.find(
      (record) => record.providerResourceType === "AWS::IAM::InstanceProfile"
    );

    assert.equal(profile?.config["managementReady"], false);
    assert.equal(profile?.config["reverseEngineeringDetailsComplete"], false);
    assert.deepEqual(profile?.config["reverseEngineeringIncompleteDetails"], [
      "instanceProfileRole"
    ]);
    assert.equal(profile?.relationships.length, roles.length === 2 ? 2 : 0);
  }
});

test("marks IAM records incomplete when a detail permission is missing and keeps prior pages fail-closed", async () => {
  const firstArn = "arn:aws:iam::123456789012:role/first-role";
  const client: AwsIamDetailReadClient = {
    async send(command) {
      if (command instanceof ListRolesCommand) {
        if (!command.input.Marker) {
          return {
            Roles: [{ Arn: firstArn, RoleName: "first-role", Path: "/" }],
            IsTruncated: true,
            Marker: "next"
          };
        }
        const error = new Error("private provider message");
        error.name = "AccessDeniedException";
        throw error;
      }
      if (command instanceof GetRoleCommand) {
        return {
          Role: {
            Arn: firstArn,
            RoleName: "first-role",
            Path: "/",
            AssumeRolePolicyDocument: encodeURIComponent(
              JSON.stringify({ Version: "2012-10-17", Statement: [] })
            )
          }
        };
      }
      if (command instanceof ListRoleTagsCommand) return { Tags: [], IsTruncated: false };
      if (command instanceof ListAttachedRolePoliciesCommand) {
        const error = new Error("do not expose iam:ListAttachedRolePolicies");
        error.name = "AccessDeniedException";
        throw error;
      }
      if (command instanceof ListRolePoliciesCommand) {
        return { PolicyNames: [], IsTruncated: false };
      }
      if (command instanceof ListPoliciesCommand) return { Policies: [], IsTruncated: false };
      if (command instanceof ListInstanceProfilesCommand) {
        return { InstanceProfiles: [], IsTruncated: false };
      }
      throw new Error(`Unexpected command ${command.constructor.name}`);
    }
  };

  const result = await readDetailedIamResources("ap-northeast-2", credentials, () => client);
  const role = result.records.find((record) => record.displayName === "first-role");

  assert.equal(role?.config["managementReady"], false);
  assert.equal(role?.config["reverseEngineeringDetailsComplete"], false);
  assert.deepEqual(role?.config["reverseEngineeringIncompleteDetails"], [
    "attachedPolicies",
    "roleInventory"
  ]);
  assert.deepEqual(result.failures.map((failure) => failure.detail).sort(), [
    "attachedPolicies",
    "roleInventory"
  ]);
  assert.doesNotMatch(
    JSON.stringify(result),
    /private provider message|iam:ListAttachedRolePolicies/u
  );
  assert.equal(
    result.records.some((record) => record.displayName === "second-role"),
    false
  );
  assert.doesNotMatch(
    JSON.stringify({ records: result.records, failures: result.failures }),
    /arn:aws/u
  );
});

test("classifies only exact AWS and SketchCatch control ownership patterns", () => {
  assert.equal(
    classifyIamReverseEngineeringOwnership({
      providerResourceType: "AWS::IAM::Role",
      name: "AWSServiceRoleForLambda",
      path: "/aws-service-role/lambda.amazonaws.com/",
      tags: []
    }),
    "aws_managed"
  );
  assert.equal(
    classifyIamReverseEngineeringOwnership({
      providerResourceType: "AWS::IAM::Role",
      name: "SketchCatchTerraformExecutionRole-467ff1a5",
      path: "/",
      tags: []
    }),
    "sketchcatch_managed"
  );
  assert.equal(
    classifyIamReverseEngineeringOwnership({
      providerResourceType: "AWS::IAM::Role",
      name: "SketchCatchCustomerApplication",
      path: "/",
      tags: []
    }),
    "customer"
  );
  assert.equal(
    classifyIamReverseEngineeringOwnership({
      providerResourceType: "AWS::IAM::Role",
      name: "AWSReservedSSO_Administrator_0123456789abcdef",
      path: "/aws-reserved/sso.amazonaws.com/",
      tags: []
    }),
    "aws_managed"
  );
  assert.equal(
    classifyIamReverseEngineeringOwnership({
      providerResourceType: "AWS::IAM::Role",
      name: "UnexpectedReservedRoleName",
      path: "/aws-reserved/sso.amazonaws.com/ap-northeast-2/",
      tags: []
    }),
    "aws_managed"
  );
});
