# Build the prayer hall, bake day and night lightmaps (irradiance only) with Cycles, render
# matching 360° light probes, and export room.glb.
# blender -b --python room.py -- outdir [samples]
import bpy, bmesh, math, os, sys, numpy as np
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index("--") + 1:]
OUT = os.path.abspath(args[0]); SAMPLES = int(args[1]) if len(args) > 1 else 96
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
rng = np.random.default_rng(11)

# Child at the origin facing -Y (the Qiblah wall). Hall interior:
X0, X1, Y0, Y1, H = -4.0, 4.0, -4.3, 3.7, 3.6

# ---------- textures ----------
def save(name, arr, fmt='JPEG', encode=False):
    # Byte images store the values as given: colour textures are encoded to sRGB here.
    if encode: arr = np.where(arr <= 0.0031308, arr * 12.92, 1.055 * np.clip(arr, 0, None) ** (1 / 2.4) - 0.055)
    h, w = arr.shape[:2]
    a = np.ones((h, w, 4), np.float32); a[..., :arr.shape[2]] = arr
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.pixels.foreach_set(np.flipud(a).ravel())
    img.filepath_raw = os.path.join(OUT, name + ('.jpg' if fmt == 'JPEG' else '.png')); img.file_format = fmt
    img.save(); return img

def srgb(c): c = np.array(c, np.float32) / 255; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def carpet_tex(n=1024):
    # One prayer space: 0.8 m wide x 1.2 m deep, the arch pointing to the Qiblah (top of tile).
    yy, xx = np.mgrid[0:n, 0:n] / n
    img = np.zeros((n, n, 3), np.float32); img[:] = srgb((150, 34, 42))
    noise = rng.normal(0, 1, (n, n)).astype(np.float32)
    img *= (1 + 0.05 * noise[..., None])
    gold, green, cream = srgb((196, 156, 84)), srgb((26, 70, 56)), srgb((226, 210, 170))
    cx = np.abs(xx - 0.5)
    # Arch: straight sides up to y=0.42, pointed top to y=0.12.
    inside = (cx < 0.38) & (yy > 0.12 + 0.3 * (cx / 0.38) ** 1.6) & (yy < 0.94)
    edge = (cx < 0.40) & (yy > 0.10 + 0.3 * (cx / 0.40) ** 1.6) & (yy < 0.955) & ~inside
    img[inside] = img[inside] * 0.0 + srgb((162, 42, 48)) * (1 + 0.05 * noise[inside][:, None])
    img[edge] = gold
    inner = (cx < 0.33) & (yy > 0.18 + 0.28 * (cx / 0.33) ** 1.6) & (yy < 0.9)
    ring = (cx < 0.34) & (yy > 0.17 + 0.28 * (cx / 0.34) ** 1.6) & (yy < 0.905) & ~inner
    img[ring] = cream
    # Medallion and border lines.
    d = np.hypot(xx - 0.5, (yy - 0.55) * 1.5)
    img[(d > 0.1) & (d < 0.115)] = gold
    img[d < 0.06] = gold
    img[d < 0.04] = green
    img[(xx < 0.02) | (xx > 0.98)] = green
    img[(yy > 0.97)] = green
    return img

def tile_tex(n=512):
    yy, xx = np.mgrid[0:n, 0:n] / n
    base = srgb((238, 232, 216)); blue = srgb((70, 118, 170)); teal = srgb((64, 150, 150))
    img = np.zeros((n, n, 3), np.float32); img[:] = base
    u, v = (xx * 2) % 1 - 0.5, (yy * 2) % 1 - 0.5
    star = (np.abs(u) + np.abs(v) < 0.3) | (np.maximum(np.abs(u), np.abs(v)) < 0.21)
    img[star] = blue
    img[(np.abs(u) + np.abs(v) < 0.2)] = teal
    img[(np.abs(u) < 0.012) | (np.abs(v) < 0.012)] = srgb((210, 200, 180))
    img *= (1 + 0.025 * rng.normal(0, 1, (n, n))[..., None])
    return img

def plaster_tex(n=512):
    from numpy.fft import fft2, ifft2
    k = np.hypot(*np.meshgrid(np.fft.fftfreq(n), np.fft.fftfreq(n)))
    noise = np.real(ifft2(fft2(rng.normal(0, 1, (n, n))) / (k + 0.01) ** 1.2)); noise /= np.abs(noise).max()
    img = np.zeros((n, n, 3), np.float32); img[:] = srgb((236, 226, 204))
    return img * (1 + 0.02 * noise[..., None])

