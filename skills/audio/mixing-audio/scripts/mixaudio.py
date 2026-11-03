#!/usr/bin/env python3
"""Prepare speech audio with ffmpeg; never replace an existing output."""
import argparse
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys


def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "audio command failed")
    return result


def ffmpeg(args):
    return run(["ffmpeg", "-hide_banner", "-nostdin", "-n", *args])


def loudness(path, target=-16, preprocess=""):
    log = ffmpeg(["-i", str(path), "-af",
                  f"{preprocess}loudnorm=I={target}:TP=-1.5:LRA=11:print_format=json",
                  "-f", "null", "-"]).stderr
    return json.loads(re.findall(r"\{[^{}]*\}", log)[-1])


def measure(path):
    probe = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "a:0",
                           "-show_entries", "format=duration:stream=sample_rate,channels",
                           "-of", "json", str(path)]).stdout)
    if not probe["streams"]:
        raise RuntimeError(f"no audio stream: {path}")
    info = probe["streams"][0]
    stats = loudness(path)
    print(f"{path}: duration={float(probe['format']['duration']):.3f} s; "
          f"integrated={stats['input_i']} LUFS; "
          f"rate={info['sample_rate']} Hz; channels={info['channels']}; true_peak={stats['input_tp']} dBTP")
    return stats


def number(value):
    try:
        result = float(value)
    except ValueError:
        raise argparse.ArgumentTypeError("expected a finite number")
    if not math.isfinite(result):
        raise argparse.ArgumentTypeError("expected a finite number")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="command", required=True)
    for name in ("measure", "clean", "compress", "normalize", "trim", "stitch", "duck", "overlay"):
        sub = subs.add_parser(name)
        if name == "stitch":
            sub.add_argument("inputs", nargs="+")
            sub.add_argument("--gap", type=number, default=0.2, help="seconds between clips")
        else:
            sub.add_argument("input", help="voice/base audio for duck/overlay")
        if name in ("duck", "overlay"):
            sub.add_argument("extra", help="music for duck; sound effect for overlay")
        if name != "measure":
            sub.add_argument("-o", "--output", required=True, help="new WAV path")
            sub.add_argument("--rate", type=int, default=48000)
        if name == "normalize":
            sub.add_argument("--target-lufs", type=number, default=-16)
        if name == "trim":
            sub.add_argument("--start", type=number, default=0)
            sub.add_argument("--duration", type=number, required=True)
        if name == "overlay":
            sub.add_argument("--offset", type=number, default=0)
    args = parser.parse_args()
    inputs = [Path(p).resolve() for p in (args.inputs if args.command == "stitch" else [args.input])]
    if args.command in ("duck", "overlay"):
        inputs.append(Path(args.extra).resolve())
    for path in inputs:
        if not path.is_file():
            parser.error(f"input is not a file: {path}")
    if args.command != "measure":
        output = Path(args.output).absolute()
        if output.exists() or output.is_symlink():
            parser.error(f"refusing to overwrite existing output: {output}")
        if output.suffix.lower() != ".wav":
            parser.error("output must have a .wav extension")
        if not output.parent.is_dir():
            parser.error("output directory does not exist")
        if not 8000 <= args.rate <= 192000:
            parser.error("rate must be between 8000 and 192000 Hz")
    for key in ("start", "gap", "offset"):
        if getattr(args, key, 0) < 0:
            parser.error(f"{key} must be nonnegative")
    if args.command == "trim" and args.duration <= 0:
        parser.error("duration must be positive")
    if args.command == "normalize" and not -70 <= args.target_lufs <= -5:
        parser.error("target-lufs must be between -70 and -5")
    for binary in ("ffmpeg", "ffprobe"):
        if not shutil.which(binary):
            print(f"error: {binary} is missing; install ffmpeg with ffprobe", file=sys.stderr)
            return 1
    if args.command == "measure":
        measure(inputs[0])
        return 0
    command = []
    if args.command == "trim":
        command += ["-ss", str(args.start)]
    for path in inputs:
        command += ["-i", str(path)]
    filters = []
    if args.command == "clean":
        filters = ["-af", "highpass=f=80,afftdn=nr=6:nf=-50"]
    elif args.command == "compress":
        filters = ["-af", "acompressor=threshold=-24dB:ratio=3:attack=5:release=80:makeup=1"]
    elif args.command == "normalize":
        preprocess = f"aresample={args.rate},aformat=sample_fmts=fltp:channel_layouts=mono,"
        stats = loudness(inputs[0], args.target_lufs, preprocess)
        if not all(math.isfinite(float(stats[key])) for key in
                   ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")):
            raise RuntimeError("cannot normalize silence or unmeasurable loudness")
        filt = f"{preprocess}loudnorm=I={args.target_lufs}:TP=-1.5:LRA=11:linear=true"
        for field, key in (("measured_I", "input_i"), ("measured_TP", "input_tp"),
                           ("measured_LRA", "input_lra"), ("measured_thresh", "input_thresh"),
                           ("offset", "target_offset")):
            filt += f":{field}={stats[key]}"
        filters = ["-af", filt]
    elif args.command == "trim":
        command += ["-t", str(args.duration)]
    else:
        graph = [f"[{i}:a:0]aresample={args.rate},aformat=sample_fmts=fltp:channel_layouts=mono,"
                 f"asetpts=PTS-STARTPTS[a{i}]" for i in range(len(inputs))]
        if args.command == "stitch":
            labels = []
            for i in range(len(inputs)):
                labels.append(f"[a{i}]")
                if i < len(inputs) - 1 and args.gap > 0:
                    graph.append(f"anullsrc=r={args.rate}:cl=mono,atrim=duration={args.gap}[g{i}]")
                    labels.append(f"[g{i}]")
            graph.append("".join(labels) + f"concat=n={len(labels)}:v=0:a=1[out]")
        elif args.command == "duck":
            graph += ["[a0]asplit[voice][control]", "[a1]volume=0.2,apad[bed]",
                      "[bed][control]sidechaincompress=threshold=0.02:ratio=8:attack=10:release=250[ducked]",
                      "[voice][ducked]amix=inputs=2:duration=first:normalize=0[out]"]
        else:
            graph += [f"[a1]adelay={round(args.offset * 1000)}:all=1[effect]",
                      "[a0][effect]amix=inputs=2:duration=longest:normalize=0[out]"]
        filters = ["-filter_complex", ";".join(graph), "-map", "[out]"]
    ffmpeg([*command, *filters, "-vn", "-ac", "1", "-ar", str(args.rate),
            "-c:a", "pcm_s16le", str(output)])
    print(f"wrote {output}")
    result = measure(output)
    if args.command == "normalize" and abs(float(result["input_i"]) - args.target_lufs) > 1:
        print("warning: measured loudness misses target by more than 1 LU; compress first, then normalize",
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, OSError, ValueError, KeyError, IndexError) as error:
        print(f"error: {error}", file=sys.stderr)
        sys.exit(1)
