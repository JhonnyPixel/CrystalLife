import { Box3, Color, Group, Vector3 } from "three";

const MODEL_URL = new URL("../gemme.glb", import.meta.url).href;
const WHITE = new Color(0xffffff);

const setInteractionEmission = (material, isInnerCrystal) => {
  material.userData.restEmissiveIntensity = isInnerCrystal
    ? Math.max(material.emissiveIntensity, 4.4)
    : 0.02;
  material.userData.activeEmissiveIntensity = isInnerCrystal
    ? 6
    : 0.28;
};

const configureOuterCrystal = (material, color) => {
  material.color?.copy(color).multiplyScalar(0.32);
  material.emissive?.copy(color).multiplyScalar(0.12);
  material.attenuationColor?.copy(color);
  material.metalness = 0;
  material.roughness = 0.18;
  material.transmission = 0.18;
  material.ior = 1.85;
  material.thickness = 0.45;
  material.attenuationDistance = 1.5;
  material.envMapIntensity = 1.35;
  material.clearcoat = 0.72;
  material.clearcoatRoughness = 0.09;
  material.specularIntensity = 1;
  material.specularColor?.copy(WHITE);
  material.iridescence = 0.12;
  material.iridescenceIOR = 1.3;
  material.iridescenceThicknessRange = [100, 280];
  material.opacity = 0.66;
  material.transparent = true;
  material.depthWrite = false;
};

const configureInnerCrystal = (material, color) => {
  material.color?.copy(color).lerp(WHITE, 0.68);
  material.emissive?.copy(WHITE).lerp(color, 0.24);
  material.attenuationColor?.copy(color);
  material.metalness = 0;
  material.roughness = 0.3;
  material.transmission = 0;
  material.ior = 1.46;
  material.thickness = 0.12;
  material.attenuationDistance = 0.58;
  material.envMapIntensity = 1;
  material.clearcoat = 0.4;
  material.clearcoatRoughness = 0.12;
  material.opacity = 1;
  material.transparent = false;
};

const tintMaterial = (sourceMaterial, color) => {
  const material = sourceMaterial.clone();
  const hasExportedEmission =
    material.emissive && material.emissive.getHex() !== 0;

  if (hasExportedEmission) {
    configureInnerCrystal(material, color);
  } else {
    configureOuterCrystal(material, color);
  }

  if (material.emissive) {
    setInteractionEmission(material, hasExportedEmission);
    material.emissiveIntensity =
      material.userData.restEmissiveIntensity;
  }

  material.needsUpdate = true;
  return material;
};

export class GemModelFactory {
  constructor(loader = null) {
    this.loader = loader;
    this.template = null;
    this.templateCenter = new Vector3();
    this.templateDiameter = 1;
  }

  async load() {
    if (!this.loader) {
      const { GLTFLoader } = await import(
        "three/addons/loaders/GLTFLoader.js"
      );
      this.loader = new GLTFLoader();
    }

    const { scene } = await this.loader.loadAsync(MODEL_URL);
    const bounds = new Box3().setFromObject(scene);
    const size = bounds.getSize(new Vector3());

    bounds.getCenter(this.templateCenter);
    this.templateDiameter = Math.max(size.x, size.y, size.z, 0.001);
    this.template = scene;
  }

  create({ color, size }) {
    if (!this.template) {
      throw new Error("Modello gemma non ancora caricato.");
    }

    const tint = new Color(color);
    const model = this.template.clone(true);
    const visual = new Group();
    const materials = [];

    model.position.sub(this.templateCenter);
    model.traverse((object) => {
      if (!object.isMesh) {
        return;
      }

      const sourceMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const tintedMaterials = sourceMaterials.map((material) => {
        const tintedMaterial = tintMaterial(material, tint);
        materials.push(tintedMaterial);
        return tintedMaterial;
      });

      object.material = Array.isArray(object.material)
        ? tintedMaterials
        : tintedMaterials[0];
    });

    visual.scale.setScalar((size * 2) / this.templateDiameter);
    visual.add(model);

    return { materials, visual };
  }
}
