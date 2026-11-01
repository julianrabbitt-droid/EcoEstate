// Frees the GPU resources of a three.js object tree: geometries, materials and
// every texture a material references. Pass isShared to skip resources that
// are cached and reused elsewhere (module-level geometries/materials/textures).
export function disposeObject(obj, isShared = () => false) {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.geometry && !isShared(o.geometry)) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (isShared(m)) continue;
      for (const v of Object.values(m)) {
        if (v && v.isTexture && !isShared(v)) v.dispose();
      }
      m.dispose();
    }
  });
}
