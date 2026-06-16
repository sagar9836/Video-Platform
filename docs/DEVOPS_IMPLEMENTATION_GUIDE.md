# DevOps Implementation Guide

This guide explains how to make this video platform DevOps-ready using:

- Jenkins for CI/CD
- Docker images for each service
- Kubernetes for running the application
- Helm for Kubernetes packaging
- Terraform for AWS infrastructure on EC2
- S3 and CloudFront for production video storage

The current project already has Docker Compose, a FastAPI backend, React frontend, FFmpeg worker, PostgreSQL, Redis, Kafka, LiveKit, and local video storage. This guide shows how to evolve that into a stronger deployment architecture.

## Target Architecture

```text
Developer
  |
  v
Git Repository
  |
  v
Jenkins Pipeline
  |
  |-- lint/build/test
  |-- build Docker images
  |-- push images to AWS ECR
  |-- run Terraform checks
  |-- deploy with Helm
  v
AWS EC2 Instance
  |
  |-- Kubernetes cluster, for example k3s
  |
  |-- frontend pod
  |-- api pod
  |-- ffmpeg worker pod
  |-- postgres pod or RDS
  |-- redis pod or ElastiCache
  |-- kafka pod
  |-- livekit pod
  |-- livekit-egress pod
  |
  v
AWS S3 + CloudFront
  |
  |-- raw uploaded videos
  |-- processed HLS files
  |-- thumbnails
```

## Recommended Storage Strategy

For a strong DevOps project, use this split:

```text
Local development:
  STORAGE_BACKEND=local
  videos stored in backend/media

Production:
  STORAGE_BACKEND=s3
  videos stored in S3
  playback through CloudFront
```

Avoid using container-local video storage in production. Kubernetes pods can restart or move, so files inside containers are not reliable. If you want local production storage, use PersistentVolumes, but S3 is the better design for a video platform.

## Phase 1: Prepare The Repository

Create this structure:

```text
.
├── Jenkinsfile
├── docker-compose.yml
├── docs/
│   ├── AWS_S3_CLOUDFRONT_SETUP.md
│   └── DEVOPS_IMPLEMENTATION_GUIDE.md
├── helm/
│   └── video-platform/
│       ├── Chart.yaml
│       ├── values.yaml
│       ├── values-dev.yaml
│       ├── values-prod.yaml
│       └── templates/
└── terraform/
    ├── environments/
    │   ├── dev/
    │   └── prod/
    └── modules/
        ├── vpc/
        ├── ec2/
        ├── ecr/
        ├── s3/
        ├── cloudfront/
        └── iam/
```

Keep Docker Compose for local development. Use Helm and Kubernetes for cloud deployment.

## Phase 2: Docker Image Plan

Build and publish three main images:

```text
video-platform-frontend
video-platform-api
video-platform-ffmpeg
```

Current Dockerfiles:

```text
frontend/Dockerfile
backend/Dockerfile
backend/ffmpeg_service/Dockerfile
```

Push images to AWS ECR:

```text
ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/video-platform-frontend
ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/video-platform-api
ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/video-platform-ffmpeg
```

Use immutable tags:

```text
jenkins-BUILD_NUMBER-GIT_COMMIT
```

Example:

```text
video-platform-api:jenkins-42-a1b2c3d
```

## Phase 3: Jenkins CI/CD Pipeline

Create `Jenkinsfile` in the project root.

Recommended stages:

```text
Checkout
Frontend install
Frontend lint
Frontend build
Backend syntax/import check
Docker build
Docker push to ECR
Helm lint
Terraform validate
Deploy with Helm
Smoke test
```

Example Jenkinsfile:

