import os
import subprocess


def _input_has_audio(input_path: str) -> bool:
    probe_cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a:0",
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


def transcode_to_hls(input_path: str, output_dir: str):
    os.makedirs(output_dir, exist_ok=True)

    has_audio = _input_has_audio(input_path)

    cmd = [
        "ffmpeg",
        "-y",
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

    if has_audio:
        cmd.extend(
            [
                "-map",
                "0:a:0?",
                "-map",
                "0:a:0?",
                "-map",
                "0:a:0?",
                "-map",
                "0:a:0?",
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
            "-f",
            "hls",
            "-hls_time",
            "6",
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

    subprocess.run(cmd, check=True)