def lapis_tex(n=512):
    yy, xx = np.mgrid[0:n, 0:n] / n
    img = np.zeros((n, n, 3), np.float32); img[:] = srgb((22, 48, 92))
    u, v = (xx * 4) % 1 - 0.5, (yy * 4) % 1 - 0.5
    r = np.hypot(u, v)
    img[(np.abs(np.abs(u) + np.abs(v) - 0.3) < 0.018) | (np.abs(np.maximum(np.abs(u), np.abs(v)) - 0.21) < 0.016)] = srgb((200, 160, 80))
    img[r < 0.05] = srgb((200, 160, 80))
    return img

def wood_tex(n=512):
    yy, xx = np.mgrid[0:n, 0:n] / n
    g = np.sin((xx * 40 + 3 * np.sin(yy * 9)) * np.pi) * 0.5 + 0.5
    img = np.zeros((n, n, 3), np.float32); img[:] = srgb((96, 58, 32))
    return img * (0.85 + 0.25 * g[..., None])

def sky_tex(n=256):
    # The view through the glass: a soft sky, brighter towards the horizon.
    yy, xx = np.mgrid[0:n, 0:n] / n
    top, hor = np.array([0.62, 0.78, 1.0]), np.array([1.0, 0.98, 0.94])
    t = np.clip(yy, 0, 1)[..., None] ** 1.4
    img = top * (1 - t) + hor * t
    return (img * (1 + 0.03 * rng.normal(0, 1, (n, n))[..., None])).astype(np.float32)

def drape_tex(n=512):
    yy, xx = np.mgrid[0:n, 0:n] / n
    img = np.zeros((n, n, 3), np.float32); img[:] = srgb((44, 92, 78))
    weave = 0.5 + 0.5 * np.sin(xx * 2 * np.pi * 120) * np.sin(yy * 2 * np.pi * 120)
    img *= (0.94 + 0.06 * weave[..., None]) * (1 + 0.02 * rng.normal(0, 1, (n, n))[..., None])
    img[(yy > 0.035) & (yy < 0.05)] = srgb((196, 156, 84))      # a gold band near the hem
    return img

def jali_tex(n=512):
    yy, xx = np.mgrid[0:n, 0:n] / n
    u, v = (xx * 6) % 1 - 0.5, (yy * 6) % 1 - 0.5
    hole = (np.abs(u) + np.abs(v) < 0.36) & (np.maximum(np.abs(u), np.abs(v)) < 0.42)
    img = np.zeros((n, n, 3), np.float32); img[:] = np.where(hole[..., None], 1.0, 0.0)
    return img

T = {k: save(k, f(), encode=True) for k, f in (("carpet", carpet_tex), ("plaster", plaster_tex), ("lapis", lapis_tex), ("wood", wood_tex), ("drape", drape_tex))}
sky = save("window", sky_tex(), 'PNG', encode=True)

