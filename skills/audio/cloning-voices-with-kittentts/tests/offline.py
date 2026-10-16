"""Offline regression checks: real ffmpeg, stubbed inference only."""
import contextlib
import io
import importlib.util
from pathlib import Path
import shutil
import sys
import tempfile
import types
import wave
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("clone", Path(__file__).parents[1] / "scripts/clone_voice.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
if shutil.which("ffmpeg") is None:
    print("SKIP: ffmpeg is missing; offline audio checks require ffmpeg.")
    sys.exit(0)

with tempfile.TemporaryDirectory() as scratch:
    root = Path(scratch)
    source = root / "source.wav"
    def fixture(seconds):
        with wave.open(str(source), "wb") as wav:
            wav.setparams((2, 2, 8000, 0, "NONE", "not compressed"))
            wav.writeframes(bytes(round(seconds * 8000) * 4))
    for seconds in (5.1, 29.9):
        fixture(seconds)
        m.prepare_reference(source, root / "mono.wav")
        with wave.open(str(root / "mono.wav")) as wav:
            assert wav.getnchannels() == 1 and wav.getframerate() == 24000
    for seconds in (4.9, 30.1):
        fixture(seconds)
        try:
            m.prepare_reference(source, root / "mono.wav")
        except ValueError as error:
            assert "5–30" in str(error)
        else:
            raise AssertionError("invalid duration accepted")
    fixture(5.1)
    calls = []
    class Model:
        sample_rate = 24000
        def __init__(self, name):
            assert name == "KittenML/kitten-tts-2"
        def generate(self, text, **kwargs):
            assert Path(kwargs["reference"]).is_file()
            calls.append((text, kwargs["normalize"]))
            return [0.0] * 240
    def write(output, audio, rate, format):
        assert format == "WAV"
        with wave.open(output, "wb") as wav:
            wav.setparams((1, 2, rate, 0, "NONE", "not compressed"))
            wav.writeframes(bytes(len(audio) * 2))
    with patch.dict(sys.modules, {"kittenml": types.SimpleNamespace(KittenTTS=Model), "soundfile": types.SimpleNamespace(write=write)}):
        text_file = root / "text.txt"
        text_file.write_text("Hallo", encoding="utf-8")
        assert m.main([str(source), "--text-file", str(text_file), "--out", str(root / "de.wav"), "--language", "de"]) == 0
        assert m.main([str(source), "--text", "Hello", "--out", str(root / "en.wav")]) == 0
        assert m.main([str(source), "Hi", "--out", str(root / "positional.wav")]) == 0
        assert calls == [("Hallo", False), ("Hello", True), ("Hi", True)]
        with wave.open(str(root / "de.wav")) as wav:
            assert wav.getframerate() == 24000
        for extra in ([], ["--text", " "], ["--text", "Hello", "--text-file", str(text_file)],
                      ["Hi", "--text", "Hello"], ["Hi", "--text-file", str(text_file)]):
            try:
                m.main([str(source), "--out", str(root / "bad.wav"), *extra])
            except SystemExit as error:
                assert error.code == 2
            else:
                raise AssertionError("invalid invocation accepted")
        try:
            m.main([str(source), "--text", "Hello", "--out", str(root / "en.wav")])
        except SystemExit as error:
            assert error.code == 2
        else:
            raise AssertionError("output overwritten")
    with patch.dict(sys.modules, {"kittenml": None}):
        errors = io.StringIO()
        with contextlib.redirect_stderr(errors):
            assert m.main([str(source), "--text", "Hello", "--out", str(root / "missing.wav")]) == 1
        for hint in ("No module named pip", "python3-venv", "--without-pip", "get-pip.py", "Ask"):
            assert hint in errors.getvalue(), errors.getvalue()
print("PASS: real ffmpeg; duration boundaries; positional/text/file and mutual exclusion; en/de; overwrite guard; missing dependency")
