import discoveredGemAssets from "virtual:gem-assets";

const getPublicAssetUrl = (path) =>
  path ? `${import.meta.env.BASE_URL}${path}` : null;

const createGemAsset = ({ binaryPath, modelPath }) =>
  Object.freeze({
    binaryUrl: getPublicAssetUrl(binaryPath),
    modelUrl: getPublicAssetUrl(modelPath),
  });

export const GEM_ASSETS = Object.freeze(
  Object.fromEntries(
    Object.entries(discoveredGemAssets).map(([key, asset]) => [
      key,
      createGemAsset(asset),
    ]),
  ),
);

export const GEM_MODEL_URLS = Object.freeze(
  Object.fromEntries(
    Object.entries(GEM_ASSETS).map(([key, asset]) => [
      key,
      asset.modelUrl,
    ]),
  ),
);
