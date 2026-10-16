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

Establish the speaker's consent before generation; a request to clone the user's own voice supplies that consent.
If consent for another speaker is unclear, ask before generation.
Obtain the recording, text, output path, and language (English by default).
Use a clean, single-speaker recording lasting 5–30 seconds. No reference transcript is required by the model card.
If trimming is needed, agree on a segment and use ffmpeg; keep the original recording.
Done when consent and all inputs are established.

## 2. Check the runtime and license

Use Python 3.10+, PyTorch, ffmpeg, kittenml, and soundfile. CPU works; a GPU is optional.
If packages are missing, show `python3 -m pip install kittenml soundfile`; do not install silently.
Explain that the first run downloads approximately 954 MB of default packed weights.
Mention the Stellon Labs Community License: non-commercial or limited commercial use, with a USD 1M revenue/funding cap.
Mention its attribution requirement on distribution; check the linked license before commercial use or distribution.
Done when dependencies are available and the user has received the download and license information.

## 3. Generate the speech

Run the bundled [helper](scripts/clone_voice.py), replacing the placeholders:

```bash
python3 <skill-dir>/scripts/clone_voice.py reference.wav --text-file text.txt --out speech.wav --language en
```

Use `--text "Hello"` instead of `--text-file` for short text.
The helper validates duration, converts the reference to mono PCM WAV with ffmpeg, and keeps temporary audio only during generation.
It refuses an existing output file. Exit codes are 0 for success, 1 for runtime failure, and 2 for incorrect arguments.
If Python or ffmpeg is missing, report the blocked dependency and stop.
English is the default. `--language de` disables normalization, as required for non-English text.
The language option controls normalization only; it does not select a language voice.
The model card describes nine additional languages through language voices, including German.
For those languages, verify current language-voice compatibility with reference cloning before promising supported output.
Done when the command exits 0 and creates the requested WAV.

## 4. Check the result

Check the WAV sample rate and duration, then listen if playback is available.
Report the output path, language, and whether listening was possible.
If generation was not run, state that explicitly; never describe an offline test as a model run.
Done when the report distinguishes generated audio from checks that did not use the model.

## Example

Input: “Sprich diesen Text mit meiner Stimme”, a consenting user's 10-second recording, and German text.
Run the helper with `--language de` after checking language-voice compatibility; report the actual WAV and any quality limits.

## References

- Read the [model card](https://huggingface.co/KittenML/kitten-tts-2) when checking API, language voices, or download requirements.
- Read the [license](https://huggingface.co/KittenML/kitten-tts-2/blob/main/LICENSE) before commercial use or distribution.
- Run `node --test <skill-dir>/tests/clone_voice.test.mjs` to check the helper offline without downloading weights.
