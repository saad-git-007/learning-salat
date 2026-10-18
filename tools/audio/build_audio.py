# Cut the Arabic recitations out of the alislam.org Salat Guide recordings.
import sys, os, json, subprocess, numpy as np
SRC, OUT = sys.argv[1], sys.argv[2]
SR = 44100
F = {k: os.path.join(SRC, v) for k, v in {
  'iq': '05_Iqamah.mp3', 'th': '07_Thana.mp3', 'ta': '08_Taawwudh.mp3', 'fa': '09_Surah-Al-Fatiha.mp3',
  'ik': '10_Surah-Al-Ikhlas.mp3', 'ru': '11_Ruku.mp3', 'tm': '12_Tasmeeh.mp3', 'td': '13_Tahmeed.mp3',
  'sa': '14_Sajdah.mp3', 'ji': '15_Jilsa.mp3', 'ts': '17_Tashahhud.mp3', 'du': '18_Durud.mp3', 'pd': '19_Some-Prayers-after-Durud.mp3', 'sl': '20_Salaam.mp3'}.items()}
_cache = {}
def load(k):
    if k not in _cache:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', F[k], '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
        _cache[k] = np.frombuffer(raw, np.float32).copy()
    return _cache[k]

# clip: list of phrases; each phrase is a list of (src, start, end) pieces.
P = lambda *pieces: list(pieces)
CLIPS = {
  'iqamah': {'one': ('iq', 44.57, 79.88), 'marks': [44.61, 48.31, 53.95, 60.14, 63.77, 68.14, 72.45, 75.82]},
  'takbir': [P(('iq', 44.57, 45.97))],
  'thana': [P(('th', 10.85, 22.40))],
  'taawwudh': [P(('ta', 11.10, 16.10))],
  'bismillah': [P(('fa', 15.42, 18.85))],
  'fatihah': [P(('fa', a, b)) for a, b in [(29.13, 34.46), (44.43, 47.16), (53.70, 56.62), (63.37, 68.73), (78.26, 81.75), (86.50, 91.07), (99.69, 107.95)]],
  'ikhlas': [P(('ik', a, b)) for a, b in [(21.34, 24.48), (34.50, 36.70), (43.69, 45.48), (51.97, 54.98), (62.64, 66.36)]],
  'ruku': [P(('ru', 50.58, 53.36))],
  'tasmi': [P(('tm', 23.03, 25.50))],
  'tahmid': [P(('td', 10.80, 12.82)), P(('td', 13.33, 18.57))],
  'sajdah': [P(('sa', 137.70, 140.51))],
  'jilsah': [P(('ji', 66.84, 79.08))],
  'tashahhud': [P(('ts', a, b)) for a, b in [(14.61, 21.04), (36.08, 43.70), (44.21, 51.33), (73.24, 77.76), (78.07, 83.80)]],
  'durud': [P(('du', a, b)) for a, b in [(25.14, 32.27), (32.88, 41.70), (42.07, 45.81), (71.99, 80.02), (80.52, 89.95), (90.31, 94.22)]],
  # Prayers after Durud: continuous takes (the reciter's own pauses), marks at phrase starts.
  'rabbana': {'one': ('pd', 12.58, 25.98), 'marks': [12.70, 17.97, 21.72]},
  'rabbijalni': {'one': ('pd', 45.46, 65.84), 'marks': [45.58, 49.41, 51.09, 56.84, 60.40]},
  'salam': [P(('sl', 7.68, 10.14))],
}

def cut(k, a, b, fade=0.025):
    x = load(k)[int(a * SR):int(b * SR)].copy()
    n = int(fade * SR)
    if len(x) > 2 * n:
        x[:n] *= np.linspace(0, 1, n); x[-n:] *= np.linspace(1, 0, n)
    return x

def rms_db(x):
    # Loudness of the voiced part only.
    w = 1024
    fr = [np.sqrt(np.mean(x[i:i + w] ** 2)) for i in range(0, len(x) - w, w)]
    fr = np.array([f for f in fr if f > 0.005]) if fr else np.array([1e-4])
    return 20 * np.log10(np.mean(fr) + 1e-9)

def even(x, target=-20.0):
    return x * 10 ** ((target - rms_db(x)) / 20)

os.makedirs(OUT, exist_ok=True)
manifest = {}
lead = np.zeros(int(0.12 * SR), np.float32)
for name, spec in CLIPS.items():
    if isinstance(spec, dict):
        k, a, b = spec['one']
        audio = even(cut(k, a, b)); marks = [round(m - a + 0.12, 2) for m in spec['marks']]
        audio = np.concatenate([lead, audio])
    else:
        parts, marks, t = [lead], [], len(lead) / SR
        for i, phrase in enumerate(spec):
            if i: gap = np.zeros(int(0.4 * SR), np.float32); parts.append(gap); t += len(gap) / SR
            marks.append(round(t, 2))
            for piece in phrase:
                k, a, b = piece[:3]
                if len(piece) > 3 and piece[3] > 0:
                    gap = np.zeros(int(piece[3] * SR), np.float32); parts.append(gap); t += len(gap) / SR
                seg = even(cut(k, a, b, 0.012 if name == 'jilsah' else 0.025))
                parts.append(seg); t += len(seg) / SR
        audio = np.concatenate(parts)
    audio = np.concatenate([audio, np.zeros(int(0.15 * SR), np.float32)])
    peak = np.max(np.abs(audio))
    if peak > 0.89: audio *= 0.89 / peak
    wav = os.path.join(OUT, name + '.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'pcm_s16le', wav], input=audio.astype(np.float32).tobytes())
    mp3 = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '96k', '-ac', '1', mp3])
    manifest[name] = {'file': name + '.mp3', 'dur': round(len(audio) / SR, 2), 'marks': marks}
    print(f'{name:10s} {len(audio)/SR:6.2f}s marks {marks}')
json.dump(manifest, open(os.path.join(OUT, 'clips.json'), 'w'), indent=1)
