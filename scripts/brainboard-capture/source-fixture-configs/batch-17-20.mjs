import { defineFixtureBatch, presentation, resource } from "./define-config.mjs";

export const fixtures = defineFixtureBatch([
  {
    rank: 17,
    captureFileName: "aws-multi-account-management.json",
    outputFileName: "aws-multi-account-management.ts",
    exportName: "awsMultiAccountManagementSource",
    bindings: {
      "258ffd07-ae27-412c-8c6e-192ffbbb76de": presentation("aws-region"),
      "4072261f-b484-4e8f-a25d-2e038ba119b4": presentation("design-group"),
      "c50301f8-0517-4fb9-8a05-3123e0c7dedd": presentation("aws-region"),
      "d2ec1630-f50e-4c5f-b898-8a9a65dbb2ce": presentation("aws-region"),
      "18592886-fb21-48dc-8fab-059177b9634b": resource(
        "aws_vpc.staging_vpc",
        "prod-account.tf",
        "exact-title"
      ),
      "bfac85f0-4bdd-4b46-8507-8926a71e8b72": resource(
        "aws_vpc.dev_vpc",
        "prod-account.tf",
        "exact-title"
      ),
      "ddc96bd1-f6ae-4e61-8944-b779f74bf50c": resource(
        "aws_vpc.prod_vpc",
        "prod-account.tf",
        "exact-title"
      ),
      "114ce859-8066-4c14-94da-52b3638dd9ee": presentation("aws-availability-zone"),
      "1dba0c64-caab-49ce-b64a-84c2f72ec1cc": presentation("aws-availability-zone"),
      "46b74daa-6c97-4991-af63-d172eb3e8b1d": presentation("aws-availability-zone"),
      "6c1d860b-04c2-4975-acd9-da97fcb87e28": presentation("aws-availability-zone"),
      "8daa8193-2ae3-4554-8bc8-8d5c5ea49fc4": presentation("aws-availability-zone"),
      "9a55fdc1-61fd-48dc-ba55-4fd900303cd1": presentation("aws-availability-zone"),
      "0c7dce6c-a8a7-4a8f-82d5-c49cba3bb928": resource(
        "aws_subnet.staging_snet1",
        "prod-account.tf",
        "exact-title"
      ),
      "3001c016-1493-4d58-8768-b2931b576bd4": resource(
        "aws_subnet.staging_snet2",
        "prod-account.tf",
        "exact-title"
      ),
      "3607f798-6454-4e9b-a6eb-ca801c34d712": resource(
        "aws_subnet.prod_snet1",
        "prod-account.tf",
        "exact-title"
      ),
      "b49067a3-6b76-4dec-acd7-dde436c44ca9": resource(
        "aws_subnet.prod_snet2",
        "prod-account.tf",
        "exact-title"
      ),
      "bf6846e5-0f9e-445a-a19d-63417cd4a3f2": resource(
        "aws_subnet.dev_snet2",
        "prod-account.tf",
        "exact-title"
      ),
      "dd728495-b7d3-4836-a45e-8678e3c8856c": resource(
        "aws_subnet.dev_snet1",
        "prod-account.tf",
        "exact-title"
      ),
      "086875d3-7510-45d7-ad0f-2292bf5c5df3": resource(
        "aws_organizations_account.dev",
        "accounts.tf",
        "reviewed-override"
      ),
      "229ad76b-75e3-4009-994f-3d15fe4bdc45": resource(
        "aws_organizations_account.staging",
        "accounts.tf",
        "reviewed-override"
      ),
      "91e0f16f-fc9d-4138-ad10-314b294cf868": resource(
        "aws_organizations_account.prod",
        "accounts.tf",
        "reviewed-override"
      ),
      "01fcba84-c396-4fe3-8548-fd7f8f8dd0d6": resource(
        "aws_instance.staging_vm1",
        "prod-account.tf",
        "exact-title"
      ),
      "02bfe5e0-3cab-412d-9f1a-4a255e2fd0ed": resource(
        "aws_instance.dev_vm1",
        "prod-account.tf",
        "exact-title"
      ),
      "07e49279-4122-4ddc-ae62-aa9aa697e2f8": resource(
        "aws_instance.dev_vm2",
        "prod-account.tf",
        "exact-title"
      ),
      "2b80a185-bfe7-46f3-b0ef-24ff013e49d0": resource(
        "aws_instance.staging_vm2",
        "prod-account.tf",
        "exact-title"
      ),
      "4b301033-2e1b-4db8-94f9-d512723b13e0": resource(
        "aws_instance.prod_vm1",
        "prod-account.tf",
        "exact-title"
      ),
      "943ef3bf-c56d-4691-927b-14f5555cf725": resource(
        "aws_instance.prod_vm2",
        "prod-account.tf",
        "exact-title"
      )
    },
    workspaceOmissions: {}
  },
  {
    rank: 18,
    captureFileName: "aws-elastic-beanstalk.json",
    outputFileName: "aws-elastic-beanstalk.ts",
    exportName: "awsElasticBeanstalkSource",
    bindings: {
      "f2425c88-44c6-439d-b3f3-d8b0f76b130b": presentation("aws-region"),
      "d40ff46e-9c47-41ae-ac6d-94b6ee7e82a0": resource("aws_vpc.default", "main.tf", "exact-title"),
      "21fc0544-3752-484e-8b4b-ba2e5d1a62f4": presentation(
        "aws-autoscaling-group",
        "aws_elastic_beanstalk_environment.default"
      ),
      "7eb561cf-2bc5-4d66-933a-2242b1a6567f": presentation("aws-availability-zone"),
      "9a33d988-aa5c-4ab1-9c0e-fd1b80102646": presentation("aws-availability-zone"),
      "5817b9fb-4c2c-4e1f-bb4d-61b71657a381": resource(
        "aws_subnet.subnet_2a",
        "main.tf",
        "exact-title"
      ),
      "a5c63292-27e8-447b-b4fc-2d231bb3580f": resource(
        "aws_subnet.subnet_2b",
        "main.tf",
        "exact-title"
      ),
      "97044051-a775-4409-8077-9c1e1f468426": resource(
        "aws_internet_gateway.default",
        "main.tf",
        "exact-title"
      ),
      "0b61aaf6-6cd1-497d-8a4d-9df7c71157b1": presentation(
        "aws-ec2-instance",
        "aws_elastic_beanstalk_environment.default"
      ),
      "1cb32ea4-78fa-41f1-aaa4-8bd6de25c903": presentation(
        "aws-ec2-instance",
        "aws_elastic_beanstalk_environment.default"
      ),
      "002f83ee-6206-4b3b-a473-e684f6504631": resource(
        "aws_elastic_beanstalk_environment.default",
        "main.tf",
        "exact-title"
      ),
      "553a42d0-41d3-4c72-a135-0ef20079465d": resource(
        "aws_elastic_beanstalk_application.default",
        "main.tf",
        "single-residual"
      ),
      "2e07a06a-d2b6-4ae1-9424-895648bce499": resource(
        "aws_route_table.default",
        "main.tf",
        "exact-title"
      ),
      "3657c666-e254-4beb-9895-baef2c9ff360": resource(
        "aws_route_table_association.route_table_association_2b",
        "main.tf",
        "reviewed-override"
      ),
      "5ffcf553-4f13-488e-9f55-675ad24b98fe": resource(
        "aws_route_table_association.route_table_association_2a",
        "main.tf",
        "reviewed-override"
      )
    },
    workspaceOmissions: {
      "variables.tf": [
        {
          sourceText: '    archuuid = "eb84baae-e3a7-4d39-b80d-a22466e5ea16"\n',
          occurrenceCount: 1
        }
      ]
    }
  },
  {
    rank: 19,
    captureFileName: "aws-rds.json",
    outputFileName: "aws-rds.ts",
    exportName: "awsRdsSource",
    bindings: {
      "b6bf501a-706d-48c9-b72e-4ab9c89dc437": presentation("aws-region"),
      "ac3623f0-25ad-4acb-92d8-0d35223ec63c": resource(
        "aws_vpc.default",
        "main.tf",
        "single-residual"
      ),
      "a0e46c7b-3b5b-4d6e-8a12-3d468f1dc564": resource(
        "aws_security_group.default",
        "main.tf",
        "single-residual"
      ),
      "2adbfb12-8509-4302-9f1d-029292991c80": presentation("aws-availability-zone"),
      "5b7c9fe1-1c7e-4928-bb43-c3eb0b25f11c": resource(
        "aws_db_subnet_group.default",
        "main.tf",
        "exact-title"
      ),
      "8d685e1f-ef90-4fef-afde-9ba043869054": presentation("aws-availability-zone"),
      "87a87f94-1a87-409c-9228-fca73e37a118": resource(
        "aws_subnet.subnet_w_2a",
        "main.tf",
        "reviewed-override"
      ),
      "b45989bc-c032-4bca-a116-0b5f0ee6c759": resource(
        "aws_subnet.subnet_w_2b",
        "main.tf",
        "reviewed-override"
      ),
      "4a365324-6e51-43b7-8084-59822f636a0d": resource(
        "aws_db_instance.db1",
        "main.tf",
        "exact-title"
      ),
      "53095c7c-9c63-4973-934d-398e684b2b0a": resource(
        "aws_db_instance.db_replica",
        "main.tf",
        "single-residual"
      ),
      "d25dcc61-c9c3-4b64-922b-cd44cb13798b": resource(
        "aws_db_parameter_group.log_db_parameter",
        "main.tf",
        "single-residual"
      )
    },
    workspaceOmissions: {
      "variables.tf": [
        {
          sourceText: '    archuuid = "f588fabc-5991-44de-b9cc-5afd1d74e710"\n',
          occurrenceCount: 1
        }
      ]
    }
  },
  {
    rank: 20,
    captureFileName: "aws-fsx-architecture.json",
    outputFileName: "aws-fsx.ts",
    exportName: "awsFsxSource",
    bindings: {
      "e39ed138-6200-410e-9d54-f567019667b7": presentation("aws-region"),
      "7e275d52-672d-4e38-b17a-aad1e06c04e8": resource("aws_vpc.default", "vpc.tf", "exact-title"),
      "9cd19ce4-c2ad-4a31-9a8b-ded606955752": presentation("aws-availability-zone"),
      "555b4f12-4843-4c1a-aa99-8771f272d00c": presentation("aws-availability-zone"),
      "265b7ddb-d288-41f7-8459-7d3ace1c30b9": resource(
        "aws_subnet.public_a",
        "public.tf",
        "reviewed-override"
      ),
      "2702e115-2e4a-4d50-9424-59b727352c73": resource(
        "aws_subnet.public_b",
        "public.tf",
        "reviewed-override"
      ),
      "b0dc4cbd-651f-42f7-b725-d3e7220d5559": resource(
        "aws_subnet.private_a",
        "private.tf",
        "reviewed-override"
      ),
      "9530b9bb-8579-4ae9-ae26-fa12f94a4068": resource(
        "aws_subnet.private_b",
        "private.tf",
        "reviewed-override"
      ),
      "48a880f1-2fcf-4c52-9018-1f5af605f205": resource(
        "aws_security_group.fsx",
        "main.tf",
        "exact-title"
      ),
      "6a076cc5-40f2-4be7-b5b1-989687a1b017": presentation(null),
      "78a94b1f-80ba-46b1-8204-1072ca27b91d": presentation(null),
      "6b6b83ad-b493-4db8-ad88-17d2c5e75426": resource(
        "aws_internet_gateway.default",
        "public.tf",
        "single-residual"
      ),
      "19e4afd8-69f2-4959-a167-b8534d802b99": resource(
        "aws_network_acl.public_b",
        "main.tf",
        "reviewed-override"
      ),
      "b8e1ad82-f128-4801-ab61-99638f01082e": resource(
        "aws_network_acl.public_a",
        "main.tf",
        "reviewed-override"
      ),
      "c7a6ebee-753c-4aab-9075-6ae092cfc4a0": resource("aws_eip.eip_a", "public.tf", "exact-title"),
      "d7459e44-ed51-418c-805d-3f65ae50de2e": resource(
        "aws_nat_gateway.nat-gw-2a-public",
        "public.tf",
        "exact-title"
      ),
      "0cbffe9f-5ede-4969-b752-e22cb6fadcc2": resource(
        "aws_nat_gateway.nat-gw-2b-public",
        "public.tf",
        "exact-title"
      ),
      "194c263d-746a-43f0-af23-18445c225246": resource(
        "aws_s3_bucket.default",
        "storage.tf",
        "exact-title"
      ),
      "cd6d6243-292a-4775-baf7-35bcff8f1b56": resource(
        "aws_s3_bucket.vpc_logs",
        "vpc.tf",
        "exact-title"
      ),
      "6273bc80-9064-4f64-802d-e03902cbc52d": resource(
        "aws_s3_bucket_public_access_block.default",
        "storage.tf",
        "reviewed-override"
      ),
      "c0943882-2bf4-415b-83ab-21c7bb692b08": resource(
        "aws_s3_bucket_public_access_block.vpc_logs",
        "vpc.tf",
        "reviewed-override"
      ),
      "74346525-1052-4a0b-9e90-0253d59203dd": resource("aws_eip.eip_b", "public.tf", "exact-title"),
      "064d4e6f-a4bb-4041-8104-da21f1dd5bfb": presentation("design-internet"),
      "f6768a8b-80fa-4dda-a435-32f0c81c5e24": resource(
        "aws_flow_log.default",
        "vpc.tf",
        "single-residual"
      ),
      "c3ae8f08-53e4-4d58-a37c-11e1c914492a": resource(
        "aws_fsx_lustre_file_system.aws_fsx_lustre_file_system_12",
        "main.tf",
        "single-residual"
      ),
      "d0683fa2-c9a4-4966-9b98-ffa6892efa08": presentation(
        "aws-fsx-lustre-file-system",
        "aws_fsx_lustre_file_system.aws_fsx_lustre_file_system_12"
      ),
      "54dcd23d-fd8e-4f8f-bc56-a81fcde34c8e": resource(
        "aws_s3_bucket_versioning.default",
        "storage.tf",
        "reviewed-override"
      ),
      "c256a91a-8093-495c-b853-e52691c9d8c4": resource(
        "aws_s3_bucket_versioning.vpc_logs",
        "vpc.tf",
        "reviewed-override"
      ),
      "364622cd-cd1c-483a-98b0-60f51b5ecdc9": resource(
        "aws_s3_bucket_server_side_encryption_configuration.default",
        "storage.tf",
        "reviewed-override"
      ),
      "8142cb9b-82c4-4772-a377-7d0162045d7b": resource(
        "aws_s3_bucket_server_side_encryption_configuration.vpc_logs",
        "vpc.tf",
        "reviewed-override"
      )
    },
    workspaceOmissions: {
      "variables.tf": [
        {
          sourceText: '    archuuid = "a1a4b134-bc00-4f97-82b8-46346da8ecde"\n',
          occurrenceCount: 1
        }
      ]
    }
  }
]);
