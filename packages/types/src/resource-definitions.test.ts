import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getResourceDefinitionById,
  getResourceDefinitionByTerraform,
  resourceDefinitions
} from "./resource-definitions.js";

const requiredBrainboardResourceDefinitions = [
  ["aws-api-gateway-integration-response", "resource", "aws_api_gateway_integration_response"],
  ["aws-api-gateway-method-response", "resource", "aws_api_gateway_method_response"],
  ["aws-budgets-budget", "resource", "aws_budgets_budget"],
  ["aws-cloudfront-origin-access-identity", "resource", "aws_cloudfront_origin_access_identity"],
  ["aws-docdb-cluster", "resource", "aws_docdb_cluster"],
  ["aws-dynamodb-global-table", "resource", "aws_dynamodb_global_table"],
  ["aws-elastic-beanstalk-application", "resource", "aws_elastic_beanstalk_application"],
  ["aws-elastic-beanstalk-environment", "resource", "aws_elastic_beanstalk_environment"],
  ["aws-elb", "resource", "aws_elb"],
  ["aws-flow-log", "resource", "aws_flow_log"],
  ["aws-fsx-lustre-file-system", "resource", "aws_fsx_lustre_file_system"],
  ["aws-iam-group", "resource", "aws_iam_group"],
  ["aws-iam-group-policy-attachment", "resource", "aws_iam_group_policy_attachment"],
  ["aws-iam-user", "resource", "aws_iam_user"],
  ["aws-iam-user-group-membership", "resource", "aws_iam_user_group_membership"],
  ["aws-iam-user-login-profile", "resource", "aws_iam_user_login_profile"],
  ["aws-launch-configuration", "resource", "aws_launch_configuration"],
  ["aws-main-route-table-association", "resource", "aws_main_route_table_association"],
  ["aws-network-interface", "resource", "aws_network_interface"],
  ["aws-organizations-account", "resource", "aws_organizations_account"],
  ["aws-s3-bucket-acl", "resource", "aws_s3_bucket_acl"],
  ["aws-s3-bucket-logging", "resource", "aws_s3_bucket_logging"],
  ["aws-s3-bucket-notification", "resource", "aws_s3_bucket_notification"],
  ["aws-s3-bucket-object", "resource", "aws_s3_bucket_object"],
  [
    "aws-s3-bucket-replication-configuration",
    "resource",
    "aws_s3_bucket_replication_configuration"
  ],
  ["aws-ses-email-identity", "resource", "aws_ses_email_identity"],
  ["aws-vpc-peering-connection-accepter", "resource", "aws_vpc_peering_connection_accepter"],
  ["aws-waf-ipset", "resource", "aws_waf_ipset"],
  ["aws-waf-rule", "resource", "aws_waf_rule"],
  ["aws-waf-web-acl", "resource", "aws_waf_web_acl"],
  ["aws-iam-policy-data", "data", "aws_iam_policy"]
] as const;

test("Brainboard Terraform identities have exactly one shared resource definition", () => {
  for (const [id, blockType, resourceType] of requiredBrainboardResourceDefinitions) {
    const matches = resourceDefinitions.filter(
      (definition) =>
        definition.terraform.blockType === blockType &&
        definition.terraform.resourceType === resourceType
    );

    assert.equal(matches.length, 1, `${blockType}/${resourceType}`);
    assert.equal(matches[0]?.id, id, `${blockType}/${resourceType}`);
    assert.equal(getResourceDefinitionById(id), matches[0], id);
    assert.equal(
      getResourceDefinitionByTerraform(blockType, resourceType),
      matches[0],
      `${blockType}/${resourceType}`
    );
    assert.equal(matches[0]?.provider, "aws", id);
    assert.equal(matches[0]?.capabilities.terraformPreview, true, id);
    assert.equal(matches[0]?.capabilities.terraformSync, true, id);
  }
});

test("shared resource definition IDs and Terraform identities remain unique", () => {
  const ids = resourceDefinitions.map((definition) => definition.id);
  const terraformIdentities = resourceDefinitions.map(
    (definition) =>
      `${definition.terraform.blockType}/${definition.terraform.resourceType}`
  );

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(terraformIdentities).size, terraformIdentities.length);
});

test("classic AWS identities stay distinct from newer Terraform resources", () => {
  assertDistinctTerraformIdentities("aws-elb", "aws-lb");
  assertDistinctTerraformIdentities(
    "aws-cloudfront-origin-access-identity",
    "aws-cloudfront-origin-access-control"
  );
  assertDistinctTerraformIdentities("aws-s3-bucket-object", "aws-s3-object");
  assertDistinctTerraformIdentities("aws-waf-web-acl", "aws-wafv2-web-acl");

  assert.equal(
    getResourceDefinitionByTerraform("resource", "aws_waf_rule")?.terraform.resourceType,
    "aws_waf_rule"
  );
  assert.equal(
    getResourceDefinitionByTerraform("resource", "aws_waf_ipset")?.terraform.resourceType,
    "aws_waf_ipset"
  );
});

function assertDistinctTerraformIdentities(firstId: string, secondId: string): void {
  const first = getResourceDefinitionById(firstId);
  const second = getResourceDefinitionById(secondId);

  assert.ok(first, firstId);
  assert.ok(second, secondId);
  assert.notEqual(first.id, second.id);
  assert.notDeepEqual(first.terraform, second.terraform);
}