# ---------- materials ----------
def mat(name, tex=None, color=(0.8, 0.8, 0.8), rough=0.7, metal=0.0, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value = (*color, 1); bs.inputs['Roughness'].default_value = rough; bs.inputs['Metallic'].default_value = metal
    if tex is not None:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = tex
        uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = "UVMap"
        nt.links.new(uvn.outputs['UV'], t.inputs['Vector'])
        nt.links.new(t.outputs['Color'], bs.inputs['Base Color'])
    if emit is not None:
        bs.inputs['Emission Color'].default_value = (*emit[0], 1); bs.inputs['Emission Strength'].default_value = emit[1]
    return m
M = {
    "carpet": mat("Carpet", T["carpet"], rough=0.95), "drape": mat("Drape", T["drape"], rough=0.9),
    "plaster": mat("Plaster", T["plaster"], rough=0.9), "lapis": mat("Lapis", T["lapis"], rough=0.5),
    "wood": mat("Wood", T["wood"], rough=0.6), "gold": mat("Gold", None, (0.78, 0.6, 0.3), 0.35, 1.0),
    "window": mat("Window", None, (1, 1, 1), 0.5, emit=((1.0, 0.95, 0.85), 4.0)),
    "lamp": mat("LampGlass", None, (1, 0.8, 0.5), 0.3, emit=((1.0, 0.72, 0.38), 6.0)),
    "brass": mat("Brass", None, (0.62, 0.45, 0.2), 0.4, 1.0),
}

objs = []
def add(name, bm, material, uvscale=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    ob.data.materials.append(material)
    objs.append(ob); return ob

def box(name, mn, mx, material, uvs=1.0, flip=False):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector([mn[i] + (v.co[i] + 0.5) * (mx[i] - mn[i]) for i in range(3)])
    if flip:
        for f in bm.faces: f.normal_flip()
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        n = f.normal
        for lp in f.loops:
            p = lp.vert.co
            if abs(n.z) > 0.5: lp[uv].uv = (p.x / uvs, p.y / uvs)
            elif abs(n.x) > 0.5: lp[uv].uv = (p.y / uvs, p.z / uvs)
            else: lp[uv].uv = (p.x / uvs, p.z / uvs)
    return add(name, bm, material)

def planar(name, verts, material, uvfn):
    bm = bmesh.new(); vs = [bm.verts.new(v) for v in verts]; f = bm.faces.new(vs)
    uv = bm.loops.layers.uv.new("UVMap")
    for lp in f.loops: lp[uv].uv = uvfn(lp.vert.co)
    return add(name, bm, material)

# Floor (carpet: one tile = one prayer space, 0.8 x 1.2 m; arches point to the Qiblah at -Y).
planar("Floor", [(X0, Y0, 0), (X1, Y0, 0), (X1, Y1, 0), (X0, Y1, 0)], M["carpet"], lambda p: ((p.x + 0.4) / 0.8, -(p.y - 0.6) / 1.2))
# Ceiling with an opening for the dome.
R_DOME = 2.2
# (Simpler, robust ceiling: a grid with the dome circle removed.)
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=32, y_segments=32, size=0.5)
for v in bm.verts: v.co = Vector(((X0 + X1) / 2 + v.co.x * (X1 - X0), (Y0 + Y1) / 2 + v.co.y * (Y1 - Y0), H))
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().xy.length < R_DOME], context='FACES')
for f in bm.faces: f.normal_flip() if f.normal.z > 0 else None
uv = bm.loops.layers.uv.new("UVMap")
for f in bm.faces:
    for lp in f.loops: lp[uv].uv = (lp.vert.co.x / 2, lp.vert.co.y / 2)
add("Ceiling", bm, M["plaster"])

# Dome: an octagonal drum with windows, then a hemisphere with a gold oculus ring.
DRUM = 0.6
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=48, radius1=R_DOME, radius2=R_DOME, depth=DRUM)
for v in bm.verts: v.co.z += H + DRUM / 2
for f in bm.faces: f.normal_flip()
uv = bm.loops.layers.uv.new("UVMap")
for f in bm.faces:
    for lp in f.loops: lp[uv].uv = (math.atan2(lp.vert.co.y, lp.vert.co.x) * R_DOME / 1.5, lp.vert.co.z / 1.5)
add("Drum", bm, M["plaster"])
for i in range(8):
    a = i * math.pi / 4 + math.pi / 8
    c = Vector((math.cos(a), math.sin(a), 0)) * (R_DOME - 0.02); t = Vector((-math.sin(a), math.cos(a), 0))
    w, h0, h1 = 0.32, H + 0.12, H + DRUM - 0.1
    vs = [c - t * w / 2 + Vector((0, 0, h0)), c + t * w / 2 + Vector((0, 0, h0)), c + t * w / 2 + Vector((0, 0, h1)), c - t * w / 2 + Vector((0, 0, h1))]
    planar(f"DomeWindow{i}", [tuple(v) for v in vs], M["window"], lambda p, c=c: (0, 0))
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=R_DOME)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context='VERTS')
for v in bm.verts: v.co.z = v.co.z * 0.85 + H + DRUM
for f in bm.faces: f.normal_flip()
uv = bm.loops.layers.uv.new("UVMap")
for f in bm.faces:
    for lp in f.loops:
        p = lp.vert.co; lp[uv].uv = (p.x / 1.2, p.y / 1.2)
add("Dome", bm, M["lapis"])
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=48, radius1=R_DOME + 0.06, radius2=R_DOME + 0.06, depth=0.08)
for v in bm.verts: v.co.z += H + 0.0
for f in bm.faces: f.normal_flip()
bm.loops.layers.uv.new("UVMap")
add("DomeRing", bm, M["gold"])

