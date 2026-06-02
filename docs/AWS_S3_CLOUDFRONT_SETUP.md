# AWS S3 And CloudFront Setup

This project currently supports two video storage modes:

- `local`: stores video files under `backend/media` and serves them from `/media`.
- `s3`: stores raw uploads, processed HLS files, and thumbnails in Amazon S3, then serves public playback URLs through CloudFront when `CLOUDFRONT_DOMAIN` is configured.

Use this guide when you want cloud storage instead of the local `backend/media` setup.

## What The Project Stores

The backend and FFmpeg worker use these object keys:

```text
videos/raw/{creator_id}/{video_uuid}/original.mp4
videos/hls/{video_id}/master.m3u8
videos/hls/{video_id}/*.ts
videos/thumbnails/{video_id}/thumbnail.jpg
```

The API creates upload sessions, verifies objects, checks playback readiness, and deletes video assets. The FFmpeg worker downloads the raw video, creates HLS output and thumbnails, then uploads the processed assets.

## AWS Resources You Need

Create or prepare these AWS resources:

- An S3 bucket for video assets.
- A CloudFront distribution in front of that S3 bucket.
- An IAM user or IAM role for the backend and FFmpeg worker.
- Optional but recommended: a CloudFront key pair or key group if you later want signed playback URLs.
- AWS credentials available to the Docker services through `.env`, ECS task role, EC2 instance role, or another secure credential provider.

## Environment Variables

Set these values in the project root `.env` file or in your deployment environment:

```env
STORAGE_BACKEND=s3
AWS_REGION=ap-south-1
S3_BUCKET=your-video-bucket-name
CLOUDFRONT_DOMAIN=dxxxxxxxxxxxxx.cloudfront.net

AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
# AWS_SESSION_TOKEN=only-if-using-temporary-credentials

# Optional. Needed only if you wire signed CloudFront URLs into playback.
CLOUDFRONT_KEY_PAIR_ID=your-cloudfront-key-pair-id
CLOUDFRONT_PRIVATE_KEY_PATH=/app/keys/cloudfront_rsa.pem
```

For local Docker Compose, `docker-compose.yml` already passes `STORAGE_BACKEND` to both `api` and `ffmpeg` services:

```yaml
STORAGE_BACKEND: ${STORAGE_BACKEND:-local}
```

When `.env` contains `STORAGE_BACKEND=s3`, both services switch to S3 mode.

## S3 Bucket Setup

Create a bucket, for example:

```text
your-video-bucket-name
```

Recommended bucket settings:

- Block all public access: `On`
- Object ownership: `Bucket owner enforced`
- Versioning: optional
- Default encryption: `SSE-S3` or `SSE-KMS`
- CORS: required for browser presigned uploads

### S3 CORS

The frontend uploads directly to presigned S3 URLs in the presigned upload flow. Add this CORS config to the bucket:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://your-frontend-domain.com"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

For production, replace localhost with your actual frontend domain.

## IAM Permissions

The backend and FFmpeg worker need to upload, download, verify, list, and delete objects. Attach a policy like this to the IAM user/role used by the services:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VideoObjectReadWriteDelete",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-video-bucket-name/videos/*"
    },
    {
      "Sid": "VideoObjectList",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::your-video-bucket-name",
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "videos/*"
          ]
        }
      }
    }
  ]
}
```

If the bucket uses SSE-KMS, also grant the role access to the KMS key:

```json
{
  "Effect": "Allow",
  "Action": [
    "kms:Encrypt",
    "kms:Decrypt",
    "kms:GenerateDataKey"
  ],
  "Resource": "arn:aws:kms:REGION:ACCOUNT_ID:key/YOUR_KEY_ID"
}
```

## CloudFront Setup

Create a CloudFront distribution with the S3 bucket as the origin.

Recommended setup:

- Origin type: S3 bucket
- Origin access: Origin Access Control, also called OAC
- Viewer protocol policy: Redirect HTTP to HTTPS
- Allowed methods: `GET`, `HEAD`
- Cache policy:
  - For `.ts` files, long caching is okay.
  - For `.m3u8` playlists and thumbnails, use shorter caching or invalidate after updates.
- Alternate domain name: optional custom domain, for example `cdn.example.com`
- TLS certificate: ACM certificate in `us-east-1` if using a custom CloudFront domain

The project builds playback URLs as:

```text
https://{CLOUDFRONT_DOMAIN}/videos/hls/{video_id}/master.m3u8
https://{CLOUDFRONT_DOMAIN}/videos/thumbnails/{video_id}/thumbnail.jpg
```

If `CLOUDFRONT_DOMAIN` is empty, S3 mode will not produce a public playback URL from `build_public_asset_url`.

## S3 Bucket Policy For CloudFront OAC

After creating the distribution with OAC, allow CloudFront to read from the bucket. Replace the placeholders:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipalReadOnly",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-video-bucket-name/videos/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
        }
      }
    }
  ]
}
```

