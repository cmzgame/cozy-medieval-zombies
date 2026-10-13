import json, os, shutil
import garments as G, heads as H, knight as K
D = "out/delivery"; os.makedirs(D, exist_ok=True)
for f in os.listdir(D):
    if f.endswith(".png") or f == "manifest.json": os.remove(D + "/" + f)
ITEMS = [
 # name, slot, layer, slicer options, item spec for the coding agent
 ("hair_crop", "hair", H.hair_crop, {"dye": True}, "the short crop (replaces generated `short`)"),
 ("hair_mohawk", "hair", H.hair_mohawk, {"dye": True}, "a medium mohawk, the sides shaved"),
 ("hair_tight", "hair", H.hair_tight, {"dye": True}, "high and tight: short on top, shaved sides and back"),
 ("hair_long", "hair", H.hair_long, {"dye": True}, "long and loose to the shoulders (replaces generated `long`)"),
 ("hair_pigtails", "hair", H.hair_pigtails, {"dye": True}, "a middle parting and two tied pigtails"),
 ("hair_bob", "hair", H.hair_bob, {"dye": True}, "a bob to the jaw"),
 ("beard_moustache", "beard", H.beard_moustache, {"dye": True}, "the cop moustache"),
 ("beard_gnome", "beard", H.beard_gnome, {"dye": True}, "the big bushy gnome beard"),
 ("beard_cropped", "beard", H.beard_cropped, {"dye": True}, "the tight cropped beard"),
 ("head_onion", "head", lambda: H.onion(), {}, "the onion hat, hero version: item shape hood, colours [#5f8a3a, #46682a]"),
 ("head_onion_flop", "head", lambda: H.onion(nub="flop"), {}, "the onion hat with a taller nub that flops"),
 ("head_onion_squat", "head", lambda: H.onion(nub="squat", slit=9), {}, "the onion hat, short squat nub, a wider slit"),
 ("head_straw_hat", "head", H.straw_hat, {}, "a straw hat with a wide brim; dark hair painted under the brim"),
 ("head_coif", "head", H.coif, {}, "a cloth coif tied under the chin (replaces generated `cap`)"),
 ("head_greathelm", "head", H.greathelm, {}, "the knight's great helm (replaces generated `helm`)"),
 ("chest_tunic", "chest", G.tunic, {"length": "shirt", "hideBelt": False}, "the tunic, shirt length: item shape tunic, colours [#c9b98e, #a8966f]"),
 ("chest_tunic_long", "chest", G.tunic, {"length": "long", "hideBelt": False}, "the same painting with length long (the starting outfit)"),
 ("chest_tunic_cross", "chest", lambda: G.tunic(cross="#262428", light="#e8e4d8", dark="#c2bdb0", trim="#a8a498"), {"length": "long", "hideBelt": False}, "a white long tunic with a black cross: item colours [#e8e4d8, #c2bdb0]"),
 ("chest_jerkin", "chest", G.jerkin, {"length": "shirt", "hideBelt": False}, "a leather jerkin over a cloth shirt: item colours [#7a4e2c, #5c3a20] (the shirt sleeves are painted)"),
 ("chest_dress", "chest", G.dress, {"length": "long", "hideBelt": True, "covers": ["legs"]}, "a long dress: item colours [#6d5a86, #52446a], length long, covers legs"),
 ("chest_surcoat", "chest", K.surcoat, {"length": "long", "hideBelt": False}, "the knight's surcoat over mail with pauldrons: item colours mail grey [#8e9099, #62646e] so the far arm's sleeve is mail; length long"),
 ("legs_breeches", "legs", G.breeches, {}, "breeches to the shin: item colours [#5a4030, #43301f] (the starting outfit)"),
 ("legs_hose", "legs", G.hose, {}, "hose to the ankle: item colours [#4a4a3a, #36362a]"),
 ("legs_patched", "legs", G.patched, {}, "patched trousers: item colours [#6e5a3c, #54432c]"),
 ("legs_chausses", "legs", K.chausses, {}, "the knight's mail chausses: item colours [#8e9099, #62646e]"),
 ("feet_boots", "feet", G.boots, {}, "boots with a cuff: item colours [#4a3522, #36261a] (the starting outfit)"),
 ("feet_turnshoes", "feet", G.turnshoes, {}, "low turnshoes: item colours [#6b4a2a, #4e3419]"),
 ("feet_wraps", "feet", G.wraps, {}, "cloth wraps to the ankle, bare toes: item colours [#b8a78a, #948366]"),
 ("feet_greaves", "feet", K.greaves, {}, "the knight's plate greaves and sabatons: item colours [#a0a2ac, #6e707a]"),
 ("hands_gloves", "hands", G.gloves, {}, "leather gloves: item colours [#6b4a2a, #4e3419]"),
 ("hands_gauntlets", "hands", G.gauntlets, {}, "plate gauntlets with a flared cuff: item colours [#9a9ca6, #6a6c76]"),
 ("hands_wraps", "hands", G.hand_wraps, {}, "cloth hand wraps: item colours [#c9b98e, #a8966f]"),
 ("waist_belt", "waist", G.belt, {}, "the plain belt with a buckle: item colours [#6b4a2a, #4a3219] (the starting outfit)"),
 ("waist_pouch_belt", "waist", G.pouch_belt, {}, "a belt with a pouch on the figure's left hip (asymmetric: all eight painted)"),
 ("waist_rope", "waist", G.rope, {}, "a tied cord: item colours [#b8a67c, #8f7f5c]"),
 ("waist_sword_belt", "waist", K.sword_belt, {}, "the knight's sword belt: item colours [#7a4e2a, #553418]"),
]
manifest = []
for name, slot, fn, opts, desc in ITEMS:
    L = fn(); L.save(name, D)
    manifest.append({"file": name + ".png", "slot": slot, "options": opts, "note": desc})
json.dump(manifest, open(D + "/manifest.json", "w"), indent=1)
print(len(manifest), "layers")