```groovy
pipeline {
  agent any

  environment {
    AWS_REGION = 'ap-south-1'
    ECR_REGISTRY = 'ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com'
    IMAGE_TAG = "jenkins-${BUILD_NUMBER}-${GIT_COMMIT.take(7)}"
    KUBECONFIG = credentials('kubeconfig-video-platform')
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Frontend Checks') {
      steps {
        dir('frontend') {
          bat 'npm.cmd ci'
          bat 'npm.cmd run lint'
          bat 'npm.cmd run build'
        }
      }
    }

    stage('Backend Checks') {
      steps {
        dir('backend') {
          bat 'py -m compileall app ffmpeg_service'
        }
      }
    }

    stage('Login To ECR') {
      steps {
        bat 'aws ecr get-login-password --region %AWS_REGION% | docker login --username AWS --password-stdin %ECR_REGISTRY%'
      }
    }

    stage('Build Images') {
      steps {
        bat 'docker build -t %ECR_REGISTRY%/video-platform-frontend:%IMAGE_TAG% ./frontend'
        bat 'docker build -t %ECR_REGISTRY%/video-platform-api:%IMAGE_TAG% ./backend'
        bat 'docker build -t %ECR_REGISTRY%/video-platform-ffmpeg:%IMAGE_TAG% ./backend/ffmpeg_service'
      }
    }

    stage('Push Images') {
      steps {
        bat 'docker push %ECR_REGISTRY%/video-platform-frontend:%IMAGE_TAG%'
        bat 'docker push %ECR_REGISTRY%/video-platform-api:%IMAGE_TAG%'
        bat 'docker push %ECR_REGISTRY%/video-platform-ffmpeg:%IMAGE_TAG%'
      }
    }

    stage('Helm Lint') {
      steps {
        bat 'helm lint helm/video-platform'
      }
    }

    stage('Terraform Validate') {
      steps {
        dir('terraform/environments/prod') {
          bat 'terraform init -backend=false'
          bat 'terraform validate'
        }
      }
    }

    stage('Deploy') {
      steps {
        bat '''
        helm upgrade --install video-platform helm/video-platform ^
          --namespace video-platform ^
          --create-namespace ^
          -f helm/video-platform/values-prod.yaml ^
          --set image.frontend.tag=%IMAGE_TAG% ^
          --set image.api.tag=%IMAGE_TAG% ^
          --set image.ffmpeg.tag=%IMAGE_TAG%
        '''
      }
    }

    stage('Smoke Test') {
      steps {
        bat 'kubectl rollout status deployment/video-platform-api -n video-platform'
        bat 'kubectl rollout status deployment/video-platform-frontend -n video-platform'
      }
    }
  }
}
```

Adjust `bat` to `sh` if your Jenkins agent runs Linux.

## Phase 4: Jenkins Credentials

Create these Jenkins credentials:

```text
aws-access-key-id
aws-secret-access-key
kubeconfig-video-platform
docker-registry-credentials, only if not using ECR
```

Better production design:

```text
Jenkins runs on EC2 with an IAM role.
The EC2 role has ECR, Terraform, and Kubernetes deployment permissions.
No long-lived AWS access keys are stored in Jenkins.
```

## Phase 5: Terraform AWS Infrastructure

Terraform should create the cloud infrastructure, not the application pods.

Recommended Terraform resources:

```text
VPC
public subnet
security group
EC2 instance for Kubernetes
IAM role for EC2
ECR repositories
S3 bucket
CloudFront distribution
S3 bucket policy for CloudFront OAC
optional Route 53 records
optional ACM certificate
```

### Terraform Directory Structure

```text
terraform/
  environments/
    prod/
      main.tf
      variables.tf
      outputs.tf
      terraform.tfvars
  modules/
    ecr/
    ec2/
    s3/
    cloudfront/
    iam/
    vpc/
```

### ECR Module

Create ECR repos:

```text
video-platform-frontend
video-platform-api
video-platform-ffmpeg
```

Minimum Terraform:

```hcl
resource "aws_ecr_repository" "frontend" {
  name                 = "video-platform-frontend"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "api" {
  name                 = "video-platform-api"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "ffmpeg" {
  name                 = "video-platform-ffmpeg"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}
```

### S3 Module

Create an S3 bucket for videos:

```hcl
resource "aws_s3_bucket" "videos" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_public_access_block" "videos" {
  bucket = aws_s3_bucket.videos.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "videos" {
  bucket = aws_s3_bucket.videos.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "videos" {
  bucket = aws_s3_bucket.videos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
```

