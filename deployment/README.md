# AWS ECS Deployment

Provisions the app on AWS ECS Fargate: an ALB routing `/api/*` to the backend and everything
else to the frontend, both services pulling images from ECR, deployed automatically by GitHub
Actions after CI passes on `main`.

## One-time infra bootstrap (run yourself — not automated)

Requires your AWS sandbox credentials configured locally (`aws configure` / SSO) and
[Terraform](https://developer.hashicorp.com/terraform/install) >= 1.6.

```bash
cd deployment/terraform
cp terraform.tfvars.example terraform.tfvars   # edit github_repository to match your fork
terraform init
terraform apply
```

This creates: a VPC with two public subnets (no NAT Gateway, to avoid sandbox cost), an ALB,
an ECS cluster, two ECR repos, two ECS services (Fargate, 1 task each), CloudWatch log groups,
and a GitHub OIDC identity provider + deploy role (no AWS access keys required).

Note: the ECS services will show tasks failing to start until the first successful CD run
pushes a real image — the task definitions are bootstrapped with a `:latest` tag that doesn't
exist in ECR yet.

After `apply`, note two outputs:

```bash
terraform output alb_dns_name          # the app's public URL
terraform output github_deploy_role_arn
```

## GitHub repo setup

Add one repository secret (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | the `github_deploy_role_arn` output above |

No AWS access key/secret pair is needed — [.github/workflows/cd.yml](../.github/workflows/cd.yml)
authenticates via OIDC, scoped by the Terraform-created role to only this repo's `main` branch.

## How deploys work

`cd.yml` triggers when the `CI` workflow completes successfully on `main`. For each service it:
builds the Docker image, pushes it to ECR tagged with the commit SHA (and `:latest`), fetches
the live ECS task definition, swaps in the new image, registers a new revision, and updates the
ECS service — waiting for the new tasks to become healthy before finishing.

## Tearing down

```bash
cd deployment/terraform
terraform destroy
```
