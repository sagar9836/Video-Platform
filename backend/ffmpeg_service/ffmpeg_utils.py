# ffmpeg_service/ffmpeg_utils.py

import os
import subprocess
from fractions import Fraction


def run_cmd(cmd, error_msg):
    print("\n🚀 Running FFmpeg:")
    print(" ".join(cmd))

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(result.stderr)
        raise RuntimeError(error_msg)

    print("✅ FFmpeg success")
    if result.stderr:
        print(result.stderr)


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


def _probe_video_fps(input_path):
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=avg_frame_rate,r_frame_rate",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        input_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return 30.0

    for raw_value in result.stdout.splitlines():
        value = raw_value.strip()
        if not value or value in {"0/0", "N/A"}:
            continue
        try:
            fps = float(Fraction(value))
            if fps > 0:
                return min(fps, 60.0)
        except (ValueError, ZeroDivisionError):
            continue

    return 30.0


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
    segment_time = 6
    fps = _probe_video_fps(input_path)
    keyframe_interval = max(48, int(round(fps * segment_time)))

    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-map", "0:v:0",
        "-map", "0:a:0?",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-profile:v", "main",
        "-movflags", "+faststart",
        "-g", str(keyframe_interval),
        "-keyint_min", str(keyframe_interval),
        "-sc_threshold", "0",
        "-c:a", "aac",
        "-b:a", "128k",
        "-ar", "48000",
        "-ac", "2",
        "-force_key_frames", f"expr:gte(t,n_forced*{segment_time})",
        "-f", "hls",
        "-hls_time", str(segment_time),
        "-hls_playlist_type", "vod",
        "-hls_flags", "independent_segments",
        "-hls_list_size", "0",
        "-start_number", "0",
        "-hls_segment_filename", f"{output_dir}/{video_id}_segment_%03d.ts",
        f"{output_dir}/master.m3u8",
    ]

    run_cmd(cmd, "HLS failed")