# Walls: plain cream plaster over a wooden skirting board. (Inner faces only; the hall is closed.)
TILE_H = 1.1
SKIRT = 0.12
def wall(name, a, b, normal):
    a, b = Vector(a), Vector(b)
    L = (b - a).length
    def quad(z0, z1, material, nm, uvs):
        verts = [tuple(a + Vector((0, 0, z0))), tuple(b + Vector((0, 0, z0))), tuple(b + Vector((0, 0, z1))), tuple(a + Vector((0, 0, z1)))]
        d = (b - a).normalized()
        ob = planar(nm, verts, material, lambda p: ((p - a).dot(d) / uvs, p.z / uvs))
        if Vector(normal).dot(ob.data.polygons[0].normal) < 0:
            ob.data.flip_normals()
        return ob
    quad(0, SKIRT, M["wood"], name + "Skirting", 1.0)
    quad(SKIRT, H, M["plaster"], name + "Plaster", 2.0)
wall("WallB", (X1, Y1, 0), (X0, Y1, 0), (0, -1, 0))
wall("WallL", (X0, Y1, 0), (X0, Y0, 0), (1, 0, 0))
wall("WallR", (X1, Y0, 0), (X1, Y1, 0), (-1, 0, 0))

# Qiblah wall: a tiled mihrab surround (PW x PH) with a round-headed niche, plain wall around it.
NW, NH, ND = 0.62, 2.0, 0.42
PW, PH = 1.2, 3.25
def wq(nm, x0, x1, z0, z1, material, uvs):
    planar(nm, [(x0, Y0, z0), (x0, Y0, z1), (x1, Y0, z1), (x1, Y0, z0)], material, lambda p: (p.x / uvs, p.z / uvs))
for side, (x0, x1) in (("L", (X0, -PW)), ("R", (PW, X1))):
    wq("WallQSkirting" + side, x0, x1, 0, SKIRT, M["wood"], 1.0)
    wq("WallQPlaster" + side, x0, x1, SKIRT, H, M["plaster"], 2.0)
wq("WallQTop", -PW, PW, PH, H, M["plaster"], 2.0)
wq("WallQCap", -PW - 0.05, PW + 0.05, PH - 0.05, PH + 0.01, M["gold"], 1.0)

def round_arch(w, h, rz, n=32):
    return [(-w, 0.0)] + [(w * math.cos(math.pi - math.pi * i / n), h + rz * w * math.sin(math.pi - math.pi * i / n)) for i in range(n + 1)] + [(w, 0.0)]
hole = round_arch(NW, NH, 1.1)
# Surround: rectangle minus the niche opening, filled with a hole.
bm = bmesh.new()
rect = [bm.verts.new((x, Y0 + 0.001, z)) for x, z in ((-PW, 0), (-PW, PH), (PW, PH), (PW, 0))]
inner = [bm.verts.new((x, Y0 + 0.001, z)) for x, z in hole[1:-1]]
edges = [bm.edges.new((rect[i], rect[(i + 1) % 4])) for i in range(4)]
loop = [bm.verts.new((x, Y0 + 0.001, z)) for x, z in [hole[0]]] + inner + [bm.verts.new((x, Y0 + 0.001, z)) for x, z in [hole[-1]]]
edges += [bm.edges.new((loop[i], loop[i + 1])) for i in range(len(loop) - 1)]
edges += [bm.edges.new((loop[-1], loop[0]))]
bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
# The bottom edge of the opening is the floor: drop faces inside the opening.
from mathutils.geometry import intersect_point_tri_2d
def in_hole(c):
    if abs(c.x) >= NW: return False
    return c.z < NH or (c.x / NW) ** 2 + ((c.z - NH) / (1.1 * NW)) ** 2 < 1
bmesh.ops.delete(bm, geom=[f for f in bm.faces if in_hole(f.calc_center_median())], context='FACES_ONLY')
bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context='EDGES')
for f in bm.faces:
    if f.normal.y < 0: f.normal_flip()
uv = bm.loops.layers.uv.new("UVMap")
for f in bm.faces:
    for lp in f.loops: lp[uv].uv = (lp.vert.co.x / 0.5, lp.vert.co.z / 0.5)
