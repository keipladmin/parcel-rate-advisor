variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "eu-west-2"
}

variable "project_name" {
  description = "Short name used as a prefix for every resource this stack creates."
  type        = string
  default     = "parcel-rate-advisor"
}

variable "github_repository" {
  description = "GitHub repo allowed to assume the deploy role via OIDC, as \"owner/repo\"."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the stack's VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDRs for two public subnets (one per AZ) — tasks and the ALB both live here to avoid NAT Gateway cost in this sandbox."
  type        = list(string)
  default     = ["10.42.1.0/24", "10.42.2.0/24"]
}

variable "backend_container_port" {
  type    = number
  default = 8000
}

variable "frontend_container_port" {
  type    = number
  default = 80
}

variable "task_cpu" {
  description = "Fargate task CPU units (256 = .25 vCPU) — small since determine() is mocked/lightweight."
  type        = string
  default     = "256"
}

variable "task_memory" {
  description = "Fargate task memory in MiB."
  type        = string
  default     = "512"
}
