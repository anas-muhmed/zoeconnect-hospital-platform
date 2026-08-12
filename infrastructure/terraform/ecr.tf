# ECR repositories for the images built from infrastructure/docker/*.
# Connector is included for completeness (its own optional task
# definition exists in infrastructure/ecs/connector-task-definition.json)
# even though it's not part of the three ECS-managed services above.

resource "aws_ecr_repository" "backend" {
  name                 = "${var.project_name}-backend" # shared by both the api and worker services
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "frontend" {
  name                 = "${var.project_name}-frontend"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "connector" {
  name                 = "${var.project_name}-connector"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "expire_untagged" {
  for_each = {
    backend    = aws_ecr_repository.backend.name
    frontend   = aws_ecr_repository.frontend.name
    connector  = aws_ecr_repository.connector.name
  }
  repository = each.value

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Expire untagged images after 14 days"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 14
      }
      action = { type = "expire" }
    }]
  })
}
