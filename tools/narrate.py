#!/usr/bin/env python3
"""Records the lessons' captions with Kokoro, a free open-source neural voice (Apache 2.0, so fine to ship
in a paid course), as small MP3s the player streams from audio/narration/<lesson>/<hash>.mp3.

    node tools/narration-extract.mjs        # list the captions -> tools/narration-manifest.json
    python3 tools/narrate.py                # record whatever is missing
    python3 tools/narrate.py --force        # re-record everything (after changing the voice)
    python3 tools/narrate.py --prune        # also delete recordings of captions that no longer exist
    python3 tools/narrate.py --sample       # one caption in each voice, to choose between them

A recording is named by a hash of its caption, so editing a caption re-records just that line, and
nothing is ever recorded twice. One-time setup:

    pip install -r tools/requirements.txt && brew install espeak-ng
    # then download kokoro-v1.0.onnx and voices-v1.0.bin (about 350 MB, once) from
    # https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 into tools/models/ (git-ignored),
    # or point KOKORO_MODEL and KOKORO_VOICES at them.
"""
import argparse, json, os, sys, time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'audio' / 'narration'
MODELS = Path(os.environ.get('KOKORO_MODELS', ROOT / 'tools' / 'models'))

VOICE = 'af_heart'   # Kokoro's best-rated voice: warm, clear, unhurried
SPEED = 0.97
LANG = 'en-us'
BITRATE = 48         # kbps, mono: plenty for speech, about 6 KB per second
SAMPLE_VOICES = ['af_heart', 'af_bella', 'af_nicole', 'bf_emma', 'bf_isabella', 'am_michael', 'bm_george']


def espeak_config():
    from kokoro_onnx import EspeakConfig
    for lib, data in [('/opt/homebrew/lib/libespeak-ng.dylib', '/opt/homebrew/share/espeak-ng-data'),
                      ('/usr/local/lib/libespeak-ng.dylib', '/usr/local/share/espeak-ng-data'),
                      ('/usr/lib/x86_64-linux-gnu/libespeak-ng.so.1', '/usr/lib/x86_64-linux-gnu/espeak-ng-data'),
                      ('/usr/lib/aarch64-linux-gnu/libespeak-ng.so.1', '/usr/lib/aarch64-linux-gnu/espeak-ng-data')]:
        if Path(lib).exists() and Path(data).exists():
            return EspeakConfig(lib_path=lib, data_path=data)
    return None  # fall back to the copy bundled with the wheel (broken on some builds)


def load():
    from kokoro_onnx import Kokoro
    model = Path(os.environ.get('KOKORO_MODEL', MODELS / 'kokoro-v1.0.onnx'))
    voices = Path(os.environ.get('KOKORO_VOICES', MODELS / 'voices-v1.0.bin'))
    for f in (model, voices):
        if not f.exists():
            sys.exit(f'Missing {f}. See the setup notes at the top of this file.')
    cfg = espeak_config()
    return Kokoro(str(model), str(voices), espeak_config=cfg) if cfg else Kokoro(str(model), str(voices))


def trim(audio, sr, pad=0.07, floor=0.012, target_rms=0.085, ceiling=0.9):
    """Take the silence off both ends (keeping a breath) and set the loudness of the speech itself, not the
    loudest peak, so lines sound equally loud when they play back to back."""
    loud = np.flatnonzero(np.abs(audio) > floor)
    if loud.size:
        audio = audio[max(0, loud[0] - int(pad * sr)): loud[-1] + int(pad * sr) + 1]
    voiced = audio[np.abs(audio) > floor]
    rms = float(np.sqrt(np.mean(voiced ** 2))) if voiced.size else 0.0
    gain = target_rms / rms if rms > 0 else 1.0
    peak = float(np.max(np.abs(audio))) or 1.0
    return audio * min(gain, ceiling / peak)


def to_mp3(audio, sr):
    import lameenc
    enc = lameenc.Encoder()
    enc.set_bit_rate(BITRATE)
    enc.set_in_sample_rate(sr)
    enc.set_channels(1)
    enc.set_quality(2)
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes()
    return bytes(enc.encode(pcm)) + bytes(enc.flush())


def record(k, text, voice=VOICE):
    audio, sr = k.create(text, voice=voice, speed=SPEED, lang='en-gb' if voice.startswith('b') else LANG)
    return to_mp3(trim(audio, sr), sr), len(audio) / sr


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--force', action='store_true', help='re-record everything')
    ap.add_argument('--prune', action='store_true', help='delete recordings of captions that no longer exist')
    ap.add_argument('--sample', action='store_true', help='record one caption in every voice')
    ap.add_argument('--only', help='only this lesson id, e.g. eclipses')
    args = ap.parse_args()

    manifest = ROOT / 'tools' / 'narration-manifest.json'
    if not manifest.exists():
        sys.exit('Run  node tools/narration-extract.mjs  first.')
    lines = json.loads(manifest.read_text())['lines']
    k = load()

    if args.sample:
        d = ROOT / 'tools' / 'voice-samples'
        d.mkdir(exist_ok=True)
        text = lines[0]['spoken']
        for v in SAMPLE_VOICES:
            mp3, secs = record(k, text, v)
            (d / f'{v}.mp3').write_bytes(mp3)
            print(f'{v}: {secs:.1f}s -> {d / (v + ".mp3")}')
        return

    keep, made, skipped, secs_total, started = set(), 0, 0, 0.0, time.time()
    todo = [l for l in lines if not args.only or l['lesson'] == args.only]
    for i, l in enumerate(todo, 1):
        path = OUT / l['lesson'] / f"{l['id']}.mp3"
        keep.add(path)
        if path.exists() and not args.force:
            skipped += 1
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        mp3, secs = record(k, l['spoken'])
        path.write_bytes(mp3)
        made += 1
        secs_total += secs
        print(f"[{i}/{len(todo)}] {l['lesson']}/{l['id']}  {secs:4.1f}s  {l['spoken'][:60]}", flush=True)

    pruned = 0
    if args.prune and not args.only:
        for f in OUT.rglob('*.mp3'):
            if f not in keep:
                f.unlink()
                pruned += 1
    size = sum(f.stat().st_size for f in OUT.rglob('*.mp3')) if OUT.exists() else 0
    print(f'\nrecorded {made} ({secs_total / 60:.1f} min of speech in {time.time() - started:.0f}s), kept {skipped}, pruned {pruned}; '
          f'{size / 1e6:.1f} MB in audio/narration/')


if __name__ == '__main__':
    main()
