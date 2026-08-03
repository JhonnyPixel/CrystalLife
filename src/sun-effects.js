import {
  BackSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PointLight,
} from "three";

const SUN_COLOR = 0xff7417;
const SUN_LIGHT_COLOR = 0xff9a52;
const SUN_EMISSION_STRENGTH = 6;
const SUN_OUTLINE_SCALE = 1.035;

const tuneMaterial = (material) => {
  if (material.emissive?.set) {
    material.emissive.set(SUN_COLOR);
    material.emissiveIntensity = SUN_EMISSION_STRENGTH;
    material.needsUpdate = true;
  }
};

const addSunOutline = (visual) => {
  const meshes = [];

  visual.traverse((object) => {
    if (object.isMesh) {
      meshes.push(object);
    }
  });

  meshes.forEach((mesh) => {
    const outlineMaterial = new MeshBasicMaterial({
      color: SUN_COLOR,
      depthWrite: false,
      opacity: 0.92,
      side: BackSide,
      transparent: true,
    });
    const outline = new Mesh(mesh.geometry, outlineMaterial);

    outline.scale.setScalar(SUN_OUTLINE_SCALE);
    outline.raycast = () => {};
    mesh.add(outline);
  });
};

export const styleSunMaterials = (materials, visual) => {
  materials.forEach(tuneMaterial);
  addSunOutline(visual);
};

export class SunEffects {
  constructor({ distance, intensity }) {
    this.baseIntensity = intensity;
    this.elapsedSeconds = 0;
    this.root = new Group();
    this.light = new PointLight(
      SUN_LIGHT_COLOR,
      intensity,
      distance,
      1.35,
    );
    this.root.add(this.light);
  }

  update(deltaSeconds, prefersReducedMotion) {
    if (!prefersReducedMotion) {
      this.elapsedSeconds += deltaSeconds;
    }

    const slowPulse = Math.sin(this.elapsedSeconds * 1.7);
    const intensityPulse = 1 + slowPulse * 0.07;

    this.light.intensity = this.baseIntensity * intensityPulse;
  }
}
