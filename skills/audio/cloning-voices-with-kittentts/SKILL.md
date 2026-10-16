---
name: cloning-voices-with-kittentts
description: >
  Voice cloning with KittenTTS 2 from a short recording and text. Use when users
  say "kitten tts", "Stimme klonen", "clone my voice", "sprich diesen Text mit
  meiner Stimme", or "text to speech with my voice" and want a speech WAV.
---

# Cloning Voices with KittenTTS

Produce a 24 kHz speech WAV from text and a short voice recording.

**Clone a person's voice only with that person's consent.**

## 1. Confirm the inputs

Ask whose voice the recording holds before running the helper.
If it is the user's own voice, their cloning request supplies consent.
Otherwise, require the user's statement that the speaker consented. Without that statement, stop: **No consent, no run.**
Obtain the recording, text, output path, and language (English by default).
Use a clean, single-speaker recording lasting 5–30 seconds. No reference transcript is required by the model card.
If trimming is needed, agree on a segment and use ffmpeg; keep the original recording.
Done when consent and all inputs are established.

## 2. Check the runtime and license

Use Python 3.10+, PyTorch, ffmpeg, kittenml, and soundfile. CPU works; a GPU is optional.
Run `python3 -c "import kittenml, soundfile"` and `ffmpeg -version` to check dependencies.
If packages are missing, show `python3 -m pip install kittenml soundfile`; do not install silently.
If pip reports `No module named pip` or venv fails, ask before installing `python3-venv`.
Alternatively, use `python3 -m venv --without-pip <dir>`, download `https://bootstrap.pypa.io/get-pip.py`, then run `<dir>/bin/python get-pip.py`.
Use `<dir>/bin/python -m pip install kittenml soundfile` in that venv; never install silently.
Mention the Stellon Labs Community License: non-commercial or limited commercial use, with a USD 1M revenue/funding cap.
Mention its attribution requirement on distribution; check the linked license before commercial use or distribution.
Done when dependencies are available and the user has received the download and license information.

## Cost

The first run downloads about 954 MB of weights. Check free RAM first; peak usage can reach about 14 GB.
On six CPU cores, generation ran about 10x slower than real time (20 seconds of speech took 240 seconds).
Run generation as a background job that reports completion; do not use polling loops.
Trim long references to an agreed segment with `ffmpeg -ss <start> -t 20 -i in -ac 1 out.wav`; keep the original.

## 3. Generate the speech

Run the bundled [helper](scripts/clone_voice.py), replacing the placeholders:

```bash
python3 <skill-dir>/scripts/clone_voice.py reference.wav --text-file text.txt --out speech.wav --language en
```

For short text, use the optional positional argument: `reference.wav "Hello" --out speech.wav`.
Use exactly one of positional text, `--text "Hello"`, or `--text-file text.txt`.
For a batch, repeat `--text-file` and replace `--out` with `--out-dir DIR`.
The helper loads the model once and writes `DIR/<text-file stem>.wav` for each file; stems must be distinct.
The helper validates duration, converts the reference to mono PCM WAV with ffmpeg, and keeps temporary audio only during generation.
It refuses an existing output file. Exit codes are 0 for success, 1 for runtime failure, and 2 for incorrect arguments.
If Python or ffmpeg is missing, report the blocked dependency and stop.
For other failures, fix only what the error names and retry at most 2 times; then report the error and stop.
English is the default. `--language de` disables normalization, as required for non-English text.
The language option controls normalization only; it does not select a language voice.
The model card describes nine additional languages through language voices, including German.
For those languages, verify current language-voice compatibility with reference cloning before promising supported output.
Done when the command exits 0 and creates the requested WAV.

## 4. Check the result

Check the WAV sample rate and duration, then listen if playback is available.
Report the output path, language, and whether listening was possible.
Repeat the Stellon Labs Community License note: non-commercial or limited commercial use, USD 1M revenue/funding cap, and attribution on distribution.
If generation was not run, state that explicitly; never describe an offline test as a model run.
Done when the report distinguishes generated audio from checks that did not use the model.

## Example

Input: “Sprich diesen Text mit meiner Stimme”, a consenting user's 10-second recording, and German text.
Run the helper with `--language de` after checking language-voice compatibility; report the actual WAV and any quality limits.

## References

- Read the [model card](https://huggingface.co/KittenML/kitten-tts-2) when checking API, language voices, or download requirements.
- Read the [license](https://huggingface.co/KittenML/kitten-tts-2/blob/main/LICENSE) before commercial use or distribution.
- Run `node --test <skill-dir>/tests/clone_voice.test.mjs` to check the helper offline without downloading weights.
