// KayKit scenery is visual only. The tile map remains the sole collision source.
const MODELS = {
 treeOak: 'forest/Tree_1_A_Color1.glb',
 treeTall: 'forest/Tree_2_A_Color1.glb',
 treeRound: 'forest/Tree_3_A_Color1.glb',
 treePine: 'forest/Tree_5_A_Color1.glb',
 treePineAlt: 'forest/Tree_6_A_Color1.glb',
 rock: 'forest/Rock_1_A_Color1.glb',
 rockAlt: 'forest/Rock_2_A_Color1.glb',
 bush: 'forest/Bush_1_A_Color1.glb',
 bushAlt: 'forest/Bush_2_A_Color1.glb',
 barrel: 'dungeon/barrel_large.glb',
 barrelStack: 'dungeon/barrel_small_stack.glb',
 crates: 'dungeon/crates_stacked.glb',
 chest: 'dungeon/chest.glb',
 banner: 'dungeon/banner_green.glb',
 torch: 'dungeon/torch_mounted.glb',
 ruinedWall: 'dungeon/wall_broken.glb',
 rubble: 'dungeon/rubble_half.glb',
 table: 'dungeon/table_medium.glb',
 chair: 'dungeon/chair.glb',
 counter: 'dungeon/bar_straight_A.glb',
 counterTop: 'dungeon/bartop_A_medium.glb',
 trainingDummy: 'series6/training-dummy.glb'
};

export const INTERIOR_ASSETS = Object.freeze({
 table: 'dungeon/table_medium.glb',
 chair: 'dungeon/chair.glb',
 counter: 'dungeon/bar_straight_A.glb',
 counterTop: 'dungeon/bartop_A_medium.glb'
});

export function createScenery(pc, app) {
 const loaded = new Map();
 const foliageMaterials = new Map();
 let version = 0, destroyed = false, failed = 0, remaining = Object.keys(MODELS).length;
 for (const [name, path] of Object.entries(MODELS)) {
  const url = new URL(`./assets/scenery/${path}`, import.meta.url).href;
  app.assets.loadFromUrl(url, 'container', (error, asset) => {
   if (destroyed) return;
   if (error || !asset?.resource) failed++;
   else loaded.set(name, asset);
   if (--remaining === 0) version++;
  });
 }
 function place(name, parent, x, y, z, scale = 1, yaw = 0, castShadow = true) {
  const asset = loaded.get(name);
  if (!asset) return false;
  const entity = asset.resource.instantiateRenderEntity({castShadows: castShadow});
  if (name.startsWith('tree') || name.startsWith('bush')) {
   for (const render of entity.findComponents('render')) for (const mesh of render.meshInstances) {
    let muted = foliageMaterials.get(mesh.material);
    if (!muted) {
     muted = mesh.material.clone();
     muted.diffuse = new pc.Color(.72, .78, .68);
     muted.diffuseMapTint = true;
     muted.update();
     foliageMaterials.set(mesh.material, muted);
    }
    mesh.material = muted;
   }
  }
  entity.name = `KayKit ${name}`;
  entity.setLocalPosition(x, y, z);
  entity.setLocalScale(scale, scale, scale);
  entity.setLocalEulerAngles(0, yaw, 0);
  parent.addChild(entity);
  return true;
 }
 return {
  place,
  get version() { return version; },
  diagnostics: () => ({loaded: loaded.size, failed, requested: Object.keys(MODELS).length}),
  destroy() { destroyed = true; loaded.clear(); for (const material of foliageMaterials.values()) material.destroy(); foliageMaterials.clear(); }
 };
}
