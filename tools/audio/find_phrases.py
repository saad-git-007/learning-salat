import sys, os, re, subprocess, json
import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio
m = WhisperModel("small", device="cpu", compute_type="int8")
out = sys.argv[1]
res = {}
for f in sys.argv[2:]:
    name = os.path.basename(f)
    p = subprocess.run(["ffmpeg","-hide_banner","-i",f,"-af","silencedetect=noise=-38dB:d=0.45","-f","null","-"],capture_output=True,text=True).stderr
    starts=[float(x) for x in re.findall(r"silence_start: ([\d.]+)",p)]
    ends=[float(x) for x in re.findall(r"silence_end: ([\d.]+)",p)]
    audio = decode_audio(f, sampling_rate=16000)
    dur = len(audio)/16000
    # speech chunks between silences
    bounds=[]; cur=0.0
    for s,e in zip(starts,ends+[dur]*(len(starts)-len(ends))):
        if s-cur>0.25: bounds.append((cur,s))
        cur=e
    if dur-cur>0.25: bounds.append((cur,dur))
    rows=[]
    for (a,b) in bounds:
        seg = audio[int(a*16000):int(b*16000)]
        segs, info = m.transcribe(seg, language=None, beam_size=2)
        lang=info.language; prob=info.language_probability
        if lang=="ar":
            txt=" ".join(s.text.strip() for s in segs)
        else:
            txt=" ".join(s.text.strip() for s in segs)
        rows.append((round(a,2),round(b,2),lang,round(prob,2),txt))
    res[name]=rows
    with open(os.path.join(out,name+".chunks.txt"),"w") as fh:
        for r in rows: fh.write(f"{r[0]:7.2f} {r[1]:7.2f} {r[2]} {r[3]:.2f}  {r[4]}\n")
    print("done",name,flush=True)
json.dump(res,open(os.path.join(out,"chunks.json"),"w"),ensure_ascii=False,indent=1)
