# Dress the MakeHuman child (navy polo shirt, black trousers, crochet topi), rebuild
# materials for glTF, and export a skinned GLB.
# blender -b child_base.blend --python child_full.py -- out.blend out.glb texdir
import bpy, bmesh, os, sys, math, numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
OUT_BLEND, OUT_GLB, TEX = args[0], args[1], args[2]
os.makedirs(TEX, exist_ok=True)
# MPFB data folders (user assets and the add-on's own data); override with MPFB_USER_DATA / MPFB_DATA.
D = os.environ.get("MPFB_USER_DATA", os.path.expanduser("~/.config/blender/5.2/extensions/.user/user_default/mpfb/data"))

rig = bpy.data.objects["Child.rig"]
body = bpy.data.objects["Child"]
hair = bpy.data.objects["Child.short02"]
brows = bpy.data.objects["Child.eyebrow001"]
lashes = bpy.data.objects["Child.eyelashes01"]
eyes = bpy.data.objects["Child.high-poly"]
bones = {b.name.split(":")[1]: b for b in rig.data.bones}
def bhead(n): return rig.matrix_world @ bones[n].head_local
def btail(n): return rig.matrix_world @ bones[n].tail_local

# ---------- 0. Bake MakeHuman's shape keys (the child's shape) into every mesh ----------
for o in [body, hair, brows, lashes, eyes]:
    if o.data.shape_keys:
        bpy.context.view_layer.objects.active = o
        for x in bpy.context.selected_objects: x.select_set(False)
        o.select_set(True)
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    print("DIMS", o.name, tuple(round(v, 3) for v in o.dimensions))

# ---------- 0a. Eyes: drop the clear cornea shell ----------
# Its texture corner is not fully transparent, so with alpha-tested eyes it shows as streaks
# over the eye once the eyes turn. The eyeball under it carries the iris and the whites.
bm = bmesh.new(); bm.from_mesh(eyes.data)
uvl = bm.loops.layers.uv.active
cornea = {l.vert for f in bm.faces for l in f.loops if l[uvl].uv.x > 0.85 and l[uvl].uv.y < 0.15}
bmesh.ops.delete(bm, geom=list(cornea), context='VERTS')
bm.to_mesh(eyes.data); bm.free()
print("CORNEA removed", len(cornea))

# ---------- 0b. Open the eyelids (MakeHuman's "eye opened up" expression unit) ----------
# The default child's lids sit low, and with the gaze down at the mat they read as closed.
import gzip
U = os.path.join(os.environ.get("MPFB_DATA", os.path.expanduser("~/.config/blender/5.2/extensions/user_default/mpfb/data")), "targets/expression/units")
LID_OPEN = float(os.environ.get("LID_OPEN", "0.6"))
before = [v.co.copy() for v in body.data.vertices]
for side in ("left", "right"):
    acc = {}
    for eth in ("african", "asian", "caucasian"):
        for ln in gzip.open(f"{U}/{eth}/eye-{side}-opened-up.target.gz", "rt"):
            f = ln.split()
            if len(f) != 4 or f[0].startswith("#"): continue
            i, d = int(f[0]), Vector((float(f[1]), -float(f[3]), float(f[2]))) * 0.1 / 3
            acc[i] = acc.get(i, Vector()) + d
    for i, d in acc.items(): body.data.vertices[i].co += d * LID_OPEN
moved = [(before[i], body.data.vertices[i].co - before[i]) for i in range(len(before)) if (body.data.vertices[i].co - before[i]).length > 1e-6]
print("MW", body.matrix_world, lashes.matrix_world)
print("LIDS moved", len(moved), "max", max(d.length for _, d in moved))
# The lashes ride on the lids: move each by the nearest lid vertices' displacement.
from mathutils.kdtree import KDTree
kd = KDTree(len(moved))
for i, (p, _) in enumerate(moved): kd.insert(p, i)
kd.balance()
maxd = max(d.length for _, d in moved)
lash_w = {}
for v in lashes.data.vertices:
    near = kd.find_n(v.co, 3)
    if near and near[0][2] < 0.006:
        w = [1 / (n[2] + 1e-4) for n in near]
        dv = sum((moved[n[1]][1] * wi for n, wi in zip(near, w)), Vector()) / sum(w)
        v.co += dv
        lash_w[v.index] = dv.length / maxd
# The upper lids follow the eyes: remember how much each lid vertex opened (its share of the
# lid), so it can be weighted to the eye bone below and lower as the eye looks down.
lid_vg = body.vertex_groups.new(name="lid_share")
for i in range(len(before)):
    dl_ = (body.data.vertices[i].co - before[i]).length
    if dl_ > 1e-6: lid_vg.add([i], dl_ / maxd, 'REPLACE')

# ---------- 1. Clean the body: drop helper geometry, keep the armature modifier ----------
for m in list(body.modifiers):
    if m.type == 'MASK': body.modifiers.remove(m)
gi = body.vertex_groups["body"].index
bm = bmesh.new(); bm.from_mesh(body.data)
dl = bm.verts.layers.deform.active
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[dl].get(gi, 0) < 0.5], context='VERTS')
bm.to_mesh(body.data); bm.free()

names = {g.index: g.name for g in body.vertex_groups}
def dominant(dv):
    best, bw = None, 0
    for k, w in dv.items():
        n = names.get(k, "")
        if n.startswith("mixamorig:") and w > bw: best, bw = n[10:], w
    return best

def seg_t(p, a, b):
    ab = b - a
    return max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))

TORSO = {"Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm"}
LEGS = {"LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"}
neck_z = bhead("Neck").z
crotch_z = bhead("LeftUpLeg").z - 0.035
knee_z = bhead("LeftLeg").z
ankle_z = bhead("LeftFoot").z

hips_z = bhead("Hips").z
pants_top = hips_z + 0.035          # trouser waistband
shirt_hem = hips_z - 0.035          # the polo hangs over the waistband (6 cm overlap)

def covers(v, dv, which):
    """Is this body vertex under garment `which` ('shirt' or 'pants')? Returns (covered, deep);
    deep means safely inside, so the skin there can be deleted."""
    b = dominant(dv); p = v.co
    if b is None: return False, False
    if which == "shirt":
        if b in ("LeftForeArm", "RightForeArm"):
            side = "Left" if b.startswith("Left") else "Right"
            t = seg_t(p, bhead(side + "ForeArm"), btail(side + "ForeArm"))
            return (True, t < 0.84) if t < 0.985 else (False, False)     # full sleeves, to the wrist
        if b in TORSO:
            if p.z > neck_z - 0.004: return False, False          # neck
            if b == "Hips" and p.z < shirt_hem: return False, False
            return True, p.z < neck_z - 0.012 and p.z > shirt_hem + 0.02     # the collar covers the band above
        return False, False
    # pants
    if b == "Hips" or (b == "Spine" and p.z < pants_top):
        return (p.z < pants_top, p.z < pants_top - 0.02)
    if b in LEGS:
        if b in ("LeftLeg", "RightLeg"):
            side = "Left" if b.startswith("Left") else "Right"
            t = seg_t(p, bhead(side + "Leg"), btail(side + "Leg"))
            if t > 0.9: return False, False
            return True, t < 0.8
        return True, True
    return False, False

def shell(src, which, name):
    """Copy the faces of `src` covered by garment `which` into a new object."""
    me = src.data.copy(); ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for g in src.vertex_groups: ob.vertex_groups.new(name=g.name)
    bm = bmesh.new(); bm.from_mesh(me)
    dl = bm.verts.layers.deform.active
    keep = {v.index for v in bm.verts if covers(v, v[dl], which)[0]}
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in keep for v in f.verts)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(me); bm.free()
    return ob

def straighten_edges(bm, iters=25):
    for _ in range(iters):
        new = {}
        for v in bm.verts:
            if not v.is_boundary: continue
            nb = [e.other_vert(v).co for e in v.link_edges if e.is_boundary]
            if len(nb) == 2: new[v] = v.co.lerp((nb[0] + nb[1]) / 2, 0.6)
        for v, c in new.items(): v.co = c

def relax_and_offset(ob, offset_fn, iters=8):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    straighten_edges(bm)
    for _ in range(iters):
        new = {}
        for v in bm.verts:
            nb = [e.other_vert(v).co for e in v.link_edges]
            if not nb: continue
            avg = sum(nb, Vector()) / len(nb)
            k = 0.15 if v.is_boundary else 0.5
            new[v] = v.co.lerp(avg, k)
        for v, c in new.items(): v.co = c
    bm.normal_update()
    for v in bm.verts: v.co = v.co + v.normal * offset_fn(v.co)
    bm.to_mesh(ob.data); bm.free()

def finish_cloth(ob, thickness=0.0035):
    sol = ob.modifiers.new("Solidify", 'SOLIDIFY'); sol.thickness = thickness; sol.offset = -1; sol.use_rim = True
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier="Solidify")
    ob.parent = rig
    am = ob.modifiers.new("Armature", 'ARMATURE'); am.object = rig
    for p in ob.data.polygons: p.use_smooth = True

