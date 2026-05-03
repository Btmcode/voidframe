#!/usr/bin/env python3
"""
VOIDFRAME Python Worker
- Scores clips using ffprobe
- Generates FFmpeg filelist.txt preserving scene order
"""

import sys
import os
import json
import argparse
import subprocess
from pathlib import Path


def get_video_info(clip_path: str) -> dict:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_streams", "-show_format", clip_path],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            duration = float(data.get("format", {}).get("duration", 0))
            size = int(data.get("format", {}).get("size", 0))
            # Get video stream info
            video_streams = [s for s in data.get("streams", []) if s.get("codec_type") == "video"]
            width = int(video_streams[0].get("width", 0)) if video_streams else 0
            height = int(video_streams[0].get("height", 0)) if video_streams else 0
            return {
                "duration": duration,
                "size": size,
                "width": width,
                "height": height,
                "valid": duration > 0.5 and size > 1000
            }
    except Exception as e:
        print(f"[worker] ffprobe error for {clip_path}: {e}", file=sys.stderr)

    # Fallback: file stats only
    try:
        size = os.path.getsize(clip_path)
        return {"duration": 4.0, "size": size, "width": 0, "height": 0, "valid": size > 1000}
    except Exception:
        return {"duration": 0, "size": 0, "width": 0, "height": 0, "valid": False}


def score_clip(info: dict) -> float:
    score = 0.0
    # Prefer clips 3-10s long
    d = min(info["duration"], 10.0)
    score += d * 10
    # Reward file size (quality proxy)
    score += min(info["size"] / (1024 * 1024) * 5, 30)
    # Reward resolution
    if info["width"] >= 1280:
        score += 10
    elif info["width"] >= 720:
        score += 5
    # Penalize very short clips
    if info["duration"] < 1.0:
        score -= 40
    return score


def process_clips(clips: list, render_dir: str) -> str:
    print(f"[worker] Processing {len(clips)} clips in {render_dir}")

    valid_clips = []
    for clip in clips:
        if not os.path.exists(clip):
            print(f"[worker] SKIP (not found): {clip}", file=sys.stderr)
            continue
        info = get_video_info(clip)
        score = score_clip(info)
        print(f"[worker] {Path(clip).name}: dur={info['duration']:.1f}s "
              f"size={info['size']}B score={score:.1f} valid={info['valid']}")
        # Include even invalid clips so we have something
        valid_clips.append((clip, score, info))

    if not valid_clips:
        print("[worker] ERROR: No clips found", file=sys.stderr)
        sys.exit(1)

    # Keep original scene order (narrative continuity)
    ordered = sorted(valid_clips, key=lambda x: clips.index(x[0]))

    filelist_path = os.path.join(render_dir, "filelist.txt")
    with open(filelist_path, "w") as f:
        for clip_path, score, info in ordered:
            f.write(f"file '{clip_path}'\n")
            print(f"[worker] + {Path(clip_path).name} (score={score:.1f})")

    total_dur = sum(i["duration"] for _, _, i in ordered)
    print(f"[worker] ✅ filelist.txt: {len(ordered)} clips, ~{total_dur:.1f}s total")
    return filelist_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--clips", required=True, help="JSON array of clip paths")
    parser.add_argument("--dir", required=True, help="Render directory")
    args = parser.parse_args()

    try:
        clips = json.loads(args.clips)
    except json.JSONDecodeError as e:
        print(f"[worker] Invalid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    if not clips:
        print("[worker] No clips provided", file=sys.stderr)
        sys.exit(1)

    result = process_clips(clips, args.dir)
    print(f"[worker] Output: {result}")


if __name__ == "__main__":
    main()
