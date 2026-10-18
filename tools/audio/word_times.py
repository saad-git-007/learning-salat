import sys
from faster_whisper import WhisperModel
m = WhisperModel("small", device="cpu", compute_type="int8")
f, a, b = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
from faster_whisper.audio import decode_audio
au = decode_audio(f, sampling_rate=16000)[int(a*16000):int(b*16000)]
segs, info = m.transcribe(au, language="ar", word_timestamps=True, beam_size=5)
for s in segs:
    for w in s.words: print(f"{a+w.start:7.2f} {a+w.end:7.2f} {w.word}")
