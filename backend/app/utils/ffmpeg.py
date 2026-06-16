import subprocess
from app.utils.logger import logger


def generate_hls(input_path: str, output_dir: str):
    """
    Converts MP4 video into multi-resolution HLS.
    """
    logger.info("Starting FFmpeg HLS conversion")

    command = [
        "ffmpeg",
        "-i", input_path,
        "-filter_complex",
        "[0:v]split=3[v1][v2][v3];"
        "[v1]scale=640:360[v1out];"
        "[v2]scale=1280:720[v2out];"
        "[v3]scale=1920:1080[v3out]",
        "-map", "[v1out]", "-map", "a",
        "-map", "[v2out]", "-map", "a",
        "-map", "[v3out]", "-map", "a",
        "-f", "hls",
        "-hls_time", "6",
        "-hls_playlist_type", "vod",
        "-hls_flags", "independent_segments",
        "-master_pl_name", "master.m3u8",
        "-var_stream_map", "v:0,a:0 v:1,a:1 v:2,a:2",
        f"{output_dir}/v%v/playlist.m3u8"
    ]

    try:
        subprocess.run(command, check=True)
        logger.info("FFmpeg conversion completed")
    except subprocess.CalledProcessError as e:
        logger.error("FFmpeg failed")
        raise e