add("MihrabSurround", bm, M["plaster"])
# Gold frame around the opening.
bm = bmesh.new()
vo = [bm.verts.new((x, Y0 + 0.003, z)) for x, z in round_arch(NW + 0.07, NH, (1.1 * NW + 0.07) / (NW + 0.07))]
vi = [bm.verts.new((x, Y0 + 0.003, z)) for x, z in hole]
for i in range(len(vo) - 1):
    try: bm.faces.new([vo[i], vo[i + 1], vi[i + 1], vi[i]])
    except ValueError: pass
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z < 0.01], context='FACES_ONLY')
for f in bm.faces:
    if f.normal.y < 0: f.normal_flip()
bm.loops.layers.uv.new("UVMap")
add("MihrabFrame", bm, M["gold"])
# Niche: half cylinder and quarter-sphere hood going into the wall (-Y), plus its floor.
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=32, radius1=NW, radius2=NW, depth=NH)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > 1e-4], context='VERTS')
for v in bm.verts: v.co.y = v.co.y * (ND / NW) + Y0; v.co.z += NH / 2
for f in bm.faces: f.normal_flip()
uv = bm.loops.layers.uv.new("UVMap")
for f in bm.faces:
    for lp in f.loops: lp[uv].uv = (lp.vert.co.x * 2, lp.vert.co.z * 2)
add("Niche", bm, M["lapis"])
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=NW)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > 1e-4 or v.co.z < -1e-4], context='VERTS')
for v in bm.verts: v.co.y = v.co.y * (ND / NW) + Y0; v.co.z = v.co.z * 1.1 + NH
for f in bm.faces: f.normal_flip()
uv = bm.loops.layers.uv.new("UVMap")
for f in bm.faces:
    for lp in f.loops: lp[uv].uv = (lp.vert.co.x * 2, lp.vert.co.z * 2)
add("NicheDome", bm, M["lapis"])
nf = planar("NicheFloor", [(NW * math.cos(a), Y0 - ND * math.sin(a), 0.002) for a in np.linspace(0, math.pi, 17)], M["wood"], lambda p: (p.x, p.y))
if nf.data.polygons[0].normal.z < 0: nf.data.flip_normals()

def arch_outline(w, h, peak, n=24):
    pts = [(-w, 0), (-w, h)]
    for i in range(1, n):
        x = -w + 2 * w * i / n
        pts.append((x, h + peak * (1 - abs(x / w) ** 1.6)))
    return pts + [(w, h), (w, 0)]
# Windows: sky glass in a wooden frame with cross bars, a brass rod, and drapes gathered at
# both sides. `o` is a point on the wall, `u` runs along the wall, `n` points into the room.
win_mat = M["window"]
nt = win_mat.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
jt = nt.nodes.new('ShaderNodeTexImage'); jt.image = sky
uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = "UVMap"; nt.links.new(uvn.outputs['UV'], jt.inputs['Vector'])
nt.links.new(jt.outputs['Color'], bs.inputs['Emission Color'])
mixs = nt.nodes.new('ShaderNodeMath'); mixs.operation = 'MULTIPLY'; mixs.inputs[0].default_value = 1.0; mixs.inputs[1].default_value = 4.0
nt.links.new(mixs.outputs[0], bs.inputs['Emission Strength'])
WIN_STRENGTH = mixs
WW, WZ0, WZ1 = 0.5, 0.95, 2.55          # half width, sill and head heights
def oriented_box(name, o, u, n, a0, a1, z0, z1, d0, d1, material):
    bm = bmesh.new()
    pts = [o + u * a + n * d + Vector((0, 0, z)) for a in (a0, a1) for d in (d0, d1) for z in (z0, z1)]
    vs = [bm.verts.new(p) for p in pts]
    bmesh.ops.convex_hull(bm, input=vs)
    bm.normal_update()
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for lp in f.loops: lp[uv].uv = ((lp.vert.co - o).dot(u) * 2, lp.vert.co.z * 2)
    return add(name, bm, material)
