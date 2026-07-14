import { defineFixtureBatch, presentation, resource } from "./define-config.mjs";

export const fixtures = defineFixtureBatch([
  {
    rank: 10,
    captureFileName: "aws-three-tier-web-app.json",
    outputFileName: "aws-three-tier-database.ts",
    exportName: "awsThreeTierDatabaseSource",
    bindings: {
      "cea766af-7b78-4329-8483-aa94f972ead5": presentation("aws-region"),
      "2f8fe703-8781-4e1d-afb9-8b41aa88cb4e": resource(
        "aws_launch_template.launch_template",
        "main.tf",
        "exact-title"
      ),
      "afe878e0-c406-499d-ba2c-c76a7ba9ed00": resource(
        "aws_vpc.main",
        "main.tf",
        "single-residual"
      ),
      "0ba0b6ac-5652-4698-9c34-622056feec30": resource(
        "aws_autoscaling_group.web",
        "main.tf",
        "exact-title"
      ),
      "4c5c5291-683f-4364-88a1-09dc5d885de3": presentation("aws-availability-zone"),
      "95f6fcc3-863d-4859-81fc-19bb52b136f1": resource(
        "aws_autoscaling_group.app",
        "main.tf",
        "exact-title"
      ),
      "ad311bd8-eb8c-4b09-ac61-b818cccb630d": resource(
        "aws_db_subnet_group.aws_db_subnet_group_18",
        "main.tf",
        "single-residual"
      ),
      "e045ce90-bb03-4d17-8184-40474d73bdda": presentation("aws-availability-zone"),
      "02eb7678-c7b3-496c-8f2e-864b8752639a": resource(
        "aws_subnet.web_b",
        "main.tf",
        "reviewed-override"
      ),
      "2de9df0c-ca00-47b9-adc8-c9bedfbb8a56": resource(
        "aws_subnet.web_a",
        "main.tf",
        "reviewed-override"
      ),
      "2e727aab-c78f-47d3-ad08-15ab55425c05": resource(
        "aws_subnet.db_b",
        "main.tf",
        "reviewed-override"
      ),
      "44023200-da2c-4dd0-a42f-e155df3eebf8": resource(
        "aws_subnet.db_a",
        "main.tf",
        "reviewed-override"
      ),
      "5c70cc8e-00c1-40aa-9579-f774354c3de4": resource(
        "aws_subnet.app_a",
        "main.tf",
        "reviewed-override"
      ),
      "d1bbba94-5f95-4e6e-ba67-d968459db06c": resource(
        "aws_subnet.app_b",
        "main.tf",
        "reviewed-override"
      ),
      "0f77fb2f-97d3-4562-89b4-36bd1d3eb6b2": resource(
        "aws_route53_record.a_record",
        "main.tf",
        "reviewed-override"
      ),
      "10899cec-fe58-405a-b610-379fc832e90f": resource(
        "aws_waf_web_acl.waf_web_acl",
        "main.tf",
        "single-residual"
      ),
      "283de881-4574-4a4c-95b9-f12b34d9087d": resource(
        "aws_s3_bucket_versioning.default",
        "main.tf",
        "single-residual"
      ),
      "3cd01172-fce2-4b44-9829-238c8a8fbde6": resource(
        "aws_s3_bucket.default",
        "main.tf",
        "single-residual"
      ),
      "43af3152-6e4e-4144-9c44-b4496e6c00c7": resource(
        "aws_waf_rule.aws_waf_rule_10",
        "main.tf",
        "single-residual"
      ),
      "8cc81941-dca9-431b-bb7a-b6a24cd2ba32": resource(
        "aws_route53_record.cname",
        "main.tf",
        "reviewed-override"
      ),
      "91e71162-3ab7-4638-b2d0-974e34879a4f": resource(
        "aws_route53_zone.aws_route53_zone_6",
        "main.tf",
        "single-residual"
      ),
      "c2b68a8b-d2de-47d6-a48d-de1200d2cc00": presentation("aws-cloudfront-distribution"),
      "c6e0203e-f336-4b67-bace-94a51d09f617": resource(
        "aws_waf_ipset.aws_waf_ipset_11",
        "main.tf",
        "single-residual"
      ),
      "3c2e57a3-326f-4fe9-aab7-ecb2c7a41e8f": presentation(null),
      "4c5ee754-3e97-4d3e-8ad5-5466eac8840c": resource(
        "aws_internet_gateway.igw",
        "main.tf",
        "single-residual"
      ),
      "732af918-f8b1-43e9-a3ea-a9b583c1fb45": resource("aws_elb.web", "main.tf", "exact-title"),
      "83f8b4db-3937-4bcb-8707-cf55e4749ea3": presentation(null),
      "89409729-7427-4813-a81b-274de912ec4a": resource("aws_elb.app", "main.tf", "exact-title"),
      "b1c5fe40-f4ea-4435-979e-55a7011ac6e2": resource("aws_eip.web_a", "main.tf", "exact-title"),
      "cf263726-f3f8-471f-94ee-0229644bc7b4": presentation(null),
      "f22651e0-1d69-417f-b33c-e2e1e5e82cb8": resource("aws_eip.web_b", "main.tf", "exact-title"),
      "ec823e04-54e9-4c9c-9ac4-a7b939ec22bf": presentation(null),
      "14b312b8-59be-4b2b-8b62-d422fa392e41": resource(
        "aws_nat_gateway.web_b",
        "main.tf",
        "reviewed-override"
      ),
      "3d3c925d-b665-4a01-b2e4-b928b6f3ab31": presentation(
        "aws-ec2-instance",
        "aws_autoscaling_group.web"
      ),
      "4952ad77-6b67-4d60-ba48-399fb1da6ca6": presentation(
        "aws-rds-cluster",
        "aws_rds_cluster.aws_rds_cluster_19"
      ),
      "84a9b330-9c06-4a61-85b8-00f4db547d21": resource(
        "aws_rds_cluster.aws_rds_cluster_19",
        "main.tf",
        "single-residual"
      ),
      "9f288d70-3c85-4204-acc7-9543bc9d38f6": resource(
        "aws_nat_gateway.web_a",
        "main.tf",
        "reviewed-override"
      ),
      "a4c5b76d-069d-4e57-b11d-aead846a2201": presentation(
        "aws-ec2-instance",
        "aws_autoscaling_group.web"
      ),
      "c07e1ce3-dd7c-4a9c-82c8-752a10ea5fba": presentation(
        "aws-ec2-instance",
        "aws_autoscaling_group.app"
      ),
      "dc04ec1e-665b-45ab-ba9f-290b55340c7b": presentation(
        "aws-ec2-instance",
        "aws_autoscaling_group.app"
      )
    },
    workspaceOmissions: {
      "variables.tf": [
        {
          sourceText: '    archuuid = "fb2334bf-3291-40db-a779-1e4e56df27dd"\n',
          occurrenceCount: 1
        }
      ]
    }
  },
  {
    rank: 11,
    captureFileName: "aws-bastion.json",
    outputFileName: "aws-bastion.ts",
    exportName: "awsBastionSource",
    bindings: {
      "4b4447a5-92a0-40b4-bf63-538a19399886": presentation("aws-region"),
      "7912ce6d-b224-4055-84c0-e847e7ca1224": resource(
        "aws_vpc.default_vpc",
        "main.tf",
        "exact-title"
      ),
      "3cbdd739-7b62-4824-ae49-25f7863bd970": presentation("aws-availability-zone"),
      "0b578f07-26c1-42ea-8bd0-952dd4b45ebf": resource(
        "aws_subnet.default_subnet",
        "main.tf",
        "exact-title"
      ),
      "6ef194ca-02bc-4039-8ca5-a61e1d285bae": resource(
        "aws_security_group.default_security_group",
        "main.tf",
        "exact-title"
      ),
      "8810f656-c698-416c-b42b-14221f124aa0": resource(
        "aws_internet_gateway.default_gtw",
        "main.tf",
        "single-residual"
      ),
      "d555e514-a657-43d3-9435-f3962064d36f": resource(
        "aws_route_table.default_route",
        "main.tf",
        "single-residual"
      ),
      "80489bad-1f77-4035-97ed-0939be2815cf": resource(
        "aws_route_table_association.default_route_table_association",
        "main.tf",
        "single-residual"
      ),
      "edd96c50-6a71-4db7-b23f-f7f21465b74f": resource(
        "aws_network_acl.default_network_acl",
        "main.tf",
        "exact-title"
      ),
      "f91e8491-f010-457d-b966-7cd53de8e7e3": resource(
        "aws_key_pair.default_key_pair",
        "main.tf",
        "exact-title"
      ),
      "decc2f66-4950-4338-89fa-7eda35c53e60": resource(
        "aws_security_group_rule.sg_rule_ingress_all",
        "main.tf",
        "reviewed-override"
      ),
      "202d02a1-538d-45fe-b8e5-26aa1753d5d1": resource(
        "aws_security_group_rule.sg_rule_ingress_ssh",
        "main.tf",
        "reviewed-override"
      ),
      "941b992f-e911-4533-baff-396fed3cd614": resource(
        "aws_security_group_rule.sg_rule_egress_all",
        "main.tf",
        "reviewed-override"
      ),
      "3fbf05b5-5729-4f4e-88f7-92ee41797b38": resource(
        "aws_instance.t2-bastion",
        "main.tf",
        "reviewed-override"
      ),
      "9e820b53-18b3-407e-be69-6fda71a19f67": resource(
        "aws_instance.t2-7ff2172e",
        "main.tf",
        "reviewed-override"
      ),
      "c9e3634d-acaa-4ff9-9471-47f286144125": presentation(null),
      "ff83642d-55bb-4725-9972-e3eef3b98077": presentation("design-user-client")
    },
    workspaceOmissions: {
      "variables.tf": [
        {
          sourceText: '    archuuid = "130f8091-21a4-4e8b-8b39-2373cb720d72"\n',
          occurrenceCount: 1
        }
      ]
    }
  }
]);
