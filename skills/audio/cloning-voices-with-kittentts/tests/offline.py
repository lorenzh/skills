"""Offline regression checks: real ffmpeg, stubbed inference only."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import wave
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("clone", Path(__file__).parents[1] / "scripts/clone_voice.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
with tempfile.TemporaryDirectory(dir=".") as scratch:
    root = Path(scratch)
    source = root / "source.wav"
    def fixture(seconds):
        with wave.open(str(source), "wb") as wav:
            wav.setparams((2, 2, 8000, 0, "NONE", "not compressed"))
            wav.writeframes(bytes(seconds * 8000 * 4))
    for seconds in (5, 30):
        fixture(seconds)
        m.prepare_reference(source, root / "mono.wav")
        with wave.open(str(root / "mono.wav")) as wav:
            assert wav.getnchannels() == 1 and wav.getframerate() == 24000
    for seconds in (4, 31):
        fixture(seconds)
        try:
            m.prepare_reference(source, root / "mono.wav")
        except ValueError as error:
            assert "5–30" in str(error)
        else:
            raise AssertionError("invalid duration accepted")
    fixture(5)
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
        assert calls == [("Hallo", False), ("Hello", True)]
        with wave.open(str(root / "de.wav")) as wav:
            assert wav.getframerate() == 24000
        for extra in (["--text", " "], ["--text", "Hello", "--text-file", str(text_file)]):
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
        assert m.main([str(source), "--text", "Hello", "--out", str(root / "missing.wav")]) == 1
print("PASS: real ffmpeg; duration boundaries; text/file; en/de; overwrite guard; missing dependency")
