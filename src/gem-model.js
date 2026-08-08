import {
  Box3,
  Group,
  LoadingManager,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const GEM_VISUAL_SCALE = 0.84;
const modelLoadCache = new Map();

export const clearGemModelCache = () => {
  modelLoadCache.clear();
};

const cloneMaterial = (material, materialClones) => {
  if (!material) {
    return material;
  }

  if (!materialClones.has(material)) {
    materialClones.set(material, material.clone());
  }

  return materialClones.get(material);
};

const cloneRenderableBranch = (source, materialClones) => {
  if (source.isCamera || source.isLight) {
    return null;
  }

  const clone = source.clone(false);

  if (source.isMesh) {
    clone.material = Array.isArray(source.material)
      ? source.material.map((material) =>
          cloneMaterial(material, materialClones),
        )
      : cloneMaterial(source.material, materialClones);
  }

  source.children.forEach((child) => {
    const childClone = cloneRenderableBranch(child, materialClones);

    if (childClone) {
      clone.add(childClone);
    }
  });

  return clone;
};

const isBranchVisible = (object) => {
  let current = object;

  while (current) {
    if (!current.visible) {
      return false;
    }

    current = current.parent;
  }

  return true;
};

const getVisibleBounds = (root) => {
  const bounds = new Box3().makeEmpty();
  const meshBounds = new Box3();

  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.isMesh || !isBranchVisible(object)) {
      return;
    }

    object.geometry.computeBoundingBox();
    meshBounds
      .copy(object.geometry.boundingBox)
      .applyMatrix4(object.matrixWorld);
    bounds.union(meshBounds);
  });

  return bounds;
};

const revealHiddenMeshes = (root) => {
  root.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    let current = object;

    while (current && current !== root) {
      current.visible = true;
      current = current.parent;
    }
  });
};

const getDefaultBinaryUrl = (modelUrl) => {
  const binaryUrl = new URL(modelUrl, document.baseURI);

  binaryUrl.pathname = binaryUrl.pathname.replace(
    /\.[^./]+$/,
    ".bin",
  );
  return binaryUrl.href;
};

const createModelLoader = (modelUrl, binaryUrl) => {
  const manager = new LoadingManager();
  const resolvedBinaryUrl = binaryUrl
    ? new URL(binaryUrl, document.baseURI).href
    : getDefaultBinaryUrl(modelUrl);

  manager.setURLModifier((url) =>
    /\.bin(?:$|[?#])/i.test(url) ? resolvedBinaryUrl : url
  );

  return new GLTFLoader(manager);
};

const loadModel = (modelUrl, binaryUrl) => {
  const cacheKey = `${modelUrl}::${binaryUrl ?? ""}`;
  const cachedLoad = modelLoadCache.get(cacheKey);

  if (cachedLoad) {
    return cachedLoad;
  }

  const modelLoad = createModelLoader(modelUrl, binaryUrl)
    .loadAsync(modelUrl)
    .catch((error) => {
      modelLoadCache.delete(cacheKey);
      throw error;
    });

  modelLoadCache.set(cacheKey, modelLoad);
  return modelLoad;
};

export class GemModelFactory {
  constructor({ binaryUrl = null, modelUrl }) {
    if (!modelUrl) {
      throw new Error("Missing gem model URL.");
    }

    this.binaryUrl = binaryUrl;
    this.modelUrl = modelUrl;
    this.template = null;
    this.templateCenter = new Vector3();
    this.templateDiameter = 1;
    this.worldMaterial = null;
  }

  async load() {
    const { scene, world } = await loadModel(
      this.modelUrl,
      this.binaryUrl,
    );
    const template = new Group();
    const materialClones = new Map();

    scene.children.forEach((child) => {
      const childClone = cloneRenderableBranch(child, materialClones);

      if (childClone) {
        template.add(childClone);
      }
    });

    let bounds = getVisibleBounds(template);

    if (bounds.isEmpty()) {
      revealHiddenMeshes(template);
      bounds = getVisibleBounds(template);
    }

    if (bounds.isEmpty()) {
      throw new Error(`No mesh found in model: ${this.modelUrl}`);
    }

    const size = bounds.getSize(new Vector3());

    bounds.getCenter(this.templateCenter);
    this.templateDiameter = Math.max(size.x, size.y, size.z, 0.001);
    this.template = template;
    const worldMaterial = world?.material ?? scene.worldMaterial;

    this.worldMaterial = worldMaterial?.clone?.() ?? worldMaterial;
  }

  applyEnvironment(scene) {
    if (!this.worldMaterial) {
      return false;
    }

    scene.worldMaterial = this.worldMaterial;
    return true;
  }

  create({ size }) {
    if (!this.template) {
      throw new Error("Gem model has not loaded yet.");
    }

    const model = this.template.clone(true);
    const visual = new Group();
    const materials = [];

    model.position.sub(this.templateCenter);
    model.traverse((object) => {
      if (!object.isMesh || !isBranchVisible(object)) {
        return;
      }

      const meshMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      meshMaterials.forEach((material) => {
        if (!materials.includes(material)) {
          materials.push(material);
        }
      });
    });

    visual.scale.setScalar(
      (size * 2 * GEM_VISUAL_SCALE) / this.templateDiameter,
    );
    visual.add(model);

    return { materials, visual };
  }
}