Keep public bucket access blocked. CloudFront should be the public read path.

## Project Files That Already Support S3

These files already contain the S3/local switch:

- `backend/app/core/config.py`
- `backend/app/services/storage.py`
- `backend/app/routes/videos.py`
- `backend/app/services/video_assets.py`
- `backend/app/utils/s3.py`
- `backend/app/utils/aws.py`
- `backend/ffmpeg_service/config.py`
- `backend/ffmpeg_service/s3_utils.py`
- `docker-compose.yml`

You usually do not need code changes for basic S3 storage. You mainly need correct AWS resources and environment variables.

## Docker Compose Update

For local Compose testing, set this in `.env`:

```env
STORAGE_BACKEND=s3
AWS_REGION=ap-south-1
S3_BUCKET=your-video-bucket-name
CLOUDFRONT_DOMAIN=dxxxxxxxxxxxxx.cloudfront.net
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

Then rebuild and start:

```powershell
docker compose up --build
```

The local media volume can remain in `docker-compose.yml`. It is ignored for video storage when `STORAGE_BACKEND=s3`, though the worker may still use temporary local files during processing.

## Verification Checklist

1. Start the stack.
2. Log in as a creator.
3. Upload a video.
4. Confirm the raw object appears in S3:

```text
videos/raw/{creator_id}/{video_uuid}/original.mp4
```

5. Wait for the FFmpeg worker to process the upload.
6. Confirm these objects appear:

```text
videos/hls/{video_id}/master.m3u8
videos/hls/{video_id}/*.ts
videos/thumbnails/{video_id}/thumbnail.jpg
```

7. Open the video playback API:

```text
GET http://localhost:8000/videos/{video_id}/play
```

8. Confirm the response contains CloudFront URLs.
9. Open the HLS URL in the browser or video player and confirm CloudFront returns the file.

## Common Problems

### Upload URL Works But Browser Upload Fails

Check the S3 CORS config. The frontend origin must be listed in `AllowedOrigins`, and `PUT` must be allowed.

### Processing Fails After Upload

The FFmpeg worker probably cannot read from S3. Check `s3:GetObject`, `AWS_REGION`, `S3_BUCKET`, and worker logs.

### Playback Returns No URL

Set `CLOUDFRONT_DOMAIN`. In S3 mode, the project uses CloudFront to build public asset URLs.

### Playback URL Returns 403

Check the CloudFront OAC bucket policy and confirm the `ACCOUNT_ID`, `DISTRIBUTION_ID`, bucket name, and object prefix are correct.

### Delete Video Does Not Remove S3 Objects

Check `s3:ListBucket` and `s3:DeleteObject` permissions. The delete flow lists `videos/hls/{video_id}/` and deletes raw, thumbnail, and HLS objects.

## Security Notes

- Do not commit real AWS keys, SMTP passwords, JWT secrets, or private keys.
- Prefer IAM roles over long-lived access keys in production.
- Keep S3 public access blocked.
- Use CloudFront OAC instead of public S3 objects.
- Rotate any credentials that were ever committed or shared.
- Use a separate bucket, IAM role, and CloudFront distribution per environment when possible.

## Optional Signed CloudFront URLs

The project has a helper in `backend/app/utils/cloudfront.py` for signed CloudFront URLs, but the current video playback path uses `build_public_asset_url`, which returns a normal CloudFront URL.

If you want private paid/subscriber-only video delivery at the CDN level, you need to wire signed URL generation into the playback route and configure CloudFront trusted key groups or trusted signers. Until that is implemented, access control is handled by the API routes, while the returned CloudFront asset URL itself is public to anyone who has it.
