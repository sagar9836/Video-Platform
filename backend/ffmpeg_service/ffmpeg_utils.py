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


def _probe_duration_seconds(input_path):
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        input_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return None

    try:
        return float(result.stdout.strip())
    except (TypeError, ValueError):
        return None


# ---------------- THUMBNAIL ----------------
def generate_thumbnail(input_path, output_path):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    duration_seconds = _probe_duration_seconds(input_path)
    # Pick a frame from inside the actual upload instead of a hard-coded 1s mark.
    seek_seconds = 1.0
    if duration_seconds and duration_seconds > 0:
        seek_seconds = max(0.2, min(3.0, duration_seconds * 0.25))

    cmd = [
        "ffmpeg",
        "-y",
        "-ss", f"{seek_seconds:.2f}",
        "-i", input_path,
        "-frames:v", "1",
        "-q:v", "2",
        "-vf", "scale='min(1280,iw)':-2",
        output_path,
    ]

    run_cmd(cmd, "Thumbnail failed")


# ---------------- HLS ----------------
def transcode_to_hls(input_path, output_dir, video_id):
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
        "-hls_segment_filename", f"{output_dir}/{video_id}_segment_%03d.ts",
        f"{output_dir}/master.m3u8",
    ]

    run_cmd(cmd, "HLS failed")
