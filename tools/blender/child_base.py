import bpy, os, sys, math, mathutils
from bl_ext.user_default.mpfb.services import HumanService, LocationService, TargetService, ObjectService
D = LocationService.get_user_data()
OUT = sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)

macro = TargetService.get_default_macro_info_dict()
macro.update({"gender": 1.0, "age": 0.09375, "muscle": 0.5, "weight": 0.52, "proportions": 0.5, "height": 0.5})
macro["race"] = {"asian": 0.25, "caucasian": 0.45, "african": 0.30}
human = HumanService.create_human(macro_detail_dict=macro, scale=0.1)
human.name = "Child"
rig = HumanService.add_builtin_rig(human, "mixamo")
print("RIG", rig.name, len(rig.data.bones))

HumanService.set_character_skin(os.path.join(D, "skins/young_caucasian_male/young_caucasian_male.mhmat"), human, skin_type="MAKESKIN")
def mhclo(rel, kind):
    return HumanService.add_mhclo_asset(os.path.join(D, rel), human, asset_type=kind, subdiv_levels=0, material_type="MAKESKIN")
eyes = mhclo("eyes/high-poly/high-poly.mhclo", "Eyes")
brows = mhclo("eyebrows/eyebrow001/eyebrow001.mhclo", "Eyebrows")
lashes = mhclo("eyelashes/eyelashes01/eyelashes01.mhclo", "Eyelashes")
hair = mhclo("hair/short02/short02.mhclo", "Hair")
for o in bpy.data.objects: print("OBJ", o.name, o.type, tuple(round(v, 3) for v in o.dimensions))
bpy.ops.wm.save_as_mainfile(filepath=OUT)
