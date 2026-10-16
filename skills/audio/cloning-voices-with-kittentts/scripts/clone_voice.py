#!/usr/bin/env python3
"""Generate speech using a consenting speaker's reference recording."""
import argparse
from pathlib import Path
import subprocess
import sys
import tempfile
import wave


def prepare_reference(source, destination):
    subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(source),
         "-map", "0:a:0", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(destination)],
        check=True, capture_output=True, text=True,
    )
    with wave.open(str(destination), "rb") as audio:
        duration = audio.getnframes() / audio.getframerate()
    if not 5 <= duration <= 30:
        raise ValueError(f"Reference must last 5–30 seconds; got {duration:.3f} seconds.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    text_group = parser.add_mutually_exclusive_group(required=True)
    text_group.add_argument("positional_text", nargs="?")
    text_group.add_argument("--text")
    text_group.add_argument("--text-file", type=Path, action="append")
    outputs = parser.add_mutually_exclusive_group(required=True)
    outputs.add_argument("--out", type=Path)
    outputs.add_argument("--out-dir", type=Path)
    parser.add_argument("--language", default="en", help="Language code; non-English disables normalization, not a voice selector")
    transcript = parser.add_mutually_exclusive_group()
    transcript.add_argument("--reference-text")
    transcript.add_argument("--reference-text-file", type=Path)
    args = parser.parse_args(argv)
    try:
        reference_text = (args.reference_text_file.read_text(encoding="utf-8")
                          if args.reference_text_file else args.reference_text)
        if reference_text is not None and not reference_text.strip():
            parser.error("Reference text must not be empty.")
        if args.out_dir:
            if not args.text_file:
                parser.error("--out-dir requires --text-file.")
            jobs = [(file.read_text(encoding="utf-8"), args.out_dir / (file.stem + ".wav"))
                    for file in args.text_file]
        else:
            if args.text_file and len(args.text_file) != 1:
                parser.error("Repeated --text-file requires --out-dir.")
            text = args.text_file[0].read_text(encoding="utf-8") if args.text_file else (args.text if args.text is not None else args.positional_text)
            jobs = [(text, args.out)]
        if not args.reference.is_file():
            parser.error("Reference audio must be an existing file.")
        if len({output.resolve() for _, output in jobs}) != len(jobs):
            parser.error("Text files must have distinct output stems.")
        for text, output in jobs:
            if not text.strip():
                parser.error("Text must not be empty.")
            if output.suffix.lower() != ".wav":
                parser.error("Output must have a .wav extension.")
            if output.exists():
                parser.error("Output already exists; choose a new path.")
        if args.out_dir:
            args.out_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="kitten-reference-") as scratch:
            reference = Path(scratch) / "reference.wav"
            prepare_reference(args.reference, reference)
            try:
                from kittenml import KittenTTS
                import soundfile
            except ImportError as error:
                raise RuntimeError("Missing runtime package. Install with: python3 -m pip install kittenml soundfile. "
                    "If you see No module named pip or venv fails: Ask the user before installing python3-venv, "
                    "or run python3 -m venv --without-pip <dir>, then download https://bootstrap.pypa.io/get-pip.py "
                    "and run <dir>/bin/python get-pip.py inside that venv. Never install silently.") from error
            model = KittenTTS("KittenML/kitten-tts-2")
            for text, destination in jobs:
                audio = model.generate(text, reference=str(reference), reference_text=reference_text, normalize=args.language.lower() in ("en", "english"))
                # Exclusive creation prevents overwriting a file created during inference.
                with destination.open("xb") as output:
                    soundfile.write(output, audio, model.sample_rate, format="WAV")
                print(f"Wrote {destination} ({model.sample_rate} Hz)")
        return 0
    except subprocess.CalledProcessError as error:
        print(f"ffmpeg failed: {error.stderr.strip()}", file=sys.stderr)
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