# ---------- 1b. A boy's flat chest ----------
# Flatten the front of the chest (it is under the shirt, and the shirt is made from it):
# depth-only smoothing over the chest pulls the pectoral mounds and nipples back level with
# the breastbone and the ribs below, so nothing can push the cloth into bumps.
def _sm(a, b, x): t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
bm = bmesh.new(); bm.from_mesh(body.data); bm.normal_update()
cz0, cz1 = neck_z - 0.24, neck_z - 0.035
flat = {v: _sm(0.15, 0.1, abs(v.co.x)) * _sm(cz0, cz0 + 0.04, v.co.z) * _sm(cz1, cz1 - 0.03, v.co.z)
        for v in bm.verts if v.co.y < -0.02}     # by position: the nipples' sides face sideways
flat = {v: w for v, w in flat.items() if w > 0 and os.environ.get('FLAT', '0') == '1'}
y0 = {v: v.co.y for v in flat}
for _ in range(120):
    new = {}
    for v, w in flat.items():
        nb = [e.other_vert(v).co.y for e in v.link_edges]
        new[v] = v.co.y + (sum(nb) / len(nb) - v.co.y) * 0.5 * w
    for v, y in new.items(): v.co.y = max(y, y0[v])      # only ever back (+Y), never out
print("FLATCHEST", len(flat), "max", round(max((v.co.y - y0[v] for v in flat), default=0), 4))
bm.to_mesh(body.data); bm.free()

# ---------- 2. Polo shirt and trousers from the body's own surface ----------
kurta = shell(body, "shirt", "Shirt")
def kurta_off(c):
    return 0.009 if abs(c.x) > 0.16 else 0.012     # fitted: close on the arms, easy over the body
# Extra smoothing over the chest so the kurta hangs flat from the shoulders.
bm = bmesh.new(); bm.from_mesh(kurta.data)
chest = [v for v in bm.verts if abs(v.co.x) < 0.11 and neck_z - 0.24 < v.co.z < neck_z - 0.03 and not v.is_boundary]
for _ in range(40):
    new = {v: v.co.lerp(sum((e.other_vert(v).co for e in v.link_edges), Vector()) / len(v.link_edges), 0.5) for v in chest}
    for v, c in new.items(): v.co = c
bm.to_mesh(kurta.data); bm.free()
relax_and_offset(kurta, kurta_off, iters=18)
# Cloth drapes over the chest: the front only moves forward (-Y), towards the mean of its
# neighbours, which fills the hollows between and below any bumps (a draped envelope).
def smooth(a, b, x): t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
bm = bmesh.new(); bm.from_mesh(kurta.data); bm.normal_update()
z0, z1 = shirt_hem + 0.03, neck_z - 0.03
front = {v: smooth(0.17, 0.1, abs(v.co.x)) * smooth(z0 - 0.04, z0, v.co.z) * smooth(z1 + 0.02, z1, v.co.z)
         for v in bm.verts if v.normal.y < 0.1 and not v.is_boundary}
front = {v: w for v, w in front.items() if w > 0}
from mathutils.bvhtree import BVHTree
bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
# A relaxed fit over the chest: ease the front out, then smooth it flat so no shape
# shows through (the clearance is applied, smoothed, and applied again).
for v, w in front.items(): v.co.y -= 0.008 * w
# Cloth hangs from the most prominent points: each front point takes the most forward depth
# within 5 cm (a flat envelope over the chest), then gets smoothed below.
from mathutils.kdtree import KDTree
fl = list(front.keys())
kd2 = KDTree(len(fl))
for i, v in enumerate(fl): kd2.insert(Vector((v.co.x, 0, v.co.z)), i)
kd2.balance()
env = {}
for v in fl:
    ys = [fl[i].co.y for _, i, _ in kd2.find_range(Vector((v.co.x, 0, v.co.z)), 0.12)]
    env[v] = min(ys)
for v, w in front.items(): v.co.y = v.co.y + (env[v] - v.co.y) * w
for rnd in range(2):
    for _ in range(80):
        new = {}
        for v, w in front.items():
            nb = [e.other_vert(v).co for e in v.link_edges]
            avg = sum(nb, Vector()) / len(nb)
            new[v] = v.co.lerp(Vector((v.co.x, avg.y, v.co.z)), 0.5 * w).lerp(avg, 0.12 * w)
        for v, c in new.items(): v.co = c
    # Keep clear of the body underneath.
    for v, w in front.items():
        hit = bvh.find_nearest(v.co)
        if hit[0] is None: continue
        loc, nrm = hit[0], hit[1]
        d = (v.co - loc).dot(nrm)
        want = 0.01 + 0.008 * w
        if d < want: v.co = v.co + nrm * (want - d)
# Finally pull the front taut, like cloth stretched between the shoulders and the belly: each
# point comes forward to the most forward cloth within 6 cm, then forward-only smoothing
# levels it. Hollows between mounds fill in; nothing is pulled in, so it stays clear.
taut = {v: w for v, w in front.items() if abs(v.co.x) < 0.13}
kd3 = KDTree(len(fl))
for i, v in enumerate(fl): kd3.insert(Vector((v.co.x, 0, v.co.z)), i)
kd3.balance()
y_before = {v: v.co.y for v in taut}
fwd = {v: min(fl[i].co.y for _, i, _ in kd3.find_range(Vector((v.co.x, 0, v.co.z)), 0.06)) for v in taut}
for v, w in taut.items(): v.co.y += (fwd[v] - v.co.y) * w
for _ in range(60):
    new = {}
    for v, w in taut.items():
        nb = [e.other_vert(v).co.y for e in v.link_edges]
        avg = sum(nb) / len(nb)
        new[v] = v.co.y + (min(avg, v.co.y) - v.co.y) * 0.5 * w + (avg - v.co.y) * 0.08 * w
    for v, y in new.items(): v.co.y = y
TAUT = float(os.environ.get("TAUT", "0.5"))    # halfway: flat, with a slight natural curve left
for v in taut: v.co.y = y_before[v] + (v.co.y - y_before[v]) * TAUT
for v, w in taut.items():      # keep clear of the body after the light two-way smoothing
    hit = bvh.find_nearest(v.co)
    if hit[0] is None: continue
    d = (v.co - hit[0]).dot(hit[1]); want = 0.01 + 0.008 * w
    if d < want: v.co = v.co + hit[1] * (want - d)
bm.to_mesh(kurta.data); bm.free()
shalwar = shell(body, "pants", "Pants")
if os.environ.get("DBG"):
    _bm = bmesh.new(); _bm.from_mesh(shalwar.data)
    _top = [v for v in _bm.verts if v.is_boundary and v.co.z > knee_z]
    print("DBG pants_top", pants_top, "hips_z", hips_z, "crotch_z", crotch_z)
    for v in sorted(_top, key=lambda v: v.co.z)[:12]: print("DBG low top-boundary", tuple(round(c, 3) for c in v.co))
    _b2 = bmesh.new(); _b2.from_mesh(body.data); _dl = _b2.verts.layers.deform.active
    for v in _b2.verts:
        if abs(v.co.x) < 0.012 and v.co.y > 0 and crotch_z - 0.03 < v.co.z < pants_top:
            d = v[_dl]; print("DBG seat", tuple(round(c, 3) for c in v.co), dominant(d), covers(v, d, "pants"))
def pants_off(c):
    t = max(0.0, min(1.0, (c.z - ankle_z) / (crotch_z - ankle_z)))
    return 0.009 + 0.004 * t                      # straight trousers, a little easier at the seat
relax_and_offset(shalwar, pants_off)
# Trousers bridge the cleft of the seat and the front of the crotch instead of following the
# body into them (no anatomy shows through): smooth that region, then keep clear of the skin.
bm = bmesh.new(); bm.from_mesh(shalwar.data)
mid = {v: smooth(0.075, 0.03, abs(v.co.x)) * smooth(crotch_z - 0.09, crotch_z - 0.04, v.co.z) * smooth(pants_top - 0.01, pants_top - 0.05, v.co.z)
       for v in bm.verts if not v.is_boundary}
mid = {v: w for v, w in mid.items() if w > 0}
for _ in range(40):
    new = {v: v.co.lerp(sum((e.other_vert(v).co for e in v.link_edges), Vector()) / len(v.link_edges), 0.5 * w) for v, w in mid.items()}
    for v, c in new.items(): v.co = c
for v in mid:
    hit = bvh.find_nearest(v.co)
    if hit[0] is None: continue
    d = (v.co - hit[0]).dot(hit[1])
    if d < 0.009: v.co = v.co + hit[1] * (0.009 - d)
bm.to_mesh(shalwar.data); bm.free()
# The polo hangs over the trousers: smooth its lower back over the seat, then keep its lower
# part just outside the trousers.
pbvh = BVHTree.FromObject(shalwar, bpy.context.evaluated_depsgraph_get())
bm = bmesh.new(); bm.from_mesh(kurta.data)
seat = {v: smooth(0.08, 0.035, abs(v.co.x)) * smooth(pants_top + 0.04, pants_top, v.co.z)
        for v in bm.verts if v.co.y > -0.02 and not v.is_boundary}
seat = {v: w for v, w in seat.items() if w > 0}
for _ in range(30):
    new = {v: v.co.lerp(sum((e.other_vert(v).co for e in v.link_edges), Vector()) / len(v.link_edges), 0.5 * w) for v, w in seat.items()}
    for v, c in new.items(): v.co = c
for v in bm.verts:
    if v.co.z > pants_top + 0.04: continue
    hit = pbvh.find_nearest(v.co)
    if hit[0] is None or (v.co - hit[0]).length > 0.05: continue
    d = (v.co - hit[0]).dot(hit[1])
    want = 0.015 * smooth(pants_top + 0.05, pants_top + 0.005, v.co.z)
    if d < want: v.co = v.co + hit[1] * (want - d)
