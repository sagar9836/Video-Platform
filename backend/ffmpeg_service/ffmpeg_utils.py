import os
import subprocess

HLS_SEGMENT_SECONDS = "10"


def run_cmd(cmd: list[str], error_msg: str):
    print("\n🚀 Running FFmpeg Command:")
    print(" ".join(cmd))

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print("\n❌ FFmpeg ERROR:")
        print(result.stderr)
        raise RuntimeError(result.stderr or error_msg)

    print("\n✅ FFmpeg SUCCESS")


# --------------------------
# 🎬 THUMBNAIL GENERATION
# --------------------------
def generate_thumbnail(input_path: str, output_path: str):
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

    run_cmd(cmd, "Thumbnail generation failed")


# --------------------------
# 🎥 SIMPLE + STABLE HLS
# --------------------------
def transcode_to_hls(input_path: str, output_dir: str):
    os.makedirs(output_dir, exist_ok=True)

    output_file = os.path.join(output_dir, "index.m3u8")

    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,

        # 🔥 FAST + SAFE (no re-encoding)
        "-c", "copy",

        "-start_number", "0",
        "-hls_time", HLS_SEGMENT_SECONDS,
        "-hls_list_size", "0",
        "-f", "hls",

        output_file,
    ]

    run_cmd(cmd, "HLS conversion failed")