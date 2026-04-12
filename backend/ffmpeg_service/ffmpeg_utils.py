import os
import subprocess

HLS_SEGMENT_SECONDS = "10"


def _probe_stream_presence(input_path: str, stream_selector: str) -> bool:
    probe_cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        stream_selector,
        "-show_entries",
        "stream=index",
        "-of",
        "csv=p=0",
        input_path,
    ]

    result = subprocess.run(
        probe_cmd,
        check=False,
        capture_output=True,
        text=True,
    )
    return bool(result.stdout.strip())


def _input_has_audio(input_path: str) -> bool:
    return _probe_stream_presence(input_path, "a:0")


def _input_has_video(input_path: str) -> bool:
    return _probe_stream_presence(input_path, "v:0")


def _run_ffmpeg_command(cmd: list[str], fallback_error: str) -> None:
    result = subprocess.run(
        cmd,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        raise RuntimeError(stderr or fallback_error)


def generate_thumbnail(input_path: str, output_path: str) -> None:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    has_video = _input_has_video(input_path)
    if has_video:
        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            "00:00:01",
            "-i",
            input_path,
            "-frames:v",
            "1",
            "-vf",
            "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black",
            "-q:v",
            "2",
            output_path,
        ]
    else:
        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=1280x720",
            "-frames:v",
            "1",
            output_path,
        ]

    _run_ffmpeg_command(cmd, "ffmpeg thumbnail generation failed")


def transcode_to_hls(input_path: str, output_dir: str):
    os.makedirs(output_dir, exist_ok=True)

    has_audio = _input_has_audio(input_path)
    has_video = _input_has_video(input_path)

    if not has_audio and not has_video:
        raise ValueError("Uploaded media does not contain any playable audio or video streams.")

    cmd = [
        "ffmpeg",
        "-y",
    ]

    if has_video:
        cmd.extend(
            [
                "-i",
                input_path,
                "-filter_complex",
                (
                    "[0:v]split=4[v1][v2][v3][v4];"
                    "[v1]scale=w=426:h=240:force_original_aspect_ratio=decrease,"
                    "pad=426:240:(ow-iw)/2:(oh-ih)/2:black[v1out];"
                    "[v2]scale=w=640:h=360:force_original_aspect_ratio=decrease,"
                    "pad=640:360:(ow-iw)/2:(oh-ih)/2:black[v2out];"
                    "[v3]scale=w=854:h=480:force_original_aspect_ratio=decrease,"
                    "pad=854:480:(ow-iw)/2:(oh-ih)/2:black[v3out];"
                    "[v4]scale=w=1280:h=720:force_original_aspect_ratio=decrease,"
                    "pad=1280:720:(ow-iw)/2:(oh-ih)/2:black[v4out]"
                ),
                "-map",
                "[v1out]",
                "-map",
                "[v2out]",
                "-map",
                "[v3out]",
                "-map",
                "[v4out]",
            ]
        )
    else:
        cmd.extend(
            [
                "-f",
                "lavfi",
                "-i",
                "color=c=black:s=1280x720:r=30",
                "-i",
                input_path,
                "-filter_complex",
                (
                    "[0:v]split=4[v1][v2][v3][v4];"
                    "[v1]scale=w=426:h=240[v1out];"
                    "[v2]scale=w=640:h=360[v2out];"
                    "[v3]scale=w=854:h=480[v3out];"
                    "[v4]scale=w=1280:h=720[v4out]"
                ),
                "-map",
                "[v1out]",
                "-map",
                "[v2out]",
                "-map",
                "[v3out]",
                "-map",
                "[v4out]",
                "-shortest",
            ]
        )

    cmd.extend(
        [
        "-c:v:0",
        "libx264",
        "-b:v:0",
        "400k",
        "-c:v:1",
        "libx264",
        "-b:v:1",
        "800k",
        "-c:v:2",
        "libx264",
        "-b:v:2",
        "1400k",
        "-c:v:3",
        "libx264",
        "-b:v:3",
        "2800k",
        ]
    )

    if has_audio:
        audio_input_index = 0 if has_video else 1
        cmd.extend(
            [
                "-map",
                f"{audio_input_index}:a:0?",
                "-map",
                f"{audio_input_index}:a:0?",
                "-map",
                f"{audio_input_index}:a:0?",
                "-map",
                f"{audio_input_index}:a:0?",
                "-c:a:0",
                "aac",
                "-b:a:0",
                "96k",
                "-c:a:1",
                "aac",
                "-b:a:1",
                "96k",
                "-c:a:2",
                "aac",
                "-b:a:2",
                "128k",
                "-c:a:3",
                "aac",
                "-b:a:3",
                "128k",
            ]
        )

    cmd.extend(
        [
            "-preset",
            "veryfast",
            "-g",
            "48",
            "-sc_threshold",
            "0",
            "-f",
            "hls",
            "-hls_time",
            HLS_SEGMENT_SECONDS,
            "-hls_playlist_type",
            "vod",
            "-hls_flags",
            "independent_segments",
            "-hls_segment_filename",
            f"{output_dir}/v%v_%03d.ts",
            "-master_pl_name",
            "master.m3u8",
            "-var_stream_map",
            (
                "v:0,a:0 v:1,a:1 v:2,a:2 v:3,a:3"
                if has_audio
                else "v:0 v:1 v:2 v:3"
            ),
            f"{output_dir}/v%v.m3u8",
        ]
    )

    _run_ffmpeg_command(cmd, "ffmpeg transcoding failed")
