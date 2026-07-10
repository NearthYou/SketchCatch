variable "aws_region" {
  description = "AWS region for SketchCatch production infrastructure."
  type        = string
  default     = "ap-northeast-2"
}

variable "tags" {
  description = "Additional tags for resources added after an approved import review."
  type        = map(string)
  default     = {}
}