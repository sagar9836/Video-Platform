# ffmpeg_service/ffmpeg_utils.py

import os
import subprocess


def run_cmd(cmd, error_msg):
    print("\n🚀 Running FFmpeg:")
    print(" ".join(cmd))

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(result.stderr)
        raise RuntimeError(error_msg)

    print("✅ FFmpeg success")


# ---------------- THUMBNAIL ----------------
def generate_thumbnail(input_path, output_path):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    cmd = [
        "ffmpeg",
        "-y",
        "-ss", "00:00:01",
        "-i", input_path,
        "-frames:v", "1",
        "-q:v", "2",
        output_path,
    ]

    run_cmd(cmd, "Thumbnail failed")


# ---------------- HLS ----------------
def transcode_to_hls(input_path, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-preset", "veryfast",
        "-g", "48",
        "-sc_threshold", "0",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-f", "hls",
        "-hls_time", "6",
        "-hls_playlist_type", "vod",
        "-hls_segment_filename", f"{output_dir}/segment_%03d.ts",
        f"{output_dir}/master.m3u8",
    ]

    run_cmd(cmd, "HLS failed")