bm.to_mesh(kurta.data); bm.free()


# ---------- 4. Topi (crochet kufi) shaped to the head ----------
brow_top = max((brows.matrix_world @ Vector(c)).z for c in brows.bound_box)
z_rim = brow_top + 0.014
bmh = bmesh.new(); bmh.from_mesh(body.data)
dl = bmh.verts.layers.deform.active
head_keep = {v.index for v in bmh.verts if dominant(v[dl]) == "Head" and v.co.z > z_rim}
bmesh.ops.delete(bmh, geom=[f for f in bmh.faces if not all(v.index in head_keep for v in f.verts)], context='FACES')
bmesh.ops.delete(bmh, geom=[v for v in bmh.verts if not v.link_faces], context='VERTS')
# Offset straight out from the scalp (never inside it), then level the rim.
bmh.normal_update()
orig = {v: (v.co.copy(), v.normal.copy()) for v in bmh.verts}
for v in bmh.verts: v.co = orig[v][0] + orig[v][1] * 0.0085
for _ in range(4):
    new = {}
    for v in bmh.verts:
        nb = [e.other_vert(v).co for e in v.link_edges]
        if nb and not v.is_boundary: new[v] = v.co.lerp(sum(nb, Vector()) / len(nb), 0.4)
    for v, c in new.items():
        o, n = orig[v]; d = (c - o).dot(n)
        v.co = c + n * max(0.0, 0.0075 - d)
for v in bmh.verts:
    if v.is_boundary: v.co.z = z_rim
# A smooth, round rim: relax the edge loop in plan, then roll a hem under it.
for _ in range(30):
    new = {}
    for v in bmh.verts:
        if not v.is_boundary: continue
        nb = [e.other_vert(v).co for e in v.link_edges if e.is_boundary]
        if len(nb) == 2: new[v] = v.co.lerp((nb[0] + nb[1]) / 2, 0.5)
    for v, c in new.items(): v.co.x, v.co.y = c.x, c.y
hc2 = sum((v.co for v in bmh.verts if v.is_boundary), Vector()) / max(1, sum(1 for v in bmh.verts if v.is_boundary))
edges = [e for e in bmh.edges if e.is_boundary]
for step, (dz, dr) in enumerate(((-0.003, 0.0015), (-0.0055, -0.0005))):
    ret = bmesh.ops.extrude_edge_only(bmh, edges=edges)
    nv = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]
    for v in nv:
        out = Vector((v.co.x - hc2.x, v.co.y - hc2.y, 0)).normalized()
        v.co = v.co + Vector((0, 0, dz if step == 0 else dz + 0.003)) + out * dr
    edges = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMEdge) and g.is_boundary]
# Nothing of the scalp may show through: keep every cap point at least 6 mm outside it
# (the hem rolls 2 mm closer), measured along the surface normal.
for v in bmh.verts:
    hit = bvh.find_nearest(v.co)
    if hit[0] is None: continue
    d = (v.co - hit[0]).dot(hit[1])
    want = 0.004 if v.co.z < z_rim - 0.001 else 0.006
    if d < want: v.co = v.co + hit[1] * (want - d)
# Cylindrical UVs for the crochet pattern.
uvl = bmh.loops.layers.uv.verify()
hc = Vector((0, -0.01, 0))
for f in bmh.faces:
    for lp in f.loops:
        p = lp.vert.co
        ang = (math.atan2(p.y - hc.y, p.x - hc.x) / (2 * math.pi)) % 1.0
        lp[uvl].uv = (ang * 8, (p.z - z_rim) / 0.03)
topi_me = bpy.data.meshes.new("Topi"); bmh.to_mesh(topi_me); bmh.free()
topi = bpy.data.objects.new("Topi", topi_me); bpy.context.scene.collection.objects.link(topi)
# Fix seam wrap: faces straddling the atan2 seam get u from the wrong side; average fix.
for poly in topi_me.polygons:
    us = [topi_me.uv_layers.active.data[li].uv[0] for li in poly.loop_indices]
    if max(us) - min(us) > 4:
        for li in poly.loop_indices:
            if topi_me.uv_layers.active.data[li].uv[0] < 4: topi_me.uv_layers.active.data[li].uv[0] += 8
topi.vertex_groups.new(name="mixamorig:Head").add(list(range(len(topi_me.vertices))), 1.0, 'REPLACE')
for g in [g for g in topi.vertex_groups if g.name != "mixamorig:Head"]: topi.vertex_groups.remove(g)

# Short crop painted on the scalp (vertex colours) instead of hair cards.
bm = bmesh.new(); bm.from_mesh(body.data)
dl = bm.verts.layers.deform.active
headv = [v for v in bm.verts if dominant(v[dl]) == "Head"]
ear_top = max((v.co.z for v in headv if abs(v.co.x) > 0.066), default=brow_top)
hc_y = bhead("Head").y
rng = np.random.default_rng(7)
def smooth(a, b, x): t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
col = bm.loops.layers.color.new("Col")
# Each ear as an oval in the side view (its extent plus a margin): the hair is cut in a clean
# rounded line around it.
_ear = [v.co for v in headv if abs(v.co.x) > 0.064 and v.co.z < ear_top + 0.004 and abs(v.co.y - hc_y) < 0.03]
ear_cy = sum(p.y for p in _ear) / len(_ear); ear_cz = (max(p.z for p in _ear) + min(p.z for p in _ear)) / 2
ear_ry = (max(p.y for p in _ear) - min(p.y for p in _ear)) / 2 + 0.0015
ear_rz = (max(p.z for p in _ear) - min(p.z for p in _ear)) / 2 + 0.0015
ear_zmax = max(p.z for p in _ear)
print("EAR oval", round(ear_cy, 3), round(ear_cz, 3), round(ear_ry, 3), round(ear_rz, 3))
def hair_amount(p):
    """1 where the head is covered with hair, 0 on bare skin; None on the ears."""
    # 0 at the face, 1 behind the ears; below the top of the ear the change moves back to just
    # behind the ear, so the line curves round the ear and down to the nape.
    t = smooth(ear_cz + ear_rz, ear_cz, p.z)
    y0 = (hc_y - 0.035) * (1 - t) + (ear_cy + 0.4 * ear_ry) * t
    y1 = hc_y * (1 - t) + (ear_cy + ear_ry + 0.014) * t
    behind = smooth(y0, y1, p.y)
    side = smooth(0.035, 0.06, abs(p.x))                    # 0 mid-forehead, 1 at the temples
    # A boy's short cut: the front is under the cap; hair shows at the temples, in short
    # sideburns, above and behind the ears, and down to a neat nape.
    front = (brow_top + 0.03) * (1 - side) + (brow_top + 0.004) * side
    line = front * (1 - behind) + (neck_z + 0.022) * behind
    k = smooth(line - 0.004, line + 0.006, p.z)
    if abs(p.x) > 0.045:
        # Sideburns: a neat band in front of each ear, a straight front edge about 1 cm ahead of
        # the ear and a square end at mid-ear height.
        ear_front = ear_cy - (ear_ry - 0.0015)
        y_f, z_b = ear_front - 0.011, ear_cz + 0.002
        if p.y < ear_cy:
            sbk = smooth(y_f - 0.0015, y_f + 0.0015, p.y) * smooth(z_b - 0.0015, z_b + 0.0015, p.z) * smooth(0.045, 0.055, abs(p.x))
            sbk *= smooth(ear_front - 0.0065, ear_front - 0.009, p.y)   # stops just before the ear (and its front bump)
            k = max(k, sbk)
        # A clean band of bare skin all round the ear (the hair never touches it).
        d = math.hypot((p.y - ear_cy) / ear_ry, (p.z - ear_cz) / ear_rz)
        if d < 1.0 and abs(p.x) > 0.06: return None                     # the ear itself
        fr = smooth(ear_cy, ear_cy - ear_ry, p.y) * smooth(ear_cz + 0.5 * ear_rz, ear_cz, p.z)
        ry_g = ear_ry + 0.0015 + 0.006 * fr                             # more room only beside the front of the ear, close over the top
        dg = math.hypot((p.y - ear_cy) / ry_g, (p.z - ear_cz) / ear_rz)
        k *= smooth(1.0, 1.07, dg)                                      # a slim gap: close to the ear, never on it
        # where the top of the rim joins the head, in front: keep that little corner bare too
        k *= smooth(0.0045, 0.0075, math.hypot(p.y - (ear_front + 0.003), p.z - (ear_zmax - 0.003)))
    return k
mask = {}
ear_vs = set()
for v in bm.verts:
    m = 0.0
    if dominant(v[dl]) in ("Head", "Neck"):
        m = hair_amount(v.co)
        if m is None: m = 0.0; ear_vs.add(v.index)
    mask[v] = m
for f in bm.faces:
    for lp in f.loops:
        m = smooth(0.5, 0.9, mask[lp.vert])                  # only under the hair layer
        k = 1 - m * (0.84 + 0.1 * rng.random())
        lp[col] = (k, k * 0.96, k * 0.93, 1.0)
hair_mask = {v.index: mask[v] for v in bm.verts}
near_ear = {o.index for v in bm.verts if v.index in ear_vs for e in v.link_edges for o in (e.other_vert(v),)}
bm.to_mesh(body.data); bm.free()
body.data.color_attributes.active_color_name = "Col"
bpy.data.objects.remove(hair)
hair = None

