const getPublicAssetUrl = (path) =>
  `${import.meta.env.BASE_URL}${path}`;

export const GEM_MODEL_URLS = Object.freeze({
  body: getPublicAssetUrl("gems/corpo/gemme.gltf"),
  center: getPublicAssetUrl("gems/centro/gemme.gltf"),
  discipline: getPublicAssetUrl("gems/disciplina/gemme.gltf"),
  growth: getPublicAssetUrl("gems/crescita/gemme.gltf"),
  mind: getPublicAssetUrl("gems/mente/gemme.gltf"),
  relationships: getPublicAssetUrl("gems/relazioni/gemme.gltf"),
});
