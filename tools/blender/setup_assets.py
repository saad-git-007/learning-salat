import bpy, os, zipfile, sys
from bl_ext.user_default.mpfb.services import LocationService, AssetService
d = LocationService.get_user_data()
print("USER_DATA", d)
if not os.path.exists(os.path.join(d, "skins")):
    with zipfile.ZipFile(sys.argv[-1]) as z: z.extractall(d)
AssetService.update_all_asset_lists()
for sub in ["skins", "eyes", "eyebrows", "eyelashes", "hair", "clothes", "proxymeshes", "teeth", "tongue"]:
    p = os.path.join(d, sub)
    print(sub, sorted(os.listdir(p)) if os.path.isdir(p) else "-")
print("rigs", sorted(os.listdir(LocationService.get_mpfb_data("rigs") + "/standard")))