Add CORS for frontend uploads:

```hcl
resource "aws_s3_bucket_cors_configuration" "videos" {
  bucket = aws_s3_bucket.videos.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
```

### CloudFront Module

Use CloudFront OAC so S3 remains private:

```hcl
resource "aws_cloudfront_origin_access_control" "videos" {
  name                              = "video-platform-oac"
  description                       = "OAC for video platform S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}
```

Create a distribution pointing to S3:

```hcl
resource "aws_cloudfront_distribution" "videos" {
  enabled = true

  origin {
    domain_name              = var.bucket_regional_domain_name
    origin_id                = "video-s3-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.videos.id
  }

  default_cache_behavior {
    target_origin_id       = "video-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
```

Then allow CloudFront to read S3 objects:

```hcl
resource "aws_s3_bucket_policy" "allow_cloudfront" {
  bucket = var.bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${var.bucket_arn}/videos/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.videos.arn
          }
        }
      }
    ]
  })
}
```

### EC2 Module

Use EC2 to run Kubernetes. For a simple but strong project, install `k3s` on the EC2 instance.

Open security group ports:

```text
22      SSH, restrict to your IP
80      HTTP
443     HTTPS
30080   optional NodePort frontend
30081   optional NodePort API
7880    LiveKit TCP
7881    LiveKit TCP
50000-50100 UDP for LiveKit media
```

Production security should restrict SSH and avoid exposing internal service ports directly.

EC2 user data can install Docker, kubectl, Helm, and k3s:

```bash
#!/bin/bash
set -e

curl -sfL https://get.k3s.io | sh -
mkdir -p /home/ubuntu/.kube
cp /etc/rancher/k3s/k3s.yaml /home/ubuntu/.kube/config
chown -R ubuntu:ubuntu /home/ubuntu/.kube
```

## Phase 6: Kubernetes Design

Convert Docker Compose services into Kubernetes resources.

```text
frontend:
  Deployment
  Service

api:
  Deployment
  Service
  ConfigMap
  Secret

ffmpeg:
  Deployment
  ConfigMap
  Secret

postgres:
  StatefulSet + PVC
  or use AWS RDS

redis:
  Deployment/StatefulSet
  or use ElastiCache

kafka:
  StatefulSet
  or use AWS MSK

livekit:
  Deployment
  Service with TCP and UDP ports

livekit-egress:
  Deployment
```

For a first DevOps implementation, it is acceptable to run PostgreSQL, Redis, and Kafka inside Kubernetes. For a stronger production architecture, move PostgreSQL to RDS, Redis to ElastiCache, and Kafka to MSK or a managed Kafka service.

## Phase 7: Helm Chart

Create:

```text
helm/video-platform/Chart.yaml
helm/video-platform/values.yaml
helm/video-platform/values-dev.yaml
helm/video-platform/values-prod.yaml
helm/video-platform/templates/
```

### Chart.yaml

```yaml
apiVersion: v2
name: video-platform
description: Helm chart for the video streaming platform
type: application
version: 0.1.0
appVersion: "1.0.0"
```

### values.yaml

```yaml
image:
  frontend:
    repository: ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com/video-platform-frontend
    tag: latest
  api:
    repository: ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com/video-platform-api
    tag: latest
  ffmpeg:
    repository: ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com/video-platform-ffmpeg
    tag: latest

storage:
  backend: local
  mediaBaseUrl: http://localhost:8000/media
  s3Bucket: ""
  cloudfrontDomain: ""

aws:
  region: ap-south-1

api:
  replicas: 1
  port: 8000

frontend:
  replicas: 1
  port: 80

ffmpeg:
  replicas: 1

postgres:
  enabled: true
  database: video_platform
  username: postgres
  password: postgres

redis:
  enabled: true

kafka:
  enabled: true

livekit:
  enabled: true
```

### values-prod.yaml