# Short boy's haircut: a thin layer of hair over the crop, thickest on the head and tapering
# to nothing at the hairline (temples, short sideburns, around the ears, the nape). Most of it
# is under the topi; what shows is the neat edge below the cap.
hme = body.data.copy(); hair = bpy.data.objects.new("Hair", hme)
bpy.context.scene.collection.objects.link(hair)
for g in body.vertex_groups: hair.vertex_groups.new(name=g.name)
for ca in list(hme.color_attributes): hme.color_attributes.remove(ca)
bm = bmesh.new(); bm.from_mesh(hme); bm.normal_update()
mlay = bm.verts.layers.float.new("hair_m")       # survives the deletions below (indices do not)
for v in bm.verts: v[mlay] = hair_mask[v.index]
# Keep every face touching the crop plus one ring; the layer sinks under the skin where the
# crop fades, so the visible hairline is the smooth line where it meets the skin, not a face edge.
keep = {f for f in bm.faces if max(hair_mask[v.index] for v in f.verts) > 0.01}
keep |= {g for f in keep for v in f.verts for g in v.link_faces}
keep = {f for f in keep if not any(v.index in ear_vs for v in f.verts)}
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in keep], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.normal_update()
# Subdivide so the hairline (where the layer meets the skin) follows the curve, not the faces.
bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=3, use_grid_fill=True)
bm.normal_update()
for v in bm.verts:
    m = hair_amount(v.co)
    v[mlay] = 0.0 if m is None else m
# Cut the layer cleanly along the hairline (amount 0.5): each edge vertex moves to where the
# line crosses its edges, so the edge is a smooth curve, not the steps of the faces.
cross = {}
for e in bm.edges:
    a, b = e.verts
    for i_, o_ in ((a, b), (b, a)):
        if i_[mlay] >= 0.5 > o_[mlay]:
            t = (i_[mlay] - 0.5) / max(1e-6, i_[mlay] - o_[mlay])
            cross.setdefault(i_, []).append(i_.co.lerp(o_.co, t))
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[mlay] < 0.5], context='VERTS')
for v, pts in cross.items():
    if v.is_valid: v.co = sum(pts, Vector()) / len(pts)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
# Smooth the hairline along itself (each edge vertex towards its two neighbours on the edge),
# then let the next row in relax too, so no teeth remain.
for it in range(24):
    bnd = [v for v in bm.verts if v.is_boundary]
    new = {}
    for v in bnd:
        nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
        if len(nb) == 2: new[v] = v.co.lerp((nb[0].co + nb[1].co) / 2, 0.5)
    for v, c in new.items(): v.co = c
    if it % 3 == 2:
        inner = {o for v in bnd for e in v.link_edges for o in (e.other_vert(v),) if not o.is_boundary}
        upd = {o: o.co.lerp(sum((e.other_vert(o).co for e in o.link_edges), Vector()) / len(o.link_edges), 0.4) for o in inner}
        for o, c in upd.items(): o.co = c
bm.normal_update()
bm.verts.index_update()
hcen = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
out_sign = 1.0 if sum((v.co - hcen).dot(v.normal) for v in bm.verts) > 0 else -1.0
print("HAIR normals outward" if out_sign > 0 else "HAIR normals inward: flipping the offset")
for v in bm.verts:
    v.co = v.co + v.normal * out_sign * (0.0007 + 0.003 * smooth(0.5, 0.95, v[mlay]))   # thin at the edge, fuller above
print("HAIR mask>0.5", sum(1 for v in bm.verts if v[mlay] > 0.5), "of", len(bm.verts))
bm.to_mesh(hme); bm.free()
for poly in hair.data.polygons: poly.use_smooth = True
hair.parent = rig
hair.modifiers.new("Armature", 'ARMATURE').object = rig
# Under the cap the hair must stay inside it (the cap gets 4 mm thickness inwards later):
# any hair vertex within 6 mm of the cap's outer surface, or outside it, is pulled in to 6 mm.
from mathutils.bvhtree import BVHTree as _BVH
_tb = bmesh.new(); _tb.from_mesh(topi.data); _tb.transform(topi.matrix_world)
_tbvh = _BVH.FromBMesh(_tb)
_hc = bhead("Head")
_moved = 0
for v in hair.data.vertices:
    co = hair.matrix_world @ v.co
    out = (co - _hc).normalized()
    hit = _tbvh.ray_cast(_hc, out)          # where the cap is, straight out from the head centre
    if hit[0] is None: continue
    limit = (hit[0] - _hc).length - 0.006
    if (co - _hc).length > limit:
        v.co = hair.matrix_world.inverted() @ (_hc + out * limit); _moved += 1
_tb.free()
print("HAIR pulled under cap", _moved)
print("HAIR faces", len(hair.data.polygons))

# ---------- 5. Remove skin that is safely inside the clothes ----------
bm = bmesh.new(); bm.from_mesh(body.data)
dl = bm.verts.layers.deform.active
deep = {v.index for v in bm.verts if covers(v, v[dl], 'shirt')[1] or covers(v, v[dl], 'pants')[1]}
bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.index in deep for v in f.verts)], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(body.data); bm.free()

# ---------- 6. Materials (plain PBR for glTF) ----------
def load_px(path):
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    return img, a
def save_img(name, arr, size=None, fmt='JPEG'):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=(fmt == 'PNG'))
    img.pixels.foreach_set(arr.ravel())
    if size and size != w: img.scale(size, size)
    ext = 'jpg' if fmt == 'JPEG' else 'png'
    img.filepath_raw = os.path.join(TEX, f"{name}.{ext}"); img.file_format = fmt
    img.save()
    return img
