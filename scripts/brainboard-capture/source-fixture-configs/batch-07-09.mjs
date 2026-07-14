import { defineFixtureBatch, presentation, resource } from "./define-config.mjs";

export const fixtures = defineFixtureBatch([
  {
    rank: 7,
    captureFileName: "aws-jenkins-ec2.json",
    outputFileName: "aws-jenkins-ec2.ts",
    exportName: "awsJenkinsEc2Source",
    bindings: {
      "f4301d28-06e3-4263-a5ec-5315eb4f7e69": presentation("aws-region"),
      "00247cae-d87b-40b3-987f-08a702b062f3": resource(
        "aws_vpc.vpc_master",
        "main.tf",
        "exact-title"
      ),
      "7284b103-be2a-4159-b7f4-b6ab0cb802fa": presentation("aws-availability-zone"),
      "8894d2b3-f035-4824-ae9c-ed68cae67835": presentation("aws-availability-zone"),
      "e4672c0f-349e-4a5f-951e-1950b90adbea": presentation("aws-region"),
      "4c8d5064-37af-4f69-84ae-093f1652e998": resource(
        "aws_vpc.vpc_master_us_west_2",
        "main.tf",
        "exact-title"
      ),
      "050262e9-c94b-48b6-90b1-7298da1a70a2": presentation("aws-availability-zone"),
      "b55a1748-7a18-424f-b047-ffa56acd1a92": resource(
        "aws_subnet.subnet_1",
        "main.tf",
        "exact-title"
      ),
      "0521d44b-15ce-40f0-abb8-6f2bd189eafa": resource(
        "aws_subnet.subnet_2",
        "main.tf",
        "exact-title"
      ),
      "be92d4fa-43ef-4fbf-a4ee-71ae6647998e": resource(
        "aws_subnet.subnet_1_oregon",
        "main.tf",
        "exact-title"
      ),
      "5b91539b-dc2d-4d8d-9aac-a1c52e9b7200": resource(
        "aws_security_group.lb-sg",
        "main.tf",
        "exact-title"
      ),
      "33ce152b-f405-4f28-86e5-4e894df70cd4": resource(
        "aws_security_group.jenkins-sg",
        "main.tf",
        "exact-title"
      ),
      "714b53d2-89b3-465a-9151-2318985dbd2d": resource(
        "aws_security_group.jenkins-sg-oregon",
        "main.tf",
        "exact-title"
      ),
      "19c57b20-0ebb-4efb-b35e-8c37e175e918": resource(
        "aws_internet_gateway.igw",
        "main.tf",
        "single-residual"
      ),
      "08a82fc0-d9d9-46af-a271-b7b182986246": resource(
        "aws_internet_gateway.igw-oregon",
        "main.tf",
        "exact-title"
      ),
      "606e1369-d916-490e-94c7-4aedeeafe7e0": resource(
        "aws_vpc_peering_connection.useast2-uswest2",
        "main.tf",
        "single-residual"
      ),
      "651d53c3-cceb-4967-b5c3-e025e140fa3b": resource(
        "aws_route_table.internet_route",
        "main.tf",
        "single-residual"
      ),
      "fa46f093-d66a-4f84-8568-a3c04fdc2c44": resource(
        "aws_main_route_table_association.aws_main_route_table_association_d71db21a",
        "main.tf",
        "single-residual"
      ),
      "bb82de1b-7d92-41fc-a0a9-d1c5e3634d11": resource(
        "aws_route_table.internet_route_oregon",
        "main.tf",
        "exact-title"
      ),
      "cac8d6c9-02a8-4984-8a5d-c398d6c7e50a": resource(
        "aws_main_route_table_association.set-worker-default-rt-assoc",
        "main.tf",
        "exact-title"
      ),
      "4fd77125-9a08-4a94-8900-6d00c4037415": resource(
        "aws_security_group_rule.ingress_443",
        "main.tf",
        "reviewed-override"
      ),
      "cd3c4233-a339-4f9a-b03f-a60ade2ce25c": resource(
        "aws_security_group_rule.aws_security_group_rule-cd816426",
        "main.tf",
        "reviewed-override"
      ),
      "f4ae7e8a-8781-4991-a258-6bc4fdeebb62": resource(
        "aws_security_group_rule.aws_security_group_rule-bba6e6bc",
        "main.tf",
        "reviewed-override"
      ),
      "322e3f91-de14-40e9-95e7-d2961ebe5add": resource(
        "aws_security_group_rule.aws_security_group_rule-a5db6d6d",
        "main.tf",
        "reviewed-override"
      ),
      "66ebe038-ae86-4ec6-8f43-6ddddf3a1f9d": resource(
        "aws_security_group_rule.aws_security_group_rule-bcdf5fec",
        "main.tf",
        "reviewed-override"
      ),
      "ec1ee03a-b434-450d-83f4-a3c881aca9e9": resource(
        "aws_security_group_rule.aws_security_group_rule-becf1315",
        "main.tf",
        "reviewed-override"
      ),
      "7e0371f7-989e-4443-81f4-ba9507600c5b": resource(
        "aws_security_group_rule.aws_security_group_rule-dc61e49a",
        "main.tf",
        "reviewed-override"
      ),
      "a0bc45ed-9de6-4e39-acaf-669b0ece77ea": resource(
        "aws_security_group_rule.aws_security_group_rule-6a963203",
        "main.tf",
        "reviewed-override"
      ),
      "054d907a-9682-42cd-a2fe-58e6c2d8bff7": resource(
        "aws_security_group_rule.aws_security_group_rule-d771cb77",
        "main.tf",
        "reviewed-override"
      ),
      "69b98bc5-0d94-4536-839a-fc59f824e62c": resource(
        "aws_security_group_rule.aws_security_group_rule-c0f59b71",
        "main.tf",
        "reviewed-override"
      ),
      "876fa860-938e-4e32-b1d1-14ff0746f644": resource(
        "aws_key_pair.master-key",
        "main.tf",
        "exact-title"
      ),
      "822a6dc6-00bf-40cb-9929-7042413ebe17": resource(
        "aws_key_pair.worker-key",
        "main.tf",
        "exact-title"
      ),
      "0bc773fc-ee96-4d04-8113-fd6e67060f5f": resource(
        "aws_instance.jenkins-master",
        "main.tf",
        "exact-title"
      ),
      "f80213b2-c624-4641-ba30-a1ae3839a93f": resource(
        "aws_instance.jenkins-worker-oregon",
        "main.tf",
        "exact-title"
      ),
      "a9e9123e-b88b-49c5-8266-81e77ef12a9a": resource(
        "aws_route53_record.cert_validation",
        "main.tf",
        "exact-title"
      ),
      "21b5bc02-743e-423f-8262-d210ad83825a": resource(
        "aws_route53_record.jenkins",
        "main.tf",
        "exact-title"
      ),
      "08d05e4d-826e-4c51-a218-ed4448ecb8a2": resource(
        "aws_vpc_peering_connection_accepter.accept_peering",
        "main.tf",
        "exact-title"
      ),
      "6331936d-d4de-41f0-ab45-a1f9a8ed2260": resource(
        "aws_lb.application-lb",
        "main.tf",
        "exact-title"
      ),
      "b7918332-62bd-4112-8907-c1cfbb07f2f1": resource(
        "aws_lb_target_group.app-lb-tg",
        "main.tf",
        "exact-title"
      ),
      "a45b829c-0e30-4596-aebd-815bdfed85b5": resource(
        "aws_lb_listener.aws_lb_listener_117174a9",
        "main.tf",
        "single-residual"
      ),
      "258928c4-85a7-4bf8-bd79-773dfa53a4b9": resource(
        "aws_lb_listener.jenkins-listener-https",
        "main.tf",
        "exact-title"
      ),
      "89e6ed9b-46d3-475c-a1fb-33c2d9abfae4": resource(
        "aws_lb_target_group_attachment.jenkins-master-attach",
        "main.tf",
        "exact-title"
      ),
      "ae51f41c-19a4-4161-abaa-b89059718743": resource(
        "aws_acm_certificate.jenkins-lb-https",
        "main.tf",
        "single-residual"
      ),
      "c0387977-4047-43de-ae43-6edc8dbd91d9": resource(
        "aws_acm_certificate_validation.cert",
        "main.tf",
        "single-residual"
      )
    },
    workspaceOmissions: {
      "variables.tf": [
        {
          sourceText: '    archuuid = "c884d82a-6fab-454f-a984-619d65ad6044"\n',
          occurrenceCount: 1
        }
      ]
    }
  },
  {
    rank: 8,
    captureFileName: "aws-rest-api-documentdb.json",
    outputFileName: "aws-rest-api-documentdb.ts",
    exportName: "awsRestApiDocumentDbSource",
    bindings: {
      "9adcf8e5-26cb-484e-9ae5-6535a6a1894d": presentation("aws-region"),
      "8cc66a70-095a-4dd1-b32d-9be569d07d43": resource(
        "aws_vpc.restAPI-vpc",
        "main.tf",
        "exact-title"
      ),
      "6a793bea-ff9a-4951-bf42-7ff3f987219d": resource(
        "aws_subnet.restAPI-subnet",
        "main.tf",
        "exact-title"
      ),
      "352c51ca-9f42-4d1d-b2ea-cddba97c5f91": resource(
        "aws_lambda_function.restAPI-lambda",
        "main.tf",
        "reviewed-override"
      ),
      "08ec8f09-61cc-4bca-aa03-bba22b030378": resource(
        "aws_lambda_function.restAPI-lambda-ext",
        "main.tf",
        "reviewed-override"
      ),
      "82fc5147-833e-4d85-a63e-7809cecbc533": resource(
        "aws_apigatewayv2_api.restAPI-gw",
        "main.tf",
        "single-residual"
      ),
      "9ae294ea-de55-47ee-ac40-9fdc891717fa": resource(
        "aws_secretsmanager_secret.restAPI-db-creds",
        "main.tf",
        "single-residual"
      ),
      "c3987042-939e-4ef9-bf00-40bae8f06412": resource(
        "aws_docdb_cluster.restAPI-documentdb",
        "main.tf",
        "single-residual"
      ),
      "e350f53e-754f-421b-b01d-46f66ce0c2a4": presentation("design-user-client"),
      "15908d66-a92a-4177-9a30-abfc0f29eabc": presentation(null)
    },
    workspaceOmissions: {
      "main.tf": [
        {
          sourceText: '    archUUID = "1d36075c-54dd-4bf7-a797-c19d1ff008a3"\n',
          occurrenceCount: 7
        }
      ],
      "variables.tf": [
        {
          sourceText: '    archuuid = "9447b484-b256-42b3-b933-ced015820d0b"\n',
          occurrenceCount: 1
        }
      ]
    }
  },
  {
    rank: 9,
    captureFileName: "aws-network-landing-zone.json",
    outputFileName: "aws-network-landing-zone.ts",
    exportName: "awsNetworkLandingZoneSource",
    bindings: {
      "eaf4b1f2-372f-4eef-968c-5137fb0941ef": presentation("aws-region"),
      "2abe13e0-233f-4e11-9d24-05e9b3d61bdf": resource("aws_vpc.default", "main.tf", "exact-title"),
      "8487e22b-1a81-4b45-87f4-3415848b288a": presentation("aws-availability-zone"),
      "a8cbdb9e-1255-44d1-9ccc-af111d08dc6d": presentation("aws-availability-zone"),
      "efe4bfff-0849-45a3-81fd-d78dcec9062e": presentation("aws-availability-zone"),
      "ceb5c182-f15b-4fed-8cd2-ae6f38ae57bb": resource(
        "aws_subnet.public_a",
        "public.tf",
        "reviewed-override"
      ),
      "59330f93-ad09-4e27-8125-9ed70c14f18d": resource(
        "aws_subnet.public_b",
        "public.tf",
        "reviewed-override"
      ),
      "d8602f90-fb4f-43f4-b4de-810d0117cc46": resource(
        "aws_subnet.public_c",
        "public.tf",
        "reviewed-override"
      ),
      "75bf4e98-45fc-47f3-91d3-3c96bcbbde9c": resource(
        "aws_subnet.private_a",
        "private.tf",
        "reviewed-override"
      ),
      "c922d942-2e74-48fa-8ad7-588328b69fbd": resource(
        "aws_subnet.private_b",
        "private.tf",
        "reviewed-override"
      ),
      "7706801a-075a-4573-ba3c-fa5fcdcb5e39": resource(
        "aws_subnet.private_c",
        "private.tf",
        "reviewed-override"
      ),
      "c5e2f82f-fa10-4734-ba7b-13c62eca245c": resource("aws_eip.eip_a", "public.tf", "exact-title"),
      "930b2ef4-42c3-47c3-a5f2-8f1c8b66eeb2": resource(
        "aws_nat_gateway.nat-gw-2a-public",
        "public.tf",
        "exact-title"
      ),
      "7e887897-a039-4423-90de-08855d52d313": resource(
        "aws_nat_gateway.nat-gw-2b-public",
        "public.tf",
        "exact-title"
      ),
      "63b13b84-61f9-4e19-bb60-a3d254b4ec5c": resource(
        "aws_nat_gateway.nat-gw-2c-public",
        "public.tf",
        "exact-title"
      ),
      "d1d206eb-491d-49e0-89f8-a079f364504b": resource("aws_eip.eip_b", "public.tf", "exact-title"),
      "19d29edd-f56f-4e0c-8783-f484e8ba099b": resource(
        "aws_route_table.rt_public_a",
        "public.tf",
        "exact-title"
      ),
      "991494f9-ef01-48fc-a913-5fcf1ef4d36f": resource(
        "aws_route_table.rt_public_b",
        "public.tf",
        "exact-title"
      ),
      "ee5363fd-574a-41db-8101-3f1b3f9a4a89": resource("aws_eip.eip_c", "public.tf", "exact-title"),
      "4bcc66c1-1ca5-4598-b191-43978626b5d4": resource(
        "aws_route_table.rt_private_a",
        "private.tf",
        "exact-title"
      ),
      "3a83b88a-5972-4fa0-a93d-a5e9043dd346": resource(
        "aws_route_table.rt_public_c",
        "public.tf",
        "exact-title"
      ),
      "e2b5b2fc-8c8c-4ba3-ac14-7ef1f114adae": resource(
        "aws_route_table.rt_private_b",
        "private.tf",
        "exact-title"
      ),
      "ccbad7d3-fe39-4213-953c-0884b6e0aa64": resource(
        "aws_route_table.rt_private_c",
        "private.tf",
        "exact-title"
      ),
      "33d669e3-4362-4e39-b077-46eaa146ea0b": presentation("design-internet"),
      "eafb249d-07f3-431b-9f76-dbd55ad496fe": resource(
        "aws_flow_log.default",
        "main.tf",
        "exact-title"
      ),
      "b52fd88e-c798-4539-bc2c-c96d2ff2a59a": resource(
        "aws_internet_gateway.default",
        "public.tf",
        "exact-title"
      )
    },
    workspaceOmissions: {}
  }
]);
