import {
  Box3,
  GLTFLoader,
  Group,
  LoadingManager,
  Vector3,
} from "verge3d";

const GEM_VISUAL_SCALE = 0.84;

const cloneRenderableBranch = (source) => {
  if (source.isCamera || source.isLight) {
    return null;
  }

  const clone = source.clone(false);

  source.children.forEach((child) => {
    const childClone = cloneRenderableBranch(child);

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

export class GemModelFactory {
  constructor({ binaryUrl = null, modelUrl }) {
    if (!modelUrl) {
      throw new Error("URL modello gemma mancante.");
    }

    this.modelUrl = modelUrl;
    this.loader = createModelLoader(modelUrl, binaryUrl);
    this.template = null;
    this.templateCenter = new Vector3();
    this.templateDiameter = 1;
    this.worldMaterial = null;
  }

  async load() {
    const { scene, world } = await this.loader.loadAsync(this.modelUrl);
    const template = new Group();

    scene.children.forEach((child) => {
      const childClone = cloneRenderableBranch(child);

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
      throw new Error(`Nessuna mesh nel modello: ${this.modelUrl}`);
    }

    const size = bounds.getSize(new Vector3());

    bounds.getCenter(this.templateCenter);
    this.templateDiameter = Math.max(size.x, size.y, size.z, 0.001);
    this.template = template;
    this.worldMaterial = world?.material ?? scene.worldMaterial;
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
      throw new Error("Modello gemma non ancora caricato.");
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