def drape(name, o, u, n, a0, a1, top, bottom, folds):
    bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap")
    NU, NV = 22, 8
    grid = []
    for j in range(NV + 1):
        t = j / NV; z = top + (bottom - top) * t
        row = []
        for i in range(NU + 1):
            s_ = i / NU
            a = a0 + (a1 - a0) * s_
            depth = 0.07 + 0.028 * math.sin(s_ * folds * 2 * math.pi) * (0.7 + 0.5 * t)
            row.append(bm.verts.new(o + u * a + n * depth + Vector((0, 0, z))))
        grid.append(row)
    for j in range(NV):
        for i in range(NU):
            f = bm.faces.new([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]])
            for lp, (ii, jj) in zip(f.loops, [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]): lp[uv].uv = (ii / NU * 2, 1 - jj / NV)
    bm.normal_update()
    for f in bm.faces:
        if f.normal.dot(n) < 0: f.normal_flip()
    return add(name, bm, M["drape"])
def window(tag, o, u, n):
    # Glass (just in front of the wall), frame and bars, rod, two drapes.
    bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap")
    vs = [bm.verts.new(o + u * a + n * 0.004 + Vector((0, 0, z))) for a, z in ((-WW, WZ0), (WW, WZ0), (WW, WZ1), (-WW, WZ1))]
    f = bm.faces.new(vs)
    if f.normal.dot(n) < 0: f.normal_flip()
    for lp in f.loops: lp[uv].uv = (0.5 + (lp.vert.co - o).dot(u) / (2 * WW), (lp.vert.co.z - WZ0) / (WZ1 - WZ0))
    add("Window" + tag, bm, win_mat)
    fw, fd = 0.06, 0.05
    oriented_box("WinFrameL" + tag, o, u, n, -WW - fw, -WW, WZ0 - fw, WZ1 + fw, 0, fd, M["wood"])
    oriented_box("WinFrameR" + tag, o, u, n, WW, WW + fw, WZ0 - fw, WZ1 + fw, 0, fd, M["wood"])
    oriented_box("WinFrameT" + tag, o, u, n, -WW, WW, WZ1, WZ1 + fw, 0, fd, M["wood"])
    oriented_box("WinSill" + tag, o, u, n, -WW - 0.1, WW + 0.1, WZ0 - fw - 0.03, WZ0, 0, fd + 0.06, M["wood"])
    oriented_box("WinBarV" + tag, o, u, n, -0.017, 0.017, WZ0, WZ1, 0.004, 0.03, M["wood"])
    for zb in (WZ0 + (WZ1 - WZ0) * 0.62,):
        oriented_box("WinBarH" + tag, o, u, n, -WW, WW, zb - 0.017, zb + 0.017, 0.004, 0.03, M["wood"])
    rz = WZ1 + 0.2
    oriented_box("WinRod" + tag, o, u, n, -WW - 0.42, WW + 0.42, rz - 0.012, rz + 0.012, 0.085, 0.11, M["brass"])
    drape("DrapeL" + tag, o, u, n, -WW - 0.4, -WW + 0.12, rz - 0.01, 0.06, 4)
    drape("DrapeR" + tag, o, u, n, WW - 0.12, WW + 0.4, rz - 0.01, 0.06, 4)
for side, x, nx in (("L", X0, 1), ("R", X1, -1)):
    for k, yc in enumerate((-2.2, 0.0, 2.2)):
        window(f"{side}{k}", Vector((x, yc, 0)), Vector((0, -nx, 0)), Vector((nx, 0, 0)))
for k, xc in enumerate((-1.05, 1.05)):
    window(f"B{k}", Vector((xc, Y1, 0)), Vector((-1, 0, 0)), Vector((0, -1, 0)))
# Wooden door on the back wall.
box("DoorFrame", (2.25, Y1 - 0.02, 0), (3.35, Y1 - 0.004, 2.32), M["gold"], 1.0)
box("Door", (2.3, Y1 - 0.06, 0), (3.3, Y1 - 0.008, 2.25), M["wood"], 1.0)

# Hanging brass lanterns (the night light).
LAMPS = [(0, -2.6, 2.5), (-1.6, -0.6, 2.7), (1.6, -0.6, 2.7), (0, 1.8, 2.7)]
for i, (x, y, z) in enumerate(LAMPS):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.13, radius2=0.09, depth=0.3)
    for v in bm.verts: v.co += Vector((x, y, z))
    bm.loops.layers.uv.new("UVMap")
    add(f"LampGlass{i}", bm, M["lamp"])
    box(f"LampCap{i}", (x - 0.11, y - 0.11, z + 0.15), (x + 0.11, y + 0.11, z + 0.2), M["brass"])
    box(f"LampChain{i}", (x - 0.008, y - 0.008, z + 0.2), (x + 0.008, y + 0.008, H), M["brass"])