def mat(name, img=None, color=(1, 1, 1), rough=0.6, alpha=False, metal=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    nt = m.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value = (*color, 1); bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in bs.inputs: bs.inputs['Specular IOR Level'].default_value = spec
    if img is not None:
        tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img
        nt.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
        if alpha:
            nt.links.new(tx.outputs['Alpha'], bs.inputs['Alpha'])
            try: m.surface_render_method = 'BLENDED'
            except Exception: m.blend_method = 'BLEND'
    return m
def set_mats(ob, mats):
    ob.data.materials.clear()
    for m in mats: ob.data.materials.append(m)

# Skin: warm the light skin texture towards a South Asian brown, keep its detail.
_, skin = load_px(os.path.join(D, "skins/young_caucasian_male/young_lightskinned_male_diffuse.png"))
rgb = skin[..., :3]
mask = rgb.mean(axis=2) > 0.05
# One even tone on all skin (face, neck, hands, feet): split the texture into broad colour
# (a masked blur over ~5% of the atlas) and fine detail; keep the detail and only a little of
# the broad variation (cheeks, lips), then set the tone.
def _blur(a, n=64):
    h, w = a.shape[:2]
    small = a.reshape(n, h // n, n, w // n, -1).mean(axis=(1, 3))
    yy = (np.arange(h) + 0.5) / h * n - 0.5; xx = (np.arange(w) + 0.5) / w * n - 0.5
    y0 = np.clip(np.floor(yy).astype(int), 0, n - 1); y1 = np.clip(y0 + 1, 0, n - 1); fy = np.clip(yy - y0, 0, 1)[:, None, None]
    x0 = np.clip(np.floor(xx).astype(int), 0, n - 1); x1 = np.clip(x0 + 1, 0, n - 1); fx = np.clip(xx - x0, 0, 1)[None, :, None]
    r0 = small[y0][:, x0] * (1 - fx) + small[y0][:, x1] * fx
    r1 = small[y1][:, x0] * (1 - fx) + small[y1][:, x1] * fx
    return r0 * (1 - fy) + r1 * fy
mk = mask[..., None].astype(np.float32)
low = _blur(rgb * mk) / np.maximum(_blur(mk), 1e-4)
mean = rgb[mask].mean(axis=0)
detail = rgb / np.maximum(low, 1e-4)
broad = (low / mean) ** 0.25                 # keep a quarter of the broad variation
target = np.array([0.80, 0.46, 0.30])       # linear ≈ sRGB (231, 181, 149): 20% fairer than before
skin[..., :3] = np.where(mask[..., None], np.clip(target * broad * detail, 0, 1), rgb)
skin[..., 3] = 1
skin_img = save_img("child_skin", skin, 2048)
m_skin = mat("Skin", skin_img, rough=0.52, spec=0.45)
nt = m_skin.node_tree
vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = "Col"
mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1.0
tx = next(n for n in nt.nodes if n.type == 'TEX_IMAGE'); bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
nt.links.new(tx.outputs['Color'], mul.inputs[6]); nt.links.new(vc.outputs['Color'], mul.inputs[7]); nt.links.new(mul.outputs[2], bs.inputs['Base Color'])
set_mats(body, [m_skin])
# Hair colour: near-black brown with a fine grain of strands.
nh = 1024
g1 = np.random.default_rng(11).normal(0, 1, (nh, nh)).astype(np.float32)
from numpy.fft import fft2, ifft2
kk = np.hypot(*np.meshgrid(np.fft.fftfreq(nh), np.fft.fftfreq(nh)))
grain = np.real(ifft2(fft2(g1) * np.exp(-(kk / 0.18) ** 2))); grain = (grain - grain.mean()) / grain.std()
hp = np.ones((nh, nh, 4), np.float32)
hp[..., :3] = np.array([0.2, 0.145, 0.105]) * (1 + 0.32 * np.clip(grain, -2, 2))[..., None]   # sRGB values: a very dark brown
m_hair = mat("Hair", save_img("child_hair", hp, 512), rough=0.42, spec=0.55)
set_mats(hair, [m_hair])
for p in body.data.polygons: p.material_index = 0

_, eye = load_px(os.path.join(D, "eyes/materials/brown_eye.png"))
sat = eye[..., :3].max(axis=2) - eye[..., :3].min(axis=2)
# Darken only the irises (round masks about each iris centre, not the veins on the whites),
# to a warm brown that still reads against the lids.
H_, W_ = eye.shape[:2]
yy_, xx_ = np.mgrid[0:H_, 0:W_]
lum = eye[..., :3].mean(axis=2)
iris = np.zeros((H_, W_), bool)
for half in (xx_ + yy_ < W_, xx_ + yy_ >= W_):
    m_ = half & (lum < 0.35) & (eye[..., 3] > 0.5)
    cy_, cx_ = yy_[m_].mean(), xx_[m_].mean()
    r_ = np.sqrt(m_.sum() / np.pi) * 1.2
    iris |= (np.hypot(yy_ - cy_, xx_ - cx_) < r_) & (sat > 0.05)
    print("IRIS", round(cx_), round(cy_), round(r_))
iris = iris[..., None]
eye[..., :3] = np.where(iris, eye[..., :3] * np.array([0.62, 0.55, 0.5]), eye[..., :3])
set_mats(eyes, [mat("Eyes", save_img("child_eyes", eye, 512, fmt='PNG'), rough=0.08, spec=0.7, alpha=True)])
for p in eyes.data.polygons: p.material_index = 0

def tinted_alpha(src, name, color, size):
    _, a = load_px(src)
    a[..., :3] = a[..., :3] * 0.25 + np.array(color) * 0.75 * a[..., :3].mean(axis=2, keepdims=True) * 2.2
    a[..., :3] = np.clip(a[..., :3], 0, 1)
    return save_img(name, a, size, fmt='PNG')
set_mats(brows, [mat("Brows", tinted_alpha(os.path.join(D, "eyebrows/eyebrow001/eyebrow001.png"), "child_brows", (0.03, 0.02, 0.015), 256), rough=0.8, alpha=True)])
set_mats(lashes, [mat("Lashes", tinted_alpha(os.path.join(D, "eyelashes/eyelashes01/eyelashes01.png"), "child_lashes", (0.02, 0.015, 0.01), 256), rough=0.8, alpha=True)])

# Cloth: navy pique knit for the polo, ribbed collar and cuffs, black twill trousers.
# (Values are written as sRGB bytes.)
yy, xx = np.mgrid[0:512, 0:512] / 512.0
rng3 = np.random.default_rng(3)
pique = 0.5 + 0.5 * np.sin(xx * 2 * np.pi * 110) * np.sin(yy * 2 * np.pi * 110)
noise = rng3.normal(0, 1, (512, 512)).astype(np.float32) * 0.01
def cloth_tex(base, patt, amp):
    a = np.zeros((512, 512, 4), np.float32); a[..., 3] = 1
    a[..., :3] = np.clip(np.array(base) * (1 - amp + amp * patt[..., None]) + noise[..., None], 0, 1)
    return a
NAVY = (0.2, 0.27, 0.47)
m_cotton = mat("Polo", save_img("polo", cloth_tex(NAVY, pique, 0.12), 512), rough=0.9, spec=0.3)
rib = 0.5 + 0.5 * np.sin(xx * 2 * np.pi * 160)
m_emb = mat("PoloRib", save_img("polo_rib", cloth_tex(tuple(c * 0.85 for c in NAVY), rib, 0.22), 512), rough=0.85, spec=0.3)
twill = 0.5 + 0.5 * np.sin((xx + yy) * 2 * np.pi * 120)
m_shal = mat("Pants", save_img("pants", cloth_tex((0.075, 0.075, 0.085), twill, 0.25), 512), rough=0.8, spec=0.35)

# Ribbing on the cuffs (faces near the open edge at the wrists).
set_mats(kurta, [m_cotton, m_emb])
bm = bmesh.new(); bm.from_mesh(kurta.data)
bnd = [v.co.copy() for v in bm.verts if v.is_boundary and abs(v.co.x) > 0.18]
for f in bm.faces:
    c = f.calc_center_median()
    d = min((c - b).length for b in bnd) if bnd else 1
    f.material_index = 1 if (d < 0.02 and abs(c.x) > 0.18) else 0
bm.to_mesh(kurta.data); bm.free()
set_mats(shalwar, [m_shal])

# Crochet topi texture.
H, W = 256, 1024
yy, xx = np.mgrid[0:H, 0:W]
cells = ((xx % 16) - 8) ** 2 + ((yy % 12) - 6) ** 2 * 1.6 < 14
rows = (yy % 12) < 2
tp = np.zeros((H, W, 4), np.float32); tp[..., 3] = 1
tp[..., :3] = np.array([0.90, 0.88, 0.82])
tp[cells] *= 0.78
tp[rows] *= 0.9
m_topi = mat("Topi", save_img("topi", tp, None), rough=0.95, spec=0.2)
set_mats(topi, [m_topi])

# Polo collar: a stand that starts under the shirt's neck edge (so no gap shows), rises up
# the neck, then folds out and down over the shoulders. Weighted like the skin under it.
bm = bmesh.new(); bm.from_mesh(body.data)
dl = bm.verts.layers.deform.active
def neck_ring(z, tol=0.008):
    pts = np.array([(v.co.x, v.co.y) for v in bm.verts if dominant(v[dl]) in ("Neck", "Spine2", "LeftShoulder", "RightShoulder") and abs(v.co.z - z) < tol])
    return pts
base_pts = neck_ring(neck_z - 0.006)
ncx, ncy = base_pts[:, 0].mean(), base_pts[:, 1].mean()
def rad(pts, u): return float(((pts - [ncx, ncy]) @ u).max())
# Stand: a band up the neck. Fall: a separate thin flap (a crisp fold, not a rounded roll)
# that lies on the shirt, with two collar points at the front and a light tipping stripe.
sbvh = BVHTree.FromObject(kurta, bpy.context.evaluated_depsgraph_get())
N = 64
FRONT = 1.5 * math.pi
def dfront(th): d = abs((th - FRONT + math.pi) % (2 * math.pi) - math.pi); return d
def on_shirt(p, lift=0.004):
    hit = sbvh.ray_cast(Vector((p.x, p.y, neck_z + 0.08)), Vector((0, 0, -1)))
    if hit[0] is None: return p
    return Vector((p.x, p.y, max(p.z, hit[0].z + lift)))
cbm = bmesh.new(); cuv = cbm.loops.layers.uv.new("UVMap")
stand_prof = [(neck_z - 0.03, 0.003), (neck_z - 0.008, 0.004), (neck_z + 0.0055, 0.0045)]
stand = []
for z, extra in stand_prof:
    pts = neck_ring(min(z, neck_z + 0.0055)) if z > neck_z - 0.01 else base_pts
    if len(pts) < 8: pts = base_pts
    stand.append([cbm.verts.new((ncx + (rad(pts, np.array([math.cos(t), math.sin(t)])) + extra) * math.cos(t),
                                 ncy + (rad(pts, np.array([math.cos(t), math.sin(t)])) + extra) * math.sin(t), z))
                  for t in (2 * math.pi * i / N for i in range(N))])
top_pts = neck_ring(neck_z + 0.0055)
if len(top_pts) < 8: top_pts = base_pts
FALL = 4
fall = []
for k in range(FALL + 1):
    t_ = k / FALL
    ring = []
    for i in range(N):
        th = 2 * math.pi * i / N; u = np.array([math.cos(th), math.sin(th)])
        d = dfront(th)
        point = 0.0077 * max(0.0, 1 - abs(d - 0.33) / 0.2)          # the two collar points
        r0 = rad(top_pts, u) + 0.0055
        r1 = rad(base_pts, u) + 0.009 + point
        r = r0 + (r1 - r0) * t_
        z = neck_z + 0.0055 - (0.0077 + 0.6 * point) * t_
        ring.append((on_shirt(Vector((ncx + r * u[0], ncy + r * u[1], z)), 0.004 + 0.002 * (1 - t_)), on_shirt(Vector((ncx + r * u[0], ncy + r * u[1], -9)), 0.0035).z))
    zs = [p_.z for p_, _ in ring]
    for _ in range(6):
        zs = [(zs[i - 1] + 2 * zs[i] + zs[(i + 1) % N]) / 4 for i in range(N)]
    fall.append([cbm.verts.new(Vector((p_.x, p_.y, max(z_, floor_)))) for (p_, floor_), z_ in zip(ring, zs)])
def quad(a, b, c, d, uvs):
    f = cbm.faces.new([a, b, c, d])
    for lp, uv_ in zip(f.loops, uvs): lp[cuv].uv = uv_
for k in range(len(stand) - 1):
    for i in range(N):
        th = 2 * math.pi * i / N
        quad(stand[k][i], stand[k][(i + 1) % N], stand[k + 1][(i + 1) % N], stand[k + 1][i],
             [(i / N * 24, 0.3), ((i + 1) / N * 24, 0.3), ((i + 1) / N * 24, 0.3), (i / N * 24, 0.3)])
for k in range(FALL):
    for i in range(N):
        th, th2 = 2 * math.pi * i / N, 2 * math.pi * (i + 1) / N
        if dfront(th) < 0.12 or dfront(th2) < 0.12: continue
        quad(fall[k][i], fall[k][(i + 1) % N], fall[k + 1][(i + 1) % N], fall[k + 1][i],
             [(i / N * 24, k / FALL), ((i + 1) / N * 24, k / FALL), ((i + 1) / N * 24, (k + 1) / FALL), (i / N * 24, (k + 1) / FALL)])
bm.free()
bmesh.ops.delete(cbm, geom=[v for v in cbm.verts if not v.link_faces], context='VERTS')
cbm.normal_update()
for f in cbm.faces:
    c = f.calc_center_median()
    out = Vector((c.x - ncx, c.y - ncy, 0)).normalized()
    want = out if c.z > neck_z + 0.0 and f.normal.z < 0.5 and f.calc_area() < 0 else out
    # stand faces face outwards; fall faces face up and out
    ref = out + Vector((0, 0, 0.8 if c.z < neck_z + 0.006 and (c.xy - Vector((ncx, ncy))).length > 0.06 else 0))
    if f.normal.dot(ref) < 0: f.normal_flip()
cbm.verts.ensure_lookup_table()
cme = bpy.data.meshes.new("Collar"); cbm.to_mesh(cme); cbm.free()
collar = bpy.data.objects.new("Collar", cme); bpy.context.scene.collection.objects.link(collar)
for g in body.vertex_groups:
    if g.name.startswith("mixamorig:"): collar.vertex_groups.new(name=g.name)
dt = collar.modifiers.new("DT", 'DATA_TRANSFER'); dt.object = body
dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
bpy.context.view_layer.objects.active = collar
for o in bpy.context.selected_objects: o.select_set(False)
collar.select_set(True)
bpy.ops.object.modifier_apply(modifier="DT")
# The stand follows the neck skin under it (minus the arms); the flap copies the weights of
# the shirt point it lies on, so the two move together in every posture.
from mathutils.kdtree import KDTree as _KD
kv = kurta.data.vertices
kkd = _KD(len(kv))
for v in kv: kkd.insert(v.co, v.index)
kkd.balance()
kname = {g.index: g.name for g in kurta.vertex_groups}
for v in collar.data.vertices:
    co = v.co
    dxy = math.hypot(co.x - ncx, co.y - ncy)
    flap = dxy - rad(base_pts, np.array([co.x - ncx, co.y - ncy]) / max(1e-6, dxy)) > 0.011
    if flap:
        src = kv[kkd.find(co)[1]]
        ws = {collar.vertex_groups[kname[g.group]].index: g.weight for g in src.groups if kname[g.group].startswith("mixamorig:") and kname[g.group] in collar.vertex_groups}
    else:
        ws = {g.group: g.weight for g in v.groups if collar.vertex_groups[g.group].name.startswith("mixamorig:") and not any(k in collar.vertex_groups[g.group].name for k in ("Arm", "Hand"))}
        # the band is sewn to the shirt: it only partly turns with the neck
        t0 = sum(ws.values()) or 1.0
        ws = {g: w / t0 * 0.4 for g, w in ws.items()}
        sp = collar.vertex_groups["mixamorig:Spine2"].index
        ws[sp] = ws.get(sp, 0) + 0.6
    tot = sum(ws.values())
    for g in list(v.groups): collar.vertex_groups[g.group].remove([v.index])
    if tot < 1e-4: ws, tot = {collar.vertex_groups["mixamorig:Spine2"].index: 1.0}, 1.0
    for g, w in ws.items(): collar.vertex_groups[g].add([v.index], w / tot, 'REPLACE')
ct = np.zeros((256, 64, 4), np.float32); ct[..., 3] = 1
vv = (np.arange(256) / 256.0)[:, None]
ct[..., :3] = np.array(NAVY) * 0.82 * (0.9 + 0.1 * np.sin(np.arange(64) / 64 * 2 * np.pi * 8))[None, :, None]
stripe = ((vv > 0.72) & (vv < 0.77)) | ((vv > 0.83) & (vv < 0.86))
ct[..., :3] = np.where(stripe[..., None], np.array((0.86, 0.84, 0.78)), ct[..., :3])
m_collar = mat("PoloCollar", save_img("polo_collar", ct, None), rough=0.85, spec=0.3)
set_mats(collar, [m_collar])

# Arms must not drag the chest: strip arm weights from the middle of the body and kurta.
def strip_arm_weights(ob, half=0.125):
    # Arms and collarbones must not drag the chest: over the middle of the body their weight
    # goes to Spine2, fading out towards the armpits (a hard edge would crease the cloth).
    names = {g.index: g.name for g in ob.vertex_groups}
    arm = {i for i, n in names.items() if any(k in n for k in ("LeftArm", "RightArm", "LeftShoulder", "RightShoulder"))}
    sp2 = ob.vertex_groups["mixamorig:Spine2"].index
    bm = bmesh.new(); bm.from_mesh(ob.data)
    dl = bm.verts.layers.deform.active
    for v in bm.verts:
        if not (neck_z - 0.22 < v.co.z < neck_z - 0.01): continue
        f = smooth(half + 0.045, half - 0.03, abs(v.co.x)) * smooth(neck_z - 0.22, neck_z - 0.18, v.co.z) * smooth(neck_z - 0.01, neck_z - 0.04, v.co.z)
        if f <= 0: continue
        d = v[dl]
        moved = 0.0
        for i in list(d.keys()):
            if i in arm: moved += d[i] * f; d[i] = d[i] * (1 - f)
        d[sp2] = d.get(sp2, 0.0) + moved
        tot = sum(d.values())
        for i in list(d.keys()):
            if d[i] / tot < 1e-3: del d[i]
            else: d[i] = d[i] / tot
    bm.to_mesh(ob.data); bm.free()
strip_arm_weights(kurta)
strip_arm_weights(collar)
# Smooth the bone weights around the shirt's hem, so it moves as one band when the hips
# bend instead of zig-zagging between the pelvis and the thighs.
def smooth_bone_weights(ob, sel, iters=25, k=0.6):
    isbone = {g.index for g in ob.vertex_groups if g.name.startswith("mixamorig:")}
    bm = bmesh.new(); bm.from_mesh(ob.data)
    dl = bm.verts.layers.deform.active
    vs = [v for v in bm.verts if sel(v.co)]
    W = {v: {g: w for g, w in v[dl].items() if g in isbone} for v in bm.verts}
    for _ in range(iters):
        new = {}
        for v in vs:
            acc = {}
            nb = [e.other_vert(v) for e in v.link_edges]
            for o in nb:
                for g, w in W[o].items(): acc[g] = acc.get(g, 0) + w / len(nb)
            mixw = {g: W[v].get(g, 0) * (1 - k) + acc.get(g, 0) * k for g in set(acc) | set(W[v])}
            tot = sum(mixw.values()) or 1
            new[v] = {g: w / tot for g, w in mixw.items() if w / tot > 1e-3}
        W.update(new)
    for v in vs:
        d = v[dl]
        for g in [g for g in d.keys() if g in isbone]: del d[g]
        for g, w in W[v].items(): d[g] = w
    bm.to_mesh(ob.data); bm.free()
smooth_bone_weights(kurta, lambda c: c.z < pants_top + 0.02)
strip_arm_weights(body)

# ---------- 6b. Tidy garment openings ----------
# The `n_open` longest boundary loops are real openings (neck, hem, cuffs / waist, ankles):
# make their edges straight hems. Any other loop is a stray hole (e.g. at a seam): fill it.
def boundary_loops(bm):
    edges = {e for e in bm.edges if e.is_boundary}
    loops = []
    while edges:
        e0 = edges.pop(); loop = {e0}; stack = list(e0.verts)
        while stack:
            v = stack.pop()
            for e in v.link_edges:
                if e in edges: edges.discard(e); loop.add(e); stack.extend(e.verts)
        loops.append(loop)
    return sorted(loops, key=len, reverse=True)

def tidy_openings(ob, n_open):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    loops = boundary_loops(bm)
    for loop in loops[n_open:]:
        bmesh.ops.holes_fill(bm, edges=list(loop), sides=0)
    print("OPENINGS", ob.name, [len(l) for l in loops[:n_open]], "filled", [len(l) for l in loops[n_open:]])
    for loop in loops[:n_open]:
        vs = list({v for e in loop for v in e.verts})
        c = sum((v.co for v in vs), Vector()) / len(vs)
        if c.z > neck_z - 0.05: continue                     # neck: covered by the collar
        if abs(c.x) > 0.18:                                    # cuff: square to the forearm
            side = "Left" if c.x > 0 else "Right"
            ax = (btail(side + "ForeArm") - bhead(side + "ForeArm")).normalized()
        else:
            ax = Vector((0, 0, 1))                             # hem, waist, ankle: level
        m = sum(v.co.dot(ax) for v in vs) / len(vs)
        for v in vs: v.co = v.co + ax * (m - v.co.dot(ax))
        # ease the next ring in so the hem doesn't crease
        for v in vs:
            for e in v.link_edges:
                o = e.other_vert(v)
                if not o.is_boundary: o.co = o.co + ax * ((m - o.co.dot(ax)) * 0.35)
    bm.normal_update()
    bm.to_mesh(ob.data); bm.free()

tidy_openings(kurta, 4)
tidy_openings(shalwar, 3)

# ---------- 7. Finish cloth objects and rig them ----------
finish_cloth(kurta, 0.004)
finish_cloth(shalwar, 0.004)
finish_cloth(topi, 0.004)
finish_cloth(collar, 0.003)

# Polo placket and buttons, built like the real thing: a separate band of the shirt fabric sewn
# over the front opening (raised, with a stitched outline and a square bottom), and three white
# buttons sewn onto that band. Both move with the shirt under them.
kd_s = KDTree(len(kurta.data.vertices))
for v in kurta.data.vertices: kd_s.insert(kurta.matrix_world @ v.co, v.index)
kd_s.balance()
sbvh2 = BVHTree.FromObject(kurta, bpy.context.evaluated_depsgraph_get())
def shirt_front(x, z):
    hit = sbvh2.ray_cast(Vector((x, -0.4, z)), Vector((0, 1, 0)))
    if hit[0] is None: return None, None
    n_ = hit[1].normalized()
    return hit[0], (n_ if n_.y < 0 else -n_)
PL_W, PL_TOP, PL_BOT, PL_LIFT, PL_T = 0.019, neck_z - 0.006, neck_z - 0.092, 0.0026, 0.0016
pbm = bmesh.new(); puv = pbm.loops.layers.uv.new("UVMap")
NX, NZ = 6, 22
grid = []
for j in range(NZ + 1):
    z = PL_TOP + (PL_BOT - PL_TOP) * j / NZ
    row = []
    for i in range(NX + 1):
        x = -PL_W / 2 + PL_W * i / NX
        loc, nrm = shirt_front(x, z)
        row.append((pbm.verts.new(loc + nrm * PL_LIFT), (i / NX, 1 - j / NZ)))
    grid.append(row)
for j in range(NZ):
    for i in range(NX):
        q = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
        f = pbm.faces.new([v for v, _ in q])
        for lp, (_, uv) in zip(f.loops, q): lp[puv].uv = uv
bmesh.ops.recalc_face_normals(pbm, faces=pbm.faces)
for f in pbm.faces:
    if f.normal.y > 0: f.normal_flip()
pme = bpy.data.meshes.new("Placket"); pbm.to_mesh(pme); pbm.free()
placket = bpy.data.objects.new("Placket", pme); bpy.context.scene.collection.objects.link(placket)
# Fabric with a fine stitched outline (lighter navy thread, dashed), 2 mm in from the edges.
ph_, pw_ = 512, 128
yy_, xx_ = np.mgrid[0:ph_, 0:pw_]
u_, v_ = (xx_ + 0.5) / pw_, (yy_ + 0.5) / ph_            # v = 0 at the bottom of the image
inset_u, inset_v = 0.1, 0.1 * PL_W / (PL_TOP - PL_BOT)
dash = ((yy_ // 6) % 2 == 0)
line_side = (np.abs(u_ - inset_u) < 0.022) | (np.abs(u_ - (1 - inset_u)) < 0.022)
line_side &= (v_ > inset_v - 0.004)
line_bot = (np.abs(v_ - inset_v) < 0.006) & (u_ > inset_u - 0.02) & (u_ < 1 - inset_u + 0.02) & ((xx_ // 6) % 2 == 0)
pk = np.zeros((ph_, pw_, 4), np.float32); pk[..., 3] = 1
rng_p = np.random.default_rng(3)
pk[..., :3] = np.array(NAVY) * (0.95 + 0.06 * rng_p.random((ph_, pw_)))[..., None]
stitch = ((line_side & dash) | line_bot)[..., None]
pk[..., :3] = np.where(stitch, np.array(NAVY) * 1.4, pk[..., :3])
edge = np.minimum(np.minimum(u_, 1 - u_), v_ * (PL_TOP - PL_BOT) / PL_W)
pk[..., :3] *= (0.82 + 0.18 * np.clip(edge / 0.06, 0, 1))[..., None]   # a slight shade at the sewn edge
set_mats(placket, [mat("Placket", save_img("polo_placket", pk, None), rough=0.9, spec=0.3)])
for g in kurta.vertex_groups: placket.vertex_groups.new(name=g.name)
for v in placket.data.vertices:
    src = kurta.data.vertices[kd_s.find(placket.matrix_world @ v.co)[1]]
    for g in src.groups: placket.vertex_groups[kurta.vertex_groups[g.group].name].add([v.index], g.weight, 'REPLACE')
finish_cloth(placket, PL_T)     # outer face PL_LIFT above the shirt, back just above it: a raised band
print("PLACKET", len(placket.data.polygons))

# Buttons sewn onto the placket: small domed discs with a thread cross, on its centre line.
bbm = bmesh.new()
BTN_R = 0.0041
centres = []
for dz in (0.031, 0.053, 0.075):
    loc, nrm = shirt_front(0, neck_z - dz)
    if loc is None: continue
    base = loc + nrm * PL_LIFT
    t1 = nrm.cross(Vector((0, 0, 1))).normalized(); t2 = nrm.cross(t1).normalized()
    ring_n = 20
    rings = []
    for rr, hh in ((BTN_R, 0.0002), (BTN_R, 0.0008), (BTN_R * 0.93, 0.0013), (BTN_R * 0.7, 0.0015)):
        rings.append([bbm.verts.new(base + nrm * hh + (t1 * math.cos(2 * math.pi * i / ring_n) + t2 * math.sin(2 * math.pi * i / ring_n)) * rr) for i in range(ring_n)])
    top = bbm.verts.new(base + nrm * 0.0013)          # a slight dish in the middle
    for a_, b_ in zip(rings, rings[1:]):
        for i in range(ring_n): bbm.faces.new([a_[i], a_[(i + 1) % ring_n], b_[(i + 1) % ring_n], b_[i]])
    for i in range(ring_n): bbm.faces.new([rings[-1][i], rings[-1][(i + 1) % ring_n], top])
    bbm.faces.new(list(reversed(rings[0])))
    centres.append(base)
bmesh.ops.recalc_face_normals(bbm, faces=bbm.faces)
bme = bpy.data.meshes.new("Buttons"); bbm.to_mesh(bme); bbm.free()
buttons = bpy.data.objects.new("Buttons", bme); bpy.context.scene.collection.objects.link(buttons)
# Button texture: off-white with four holes and a navy thread cross (planar map over each disc).
uvl_b = bme.uv_layers.new(name="UVMap")
for poly in bme.polygons:
    for li in poly.loop_indices:
        co = bme.vertices[bme.loops[li].vertex_index].co
        c = min(centres, key=lambda c_: (c_ - co).length)
        loc_, nrm_ = shirt_front(0, c.z)
        t1 = nrm_.cross(Vector((0, 0, 1))).normalized(); t2 = nrm_.cross(t1).normalized()
        d = co - c
        uvl_b.data[li].uv = (0.5 + d.dot(t1) / (2.2 * BTN_R), 0.5 + d.dot(t2) / (2.2 * BTN_R))
bn = 128
yy_, xx_ = (np.mgrid[0:bn, 0:bn] + 0.5) / bn - 0.5
bt = np.zeros((bn, bn, 4), np.float32); bt[..., 3] = 1
bt[..., :3] = np.array([0.93, 0.92, 0.89])
r_ = np.hypot(xx_, yy_)
bt[..., :3] *= (1 - 0.12 * np.clip((r_ - 0.36) / 0.08, 0, 1) * (r_ < 0.46))[..., None]   # rim
holes = np.zeros_like(r_, bool)
for hx, hy in ((-0.09, -0.09), (0.09, -0.09), (-0.09, 0.09), (0.09, 0.09)):
    holes |= np.hypot(xx_ - hx, yy_ - hy) < 0.035
thread = ((np.abs(xx_ - yy_) < 0.03) | (np.abs(xx_ + yy_) < 0.03)) & (np.abs(xx_) < 0.1) & (np.abs(yy_) < 0.1)
bt[..., :3] = np.where(holes[..., None], np.array([0.55, 0.54, 0.5]), bt[..., :3])
bt[..., :3] = np.where(thread[..., None], np.array(NAVY) * 0.9, bt[..., :3])
for g in kurta.vertex_groups: buttons.vertex_groups.new(name=g.name)
for v in buttons.data.vertices:
    src = kurta.data.vertices[kd_s.find(v.co)[1]]
    for g in src.groups: buttons.vertex_groups[kurta.vertex_groups[g.group].name].add([v.index], g.weight, 'REPLACE')
set_mats(buttons, [mat("Buttons", save_img("polo_button", bt, None), rough=0.35, spec=0.6)])
for p_ in buttons.data.polygons: p_.use_smooth = True
buttons.parent = rig
buttons.modifiers.new("Armature", 'ARMATURE').object = rig
print("BUTTONS", len(centres), [tuple(round(c_, 3) for c_ in c) for c in centres])

print("TRIS", {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'})
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)

# ---------- 7b. Landmarks (empties parented to bones) for the runtime pose solver ----------
from mathutils import Matrix
bm = bmesh.new(); bm.from_mesh(body.data)
dl = bm.verts.layers.deform.active
vs = [(v.co.copy(), dominant(v[dl])) for v in bm.verts]
bm.free()
head = [p for p, b in vs if b == "Head"]
marks = {}
for side, sx in (("L", 1), ("R", -1)):
    ear = [p for p in head if p.x * sx > 0.058]
    lobe = min(ear, key=lambda p: p.z)
    marks["Ear" + side] = ("Head", lobe)
    hand = [p for p, b in vs if b == ("LeftHand" if sx > 0 else "RightHand")]
    marks["Palm" + side] = ("LeftHand" if sx > 0 else "RightHand", sum(hand, Vector()) / len(hand))
front = [p for p in head if abs(p.x) < 0.006]
marks["Nose"] = ("Head", min(front, key=lambda p: p.y))
fh = [p for p in front if abs(p.z - (brow_top + 0.012)) < 0.006]
marks["Forehead"] = ("Head", min(fh, key=lambda p: p.y))
marks["IndexTipR"] = ("RightHandIndex3", btail("RightHandIndex3"))
marks["IndexTipL"] = ("LeftHandIndex3", btail("LeftHandIndex3"))
empties = []
for name, (bone, pos) in marks.items():
    e = bpy.data.objects.new("M_" + name, None); bpy.context.scene.collection.objects.link(e)
    e.parent = rig; e.parent_type = 'BONE'; e.parent_bone = "mixamorig:" + bone
    bpy.context.view_layer.update()
    e.matrix_world = Matrix.Translation(pos)
    empties.append(e)
    print("MARK", name, bone, tuple(round(c, 4) for c in pos))

# ---------- 7c. Eyes and upper lids that move ----------
# The MakeHuman eye is a front cap with a sunken, stepped iris: seen from an angle once it
# turns, the steps show as rings. Replace each with a clean sphere (painted iris and pupil)
# centred where the old one was, on an eye bone, so it turns smoothly in its socket. Each upper
# lid (and its lashes) gets its own bone at the same centre: it follows the gaze part way and
# closes for a blink.
bpy.context.view_layer.objects.active = rig
for o in bpy.context.selected_objects: o.select_set(False)
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = rig.data.edit_bones
inv = rig.matrix_world.inverted()
ew = [eyes.matrix_world @ v.co for v in eyes.data.vertices]
centres = {}
for side, sx in (("Left", 1), ("Right", -1)):
    pts = [p for p in ew if p.x * sx > 0]
    A = np.array([[2 * p.x, 2 * p.y, 2 * p.z, 1.0] for p in pts]); bb = np.array([p.dot(p) for p in pts])
    sol = np.linalg.lstsq(A, bb, rcond=None)[0]
    c = Vector(sol[:3]); r = math.sqrt(sol[3] + c.dot(c)); centres[side] = (c, r)
    for kind in ("Eye", "Lid"):
        bn = eb.new("mixamorig:" + side + kind)
        bn.head = inv @ c; bn.tail = inv @ (c + Vector((0, -0.02, 0)))
        bn.parent = eb["mixamorig:Head"]
    print("EYE", side, tuple(round(x, 4) for x in c), "r", round(r, 4))
bpy.ops.object.mode_set(mode='OBJECT')

# Eyeball texture, an azimuthal map about the front pole: radius in the image = angle from the
# front / pi. Iris (half-angle 0.47 rad) warm brown with fine radial fibres and a darker rim.
n_ = 512
yy_, xx_ = (np.mgrid[0:n_, 0:n_] + 0.5) / n_
th = np.hypot(xx_ - 0.5, yy_ - 0.5) * 2 * math.pi
ph = np.arctan2(yy_ - 0.5, xx_ - 0.5)
rng_ = np.random.default_rng(7)
fib = np.interp(ph, np.linspace(-math.pi, math.pi, 181), rng_.normal(0, 1, 181))
img_ = np.zeros((n_, n_, 4), np.float32); img_[..., 3] = 1
scl = np.array([0.94, 0.91, 0.87]) * (1 - 0.1 * np.clip((th - 1.0) / 1.5, 0, 1))[..., None]
iris_c = np.array([0.33, 0.19, 0.09]) * (1 + 0.18 * fib)[..., None] * (0.75 + 0.35 * np.clip((th - 0.17) / 0.3, 0, 1))[..., None]
rim = np.clip((th - 0.40) / 0.07, 0, 1)[..., None]
iris_c = iris_c * (1 - 0.55 * rim)
col = np.where((th < 0.47)[..., None], iris_c, scl)
col = np.where((th < 0.16)[..., None], np.array([0.02, 0.015, 0.012]), col)
edge = np.clip(1 - np.abs(th - 0.47) / 0.02, 0, 1)[..., None]            # soft limbus
col = col * (1 - 0.35 * edge)
img_[..., :3] = col
eye_img = save_img("child_eyes", img_, None, fmt='PNG')

ebm = bmesh.new(); euv = ebm.loops.layers.uv.new("UVMap")
for side in ("Left", "Right"):
    c, r = centres[side]
    r = r * 0.97                                    # just inside the lids
    res = bmesh.ops.create_uvsphere(ebm, u_segments=40, v_segments=28, radius=r)
    for v in res["verts"]: v.co = v.co + c
    for f in {f for v in res["verts"] for f in v.link_faces}:
        f.smooth = True
        for l in f.loops:
            d = (l.vert.co - c) / r
            t = math.acos(max(-1.0, min(1.0, -d.y))); a_ = math.atan2(d.z, d.x)
            l[euv].uv = (0.5 + 0.5 * t / math.pi * math.cos(a_), 0.5 + 0.5 * t / math.pi * math.sin(a_))
eyes.data.clear_geometry()
for v in ebm.verts: v.co = eyes.matrix_world.inverted() @ v.co
ebm.to_mesh(eyes.data); ebm.free()
set_mats(eyes, [mat("Eyes", eye_img, rough=0.35, spec=0.5)])
for g in list(eyes.vertex_groups): eyes.vertex_groups.remove(g)
gl = eyes.vertex_groups.new(name="mixamorig:LeftEye"); gr = eyes.vertex_groups.new(name="mixamorig:RightEye")
for v in eyes.data.vertices:
    ((gl if (eyes.matrix_world @ v.co).x > 0 else gr)).add([v.index], 1.0, 'REPLACE')

# Upper lids: each vertex's share of the lid opening goes to the lid bone (the lid edge fully).
def to_lid(ob, weight_of):
    lg = {s_: ob.vertex_groups.get("mixamorig:" + s_ + "Lid") or ob.vertex_groups.new(name="mixamorig:" + s_ + "Lid") for s_ in ("Left", "Right")}
    isbone = {g.index for g in ob.vertex_groups if g.name in rig.data.bones}
    n = 0
    for v in ob.data.vertices:
        k = min(1.0, weight_of(v))
        if k <= 0: continue
        side = "Left" if (ob.matrix_world @ v.co).x > 0 else "Right"
        for g in v.groups:
            if g.group in isbone: ob.vertex_groups[g.group].add([v.index], g.weight * (1 - k), 'REPLACE')
        lg[side].add([v.index], k, 'REPLACE'); n += 1
    print("LID weights", ob.name, n)
lid_gi = body.vertex_groups["lid_share"].index
to_lid(body, lambda v: next((g.weight for g in v.groups if g.group == lid_gi), 0.0) ** 0.7)
body.vertex_groups.remove(body.vertex_groups["lid_share"])
# The lashes take the exact bone weights of the lid skin they grow from, so they can never
# come away from the lid edge.
bkd = KDTree(len(body.data.vertices))
for v in body.data.vertices: bkd.insert(v.co, v.index)
bkd.balance()
bone_names = set(rig.data.bones.keys())
for v in lashes.data.vertices:
    src = body.data.vertices[bkd.find(v.co)[1]]
    for g in list(v.groups):
        if lashes.vertex_groups[g.group].name in bone_names: lashes.vertex_groups[g.group].remove([v.index])
    for g in src.groups:
        n_ = body.vertex_groups[g.group].name
        if n_ in bone_names:
            (lashes.vertex_groups.get(n_) or lashes.vertex_groups.new(name=n_)).add([v.index], g.weight, 'REPLACE')
print("LASHES bound to lids", len(lashes.data.vertices))

# ---------- 8. Export ----------
for o in bpy.context.selected_objects: o.select_set(False)
for o in [rig, body, eyes, brows, lashes, kurta, shalwar, topi, collar, hair, buttons, placket] + empties: o.select_set(True)
# Every skinned vertex must have a weight (the exporter binds the rest to a frozen bone).
for ob in [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig]:
    isbone = {g.index for g in ob.vertex_groups if g.name in rig.data.bones}
    zero = [v for v in ob.data.vertices if sum(g.weight for g in v.groups if g.group in isbone) < 1e-4]
    if zero:   # take the bone weights of the nearest properly weighted vertex
        from mathutils.kdtree import KDTree
        ok = [v for v in ob.data.vertices if sum(g.weight for g in v.groups if g.group in isbone) >= 1e-4]
        kd = KDTree(len(ok))
        for i, v in enumerate(ok): kd.insert(v.co, i)
        kd.balance()
        for v in zero:
            src = ok[kd.find(v.co)[1]]
            for g in src.groups:
                if g.group in isbone: ob.vertex_groups[g.group].add([v.index], g.weight, 'REPLACE')
    print("ZERO-WEIGHT fixed", ob.name, len(zero))
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_skins=True,
    export_animations=False, export_yup=True, export_apply=False, export_image_format='AUTO',
    export_texcoords=True, export_normals=True, export_morph=False, export_vertex_color='ACTIVE')
print("EXPORTED", OUT_GLB, os.path.getsize(OUT_GLB))
