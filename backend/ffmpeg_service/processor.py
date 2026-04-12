import os
import tempfile
import asyncio
import logging

from models import VideoStatus
from ffmpeg_utils import generate_thumbnail, transcode_to_hls
from s3_utils import download_from_s3, upload_hls_to_s3, upload_thumbnail_to_s3

logger = logging.getLogger("processor")


async def process_video_pipeline(video_id, s3_key):
    logger.info(f"🎬 Processing pipeline start: {video_id}")

    with tempfile.TemporaryDirectory() as tmp:
        input_path = f"{tmp}/input.mp4"
        hls_dir = f"{tmp}/hls"
        thumb = f"{tmp}/thumb.jpg"

        # DOWNLOAD
        await asyncio.to_thread(download_from_s3, s3_key, input_path)

        if not os.path.exists(input_path):
            raise RuntimeError("File not downloaded")

        # THUMBNAIL
        await asyncio.to_thread(generate_thumbnail, input_path, thumb)
        thumbnail_key = await asyncio.to_thread(
            upload_thumbnail_to_s3, video_id, thumb
        )

        # TRANSCODE
        await asyncio.to_thread(transcode_to_hls, input_path, hls_dir)

        # UPLOAD
        await asyncio.to_thread(upload_hls_to_s3, video_id, hls_dir)

    logger.info(f"✅ Processing pipeline done: {video_id}")

    return thumbnail_key