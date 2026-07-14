import { defineFixtureBatch, presentation, resource } from "./define-config.mjs";

export const fixtures = defineFixtureBatch([
  {
    rank: 1,
    captureFileName: "training-aws-onboarding.json",
    outputFileName: "training-aws-onboarding.ts",
    exportName: "trainingAwsOnboardingSource",
    bindings: {
      "c7cf2dc9-4cc9-481f-b53f-9904151e2630": resource("aws_security_group.cluster-sg", "main.tf", "exact-title"),
      "a9e7e1c4-6179-45d2-b7bc-885e61755ac2": presentation("aws-region"),
      "3a7c40fe-8ca2-429b-a762-605aed1a0a33": resource("aws_vpc.default", "main.tf", "exact-title"),
      "2c258322-661f-471b-b0e6-85d49fd8e46b": presentation("aws-availability-zone"),
      "dc0a5b25-308f-4bc2-871b-d5083cf2d0e2": presentation("aws-availability-zone"),
      "7fc5471e-298b-4fe8-b8dd-61c9e12374a6": resource("aws_subnet.snet1", "main.tf", "exact-title"),
      "9647ef8e-ba33-4608-be6b-79271f103fe3": resource("aws_subnet.snet2", "main.tf", "exact-title"),
      "1deba4c9-a88f-4b0e-995a-2e5dc304d167": resource("aws_iam_role_policy_attachment.node-AmazonEC2ContainerRegistryReadOnly", "main.tf", "reviewed-override"),
      "548abc5b-922e-4cf6-95ea-4c34c2fe5459": resource("aws_iam_role.iam-cluster", "main.tf", "exact-title"),
      "57b6aa35-9b3d-46bd-967d-07493b8aaa5e": resource("aws_iam_role_policy_attachment.node-AmazonEKS_CNI_Policy", "main.tf", "reviewed-override"),
      "85d344cc-b877-4e92-a4fc-6ac1a7224135": resource("aws_iam_role.default-iam", "main.tf", "exact-title"),
      "8a4bb82f-8ca2-4314-aa88-a7895bbe985d": resource("aws_iam_role_policy_attachment.node-AmazonEKSWorkerNodePolicy", "main.tf", "reviewed-override"),
      "b1dff648-3242-4a8f-bde8-5a30459b5d09": resource("aws_iam_role_policy_attachment.cluster-AmazonEKSVPCResourceController", "main.tf", "reviewed-override"),
      "bb5eb85d-fe0a-4239-affd-f34192d53c79": resource("aws_iam_role_policy_attachment.cluster-AmazonEKSClusterPolicy", "main.tf", "reviewed-override"),
      "6c68b992-6afd-4fc8-b37c-45da1f674b4c": resource("aws_internet_gateway.gtw", "main.tf", "single-residual"),
      "f76286ac-796e-463a-b5a7-1fd6bfdc6a7a": resource("aws_route_table.default", "main.tf", "single-residual"),
      "0c5bbe79-b35c-46f0-8281-f9e02e95225a": resource("aws_eks_cluster.default", "main.tf", "single-residual"),
      "22a6d153-9c4c-49d4-a5b8-3c2fbb29162b": resource("aws_eks_node_group.default", "main.tf", "single-residual"),
      "78653b46-a7fb-490f-a677-70663c22cc5c": resource("aws_security_group_rule.cluster-ingress-workstation-https", "main.tf", "single-residual"),
      "ea26b075-2ec2-4686-9450-92cebdeeee7b": resource("aws_route_table_association.route-association-3", "main.tf", "reviewed-override"),
      "ee8367ce-4b1b-4b45-9fca-eeec80c852dd": resource("aws_route_table_association.route-association-2", "main.tf", "reviewed-override"),
      "e663734e-34c4-4211-825d-f7844e11c3e6": presentation("design-internet")
    },
    workspaceOmissions: {
      "main.tf": ['    archUUID = "db83bcc0-696a-4f64-a6d5-fcc143caf3e2"\n'],
      "variables.tf": ['    archuuid = "d71155af-5339-44f1-ae11-2bcd29411c2d"\n']
    }
  },
  {
    rank: 2,
    captureFileName: "aws-kubernetes-native-cnis.json",
    outputFileName: "aws-kubernetes-native-cnis.ts",
    exportName: "awsKubernetesNativeCnisSource",
    bindings: {
      "839c066c-c756-4005-aeb5-67c1e8c34cf7": presentation("aws-region"),
      "37304ca4-7959-4553-802c-96b74972173a": resource("aws_vpc.default", "main.tf", "exact-title"),
      "5941a072-4406-4e02-ab93-560811155e88": resource("aws_security_group.sg", "main.tf", "exact-title"),
      "5adb3d4d-2c10-46fe-93f8-691ad10c863a": presentation("aws-availability-zone"),
      "e88227bb-9f4f-4710-87a7-ad9ae751e7c0": presentation("aws-availability-zone"),
      "5b25dc4d-2481-4368-89be-255a3f450843": resource("aws_subnet.snet-1b", "main.tf", "exact-title"),
      "c7985a34-a745-4fc3-8e0c-32ceec6626f8": resource("aws_subnet.snet-1a", "main.tf", "exact-title"),
      "80d3a744-01c0-4e70-91e9-2186f7cdf201": presentation(null),
      "25376bca-5df7-479f-a809-cf06e64b7ca7": resource("aws_iam_role_policy_attachment.iam_role_policy_attachment", "iam.tf", "reviewed-override"),
      "2d045230-f49c-49bc-87b8-88f700f6781a": resource("aws_iam_role_policy_attachment.iam_role_policy_attachment3", "iam.tf", "reviewed-override"),
      "42135c8e-4923-4254-b4c1-b22be65e236b": resource("aws_iam_role.node_group", "iam.tf", "exact-title"),
      "6f7256c8-2659-4d8d-865d-796e54991c87": resource("aws_iam_role_policy_attachment.iam_role_policy_attachment4", "iam.tf", "reviewed-override"),
      "b99df77b-1e2f-4322-9e97-0b4d91671f96": resource("aws_iam_role.eks", "iam.tf", "exact-title"),
      "c5930055-9371-4053-8473-91274baf223e": resource("aws_iam_role_policy_attachment.iam_role_policy_attachment2", "iam.tf", "reviewed-override"),
      "cb3135b3-a5b2-4d99-a025-049c131c7ab1": resource("aws_iam_role_policy_attachment.iam_role_policy_attachment5", "iam.tf", "reviewed-override"),
      "45cb2eaf-9c40-4235-aa0a-b588cd32fcb4": resource("aws_internet_gateway.internet_gw", "main.tf", "single-residual"),
      "7928be85-4122-45f6-b424-fba82256c200": resource("aws_route_table.rt", "main.tf", "single-residual"),
      "767c4506-e235-40be-b156-037382cf07a7": resource("aws_eks_node_group.eks_node_group", "cluster.tf", "single-residual"),
      "c34dd495-8609-4ac1-9a14-ee10979fd664": resource("aws_security_group_rule.sg_rule", "main.tf", "single-residual"),
      "fe650b89-3abf-433e-87d7-612606ec80df": resource("aws_eks_cluster.main", "cluster.tf", "single-residual"),
      "228e33c2-8279-40e1-ad69-745eebcae150": resource("aws_route_table_association.rt_association2", "main.tf", "reviewed-override"),
      "fa115f68-d3a4-433f-9f23-acba35012866": resource("aws_route_table_association.rt_association", "main.tf", "reviewed-override")
    },
    workspaceOmissions: {}
  }
]);
