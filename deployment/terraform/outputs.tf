output "alb_dns_name" {
  description = "Public URL for the deployed app (frontend at /, API at /api/*)."
  value       = aws_lb.main.dns_name
}

output "ecr_backend_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_repository_url" {
  value = aws_ecr_repository.frontend.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "github_deploy_role_arn" {
  description = "Set this as the AWS_DEPLOY_ROLE_ARN GitHub Actions secret — no access keys needed."
  value       = aws_iam_role.github_deploy.arn
}
