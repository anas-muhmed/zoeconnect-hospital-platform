terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Fill in your own remote state backend before running `terraform init`
  # in a real environment -- local state is fine for a first `plan` dry
  # run, never for a real staging/production apply shared across a team.
  # backend "s3" {
  #   bucket         = "hdsp-terraform-state"
  #   key            = "phase9/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "hdsp-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "HDSP"
      Environment = var.environment
      ManagedBy   = "terraform"
      Phase       = "9"
    }
  }
}