```yaml
storage:
  backend: s3
  s3Bucket: your-video-bucket-name
  cloudfrontDomain: dxxxxxxxxxxxxx.cloudfront.net

api:
  replicas: 2

frontend:
  replicas: 2

ffmpeg:
  replicas: 1
```

## Phase 8: Kubernetes Config And Secrets

Use ConfigMap for non-secret values:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: video-platform-config
data:
  STORAGE_BACKEND: "{{ .Values.storage.backend }}"
  AWS_REGION: "{{ .Values.aws.region }}"
  S3_BUCKET: "{{ .Values.storage.s3Bucket }}"
  CLOUDFRONT_DOMAIN: "{{ .Values.storage.cloudfrontDomain }}"
  KAFKA_BOOTSTRAP_SERVERS: "video-platform-kafka:29092"
  REDIS_URL: "redis://video-platform-redis:6379/0"
```

Use Secret for sensitive values:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: video-platform-secret
type: Opaque
stringData:
  JWT_SECRET: "change-me"
  DATABASE_URL: "postgresql+asyncpg://postgres:postgres@video-platform-postgres:5432/video_platform"
  AWS_ACCESS_KEY_ID: ""
  AWS_SECRET_ACCESS_KEY: ""
  SMTP_PASSWORD: ""
  LIVEKIT_API_SECRET: ""
```

In production, prefer IAM roles over `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

## Phase 9: API Deployment Template

Example `api-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: video-platform-api
spec:
  replicas: {{ .Values.api.replicas }}
  selector:
    matchLabels:
      app: video-platform-api
  template:
    metadata:
      labels:
        app: video-platform-api
    spec:
      containers:
        - name: api
          image: "{{ .Values.image.api.repository }}:{{ .Values.image.api.tag }}"
          ports:
            - containerPort: 8000
          envFrom:
            - configMapRef:
                name: video-platform-config
            - secretRef:
                name: video-platform-secret
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 15
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 20
```

Example service:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: video-platform-api
spec:
  selector:
    app: video-platform-api
  ports:
    - port: 8000
      targetPort: 8000
```

## Phase 10: Frontend Deployment Template

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: video-platform-frontend
spec:
  replicas: {{ .Values.frontend.replicas }}
  selector:
    matchLabels:
      app: video-platform-frontend
  template:
    metadata:
      labels:
        app: video-platform-frontend
    spec:
      containers:
        - name: frontend
          image: "{{ .Values.image.frontend.repository }}:{{ .Values.image.frontend.tag }}"
          ports:
            - containerPort: 80
```

Service:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: video-platform-frontend
spec:
  selector:
    app: video-platform-frontend
  ports:
    - port: 80
      targetPort: 80
```

## Phase 11: FFmpeg Worker Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: video-platform-ffmpeg
spec:
  replicas: {{ .Values.ffmpeg.replicas }}
  selector:
    matchLabels:
      app: video-platform-ffmpeg
  template:
    metadata:
      labels:
        app: video-platform-ffmpeg
    spec:
      containers:
        - name: ffmpeg
          image: "{{ .Values.image.ffmpeg.repository }}:{{ .Values.image.ffmpeg.tag }}"
          envFrom:
            - configMapRef:
                name: video-platform-config
            - secretRef:
                name: video-platform-secret
```

## Phase 12: Ingress

Use NGINX ingress or Traefik.

Example:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: video-platform-ingress
spec:
  rules:
    - host: yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: video-platform-frontend
                port:
                  number: 80
    - host: api.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: video-platform-api
                port:
                  number: 8000
```

LiveKit needs special care because it uses TCP and UDP media ports. Expose LiveKit separately using NodePort, host networking, or a cloud load balancer that supports UDP.

## Phase 13: Production Environment Variables

For production, configure:

```env
STORAGE_BACKEND=s3
AWS_REGION=ap-south-1
S3_BUCKET=your-video-bucket-name
CLOUDFRONT_DOMAIN=dxxxxxxxxxxxxx.cloudfront.net

DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://...
KAFKA_BOOTSTRAP_SERVERS=...

JWT_SECRET=strong-secret
CORS_ORIGINS=https://yourdomain.com,https://api.yourdomain.com

LIVEKIT_URL=ws://livekit:7880
LIVEKIT_PUBLIC_URL=wss://live.yourdomain.com
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...

SMTP_HOST=...
SMTP_PORT=587
SMTP_USERNAME=...
SMTP_PASSWORD=...
EMAIL_FROM=...
```

## Phase 14: Deployment Flow

First-time infrastructure deployment:

```powershell
cd terraform/environments/prod
terraform init
terraform plan
terraform apply
```

Install Kubernetes tools on EC2:

```text
k3s
kubectl
helm
nginx ingress controller
```

First app deployment:

```powershell
helm upgrade --install video-platform helm/video-platform `
  --namespace video-platform `
  --create-namespace `
  -f helm/video-platform/values-prod.yaml
```

CI/CD deployment:

```text
Developer pushes code
Jenkins builds images
Jenkins pushes images to ECR
Jenkins runs helm upgrade
Kubernetes rolls out new pods
Jenkins checks rollout status
```

## Phase 15: Health Checks

Backend already has:

```text
GET /health
```

Use it for:

```text
Docker healthcheck
Kubernetes readinessProbe
Kubernetes livenessProbe
Jenkins smoke test
```

Also add smoke checks:

```text
frontend returns HTTP 200
backend /health returns HTTP 200
api can connect to database
api can connect to Redis
worker can connect to Kafka
S3 upload permissions work
CloudFront can serve HLS files
```

## Phase 16: Observability

Add these later for a stronger DevOps project:

```text
Prometheus
Grafana
Loki or ELK
Alertmanager
Kubernetes dashboard
```

Minimum logs to monitor:

```text
api logs
ffmpeg worker logs
kafka logs
postgres logs
livekit logs
nginx ingress logs
```

Useful commands:

```powershell
kubectl logs deployment/video-platform-api -n video-platform
kubectl logs deployment/video-platform-ffmpeg -n video-platform
kubectl get pods -n video-platform
kubectl describe pod POD_NAME -n video-platform
```

## Phase 17: Security Checklist

- Do not commit `.env` with real secrets.
- Rotate any credentials that were committed before.
- Use IAM roles when possible.
- Keep S3 public access blocked.
- Use CloudFront OAC.
- Use Kubernetes Secrets for sensitive values.
- Restrict SSH to your own IP.
- Use HTTPS for frontend and API.
- Use separate AWS resources for dev and prod.
- Use immutable Docker image tags.
- Enable ECR image scanning.

## Phase 18: Suggested Implementation Order

Implement in this order:

1. Clean secrets from the repo and update `.gitignore`.
2. Create Terraform ECR module.
3. Create Terraform S3 and CloudFront modules.
4. Create Terraform EC2 module.
5. Install k3s on EC2.
6. Create Helm chart skeleton.
7. Add frontend, api, and ffmpeg Helm deployments.
8. Add ConfigMap and Secret templates.
9. Add PostgreSQL, Redis, and Kafka Kubernetes manifests or Helm dependencies.
10. Add Jenkinsfile.
11. Configure Jenkins credentials.
12. Run Jenkins CI without deployment.
13. Push images to ECR.
14. Deploy manually with Helm.
15. Enable Jenkins deployment.
16. Add smoke tests.
17. Move production video storage to S3.
18. Add monitoring.

## Final Recommended Production Shape

```text
Code:
  Git repository

CI/CD:
  Jenkins

Images:
  AWS ECR

Infrastructure:
  Terraform

Compute:
  Kubernetes on EC2 or later EKS

Deployment:
  Helm

Video storage:
  S3

Video delivery:
  CloudFront

Database:
  RDS PostgreSQL preferred

Cache:
  ElastiCache Redis preferred

Messaging:
  Kafka in Kubernetes for learning
  MSK or managed Kafka for production
```

This design keeps your current local setup useful for development while making the production version cloud-ready, repeatable, and presentable as a serious DevOps project.
