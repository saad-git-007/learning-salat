# Wall plaster: warm limewash with soft cloudy tone variation, fine stucco grain and a faint
# (no pattern: plain limewash). One tile = 2 m x 2 m of wall (the UVs' scale).
import sys, numpy as np
from numpy.fft import fft2, ifft2
from PIL import Image
out = sys.argv[1]; n = 1024
rng = np.random.default_rng(5)
def noise(power):
    k = np.hypot(*np.meshgrid(np.fft.fftfreq(n), np.fft.fftfreq(n)))
    f = np.real(ifft2(fft2(rng.normal(0, 1, (n, n))) / (k + 1 / n) ** power))
    return (f - f.mean()) / f.std()
cloud, grain = noise(1.6), noise(0.3)
base = np.array([240, 228, 205], np.float32) / 255          # warm sand-ivory
yy, xx = np.mgrid[0:n, 0:n] / n
# Star lattice: 4 x 4 per tile (50 cm), each an eight-point star outline.
u, v = (xx * 4) % 1 - 0.5, (yy * 4) % 1 - 0.5
sq = np.maximum(np.abs(u), np.abs(v)); dia = (np.abs(u) + np.abs(v)) / np.sqrt(2)
star = np.maximum(sq, dia)
line = np.clip(1.6 - np.abs(star - 0.26) / 0.009, 0, 1) + 0.7 * np.clip(1.5 - np.abs(np.hypot(u, v) - 0.07) / 0.007, 0, 1)
img = base[None, None, :] * (1 + 0.009 * np.clip(cloud, -2, 2)[..., None] + 0.007 * grain[..., None])
Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(out, quality=88)
print("ok", out)
