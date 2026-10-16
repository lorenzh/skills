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
    text_group.add_argument("--text")
    text_group.add_argument("--text-file", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--language", default="en", help="Language code; non-English disables normalization, not a voice selector")
    args = parser.parse_args(argv)
    try:
        text = args.text_file.read_text(encoding="utf-8") if args.text_file else args.text
        if not text.strip():
            parser.error("Text must not be empty.")
        if not args.reference.is_file():
            parser.error("Reference audio must be an existing file.")
        if args.out.suffix.lower() != ".wav":
            parser.error("Output must have a .wav extension.")
        if args.out.exists():
            parser.error("Output already exists; choose a new path.")
        with tempfile.TemporaryDirectory(prefix="kitten-reference-") as scratch:
            reference = Path(scratch) / "reference.wav"
            prepare_reference(args.reference, reference)
            try:
                from kittenml import KittenTTS
                import soundfile
            except ImportError as error:
                raise RuntimeError("Missing runtime package. Install with: python3 -m pip install kittenml soundfile") from error
            model = KittenTTS("KittenML/kitten-tts-2")
            audio = model.generate(text, reference=str(reference), normalize=args.language.lower() in ("en", "english"))
            # Exclusive creation prevents overwriting a file created during inference.
            with args.out.open("xb") as output:
                soundfile.write(output, audio, model.sample_rate, format="WAV")
        print(f"Wrote {args.out} ({model.sample_rate} Hz)")
        return 0
    except subprocess.CalledProcessError as error:
        print(f"ffmpeg failed: {error.stderr.strip()}", file=sys.stderr)
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
