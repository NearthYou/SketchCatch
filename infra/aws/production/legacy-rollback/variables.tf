variable "aws_region" {
  description = "AWS region for SketchCatch production infrastructure."
  type        = string
  default     = "ap-northeast-2"
}

variable "tags" {
  description = "Additional tags for cold rollback resources."
  type        = map(string)
  default     = {}
}

variable "enable_cold_rollback" {
  description = "Create temporary EC2 and ALB rollback resources from the retained AMI. Keep false outside an approved incident."
  type        = bool
  default     = false
}

variable "cold_rollback_ami_id" {
  description = "Sanitized, retained SketchCatch cold rollback AMI ID."
  type        = string
  default     = ""
}

variable "vpc_id" {
  description = "Existing production VPC for a temporary cold rollback restore."
  type        = string
  default     = ""
}

variable "public_subnet_ids" {
  description = "Public subnets used by the temporary rollback ALB."
  type        = list(string)
  default     = []
}

variable "instance_subnet_id" {
  description = "Subnet for the temporary rollback EC2 instance."
  type        = string
  default     = ""
}

variable "instance_profile_name" {
  description = "Existing SSM-capable EC2 instance profile used during rollback."
  type        = string
  default     = "SketchCatch-EC2-Role"
}

variable "instance_type" {
  description = "Temporary rollback EC2 instance type. Cost-bearing only while cold rollback is enabled."
  type        = string
  default     = "t3.medium"
}

variable "certificate_arn" {
  description = "Retained production ACM certificate ARN for HTTPS rollback smoke."
  type        = string
  default     = ""
}

variable "allowed_https_cidr_blocks" {
  description = "CIDR blocks allowed to reach the temporary rollback ALB."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "rds_security_group_ids" {
  description = "Existing RDS security groups that should temporarily accept the cold rollback instance."
  type        = set(string)
  default     = []
}

variable "rds_port" {
  description = "RDS port opened only from the temporary cold rollback instance security group."
  type        = number
  default     = 5432
}

variable "redis_security_group_ids" {
  description = "Existing Redis security groups that should temporarily accept the cold rollback instance."
  type        = set(string)
  default     = []
}

variable "redis_port" {
  description = "Redis port opened only from the temporary cold rollback instance security group."
  type        = number
  default     = 6379
}