# ---------- join and lightmap UVs ----------
for o in bpy.context.selected_objects: o.select_set(False)
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
room = bpy.context.view_layer.objects.active; room.name = "Room"
me = room.data
lm = me.uv_layers.new(name="Lightmap")
me.uv_layers.active = lm
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0)
bpy.ops.uv.pack_islands(margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')
me.uv_layers.active = me.uv_layers["UVMap"]
me.uv_layers["UVMap"].active_render = True
print("ROOM TRIS", sum(len(p.vertices) - 2 for p in me.polygons))

# ---------- bake ----------
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = False
sc.world = bpy.data.worlds.new("W"); sc.world.use_nodes = True
bgn = next(n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND'); bgn.inputs[1].default_value = 0.0

def set_lighting(mode):
    day = mode == "day"
    M["window"].node_tree.nodes  # windows: daylight through the jali
    WIN_STRENGTH.inputs[1].default_value = 5.0 if day else 0.12      # night: a dim blue sky (tinted at runtime too)
    lb = next(n for n in M["lamp"].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    lb.inputs['Emission Strength'].default_value = 2.0 if day else 26.0

LM = 1024
def bake(mode):
    set_lighting(mode)
    img = bpy.data.images.new(f"lm_{mode}", LM, LM, float_buffer=True)
    for m in me.materials:
        nt = m.node_tree
        for n in [n for n in nt.nodes if n.name == "BakeTarget"]: nt.nodes.remove(n)
        t = nt.nodes.new('ShaderNodeTexImage'); t.name = "BakeTarget"; t.image = img
        nt.nodes.active = t
    me.uv_layers.active = me.uv_layers["Lightmap"]
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=4, use_clear=True)
    me.uv_layers.active = me.uv_layers["UVMap"]
    a = np.array(img.pixels[:], np.float32).reshape(LM, LM, 4)[..., :3]
    # Light denoise: a small separable blur (lighting is soft by nature).
    k = np.array([1, 4, 6, 4, 1], np.float32); k /= k.sum()
    for ax in (0, 1):
        a = sum(np.roll(a, i - 2, axis=ax) * k[i] for i in range(5))
    np.save(os.path.join(OUT, f"lm_{mode}.npy"), a)
    print("BAKED", mode, float(a.mean()), float(np.percentile(a, 99)))
    return a

for mode in ("day", "night"):
    a = bake(mode)
    # Encode: sqrt for 8-bit precision; the runtime decodes with x*x*scale.
    scale = float(np.percentile(a, 99.5)) * 1.1
    enc = np.sqrt(np.clip(a / scale, 0, 1))
    save(f"lightmap_{mode}", np.flipud(enc))
    with open(os.path.join(OUT, f"lightmap_{mode}.json"), "w") as fh: fh.write('{"scale": %f}' % scale)

# ---------- 360° light probes at the child's chest height ----------
cam = bpy.data.objects.new("Probe", bpy.data.cameras.new("Probe")); sc.collection.objects.link(cam)
cam.data.type = 'PANO'
try: cam.data.panorama_type = 'EQUIRECTANGULAR'
except Exception: cam.data.cycles.panorama_type = 'EQUIRECTANGULAR'
cam.location = (0, 0, 0.75); cam.rotation_euler = (math.pi / 2, 0, 0)
sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = 512, 256
sc.cycles.samples = 64; sc.cycles.use_denoising = True
for m in me.materials:
    for n in [n for n in m.node_tree.nodes if n.name == "BakeTarget"]: m.node_tree.nodes.remove(n)
sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.file_format = 'HDR'
for mode in ("day", "night"):
    set_lighting(mode)
    sc.render.filepath = os.path.join(OUT, f"probe_{mode}.hdr")
    bpy.ops.render.render(write_still=True)
    print("PROBE", mode)

# ---------- export ----------
for o in bpy.context.selected_objects: o.select_set(False)
room.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "room.glb"), export_format='GLB', use_selection=True,
    export_texcoords=True, export_normals=True, export_image_format='JPEG', export_jpeg_quality=85, export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "room.blend"))
print("DONE", os.path.getsize(os.path.join(OUT, "room.glb")))
