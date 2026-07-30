import {
  BackSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PointLight,
} from "verge3d";

const SUN_COLOR = 0xff7417;
const SUN_LIGHT_COLOR = 0xff9a52;
const PRINCIPLED_EMISSION_COLOR_INDEX = 27;
const PRINCIPLED_EMISSION_STRENGTH_INDEX = 28;
const SUN_EMISSION_COLOR = [1, 0.18, 0.01, 1];
const SUN_EMISSION_STRENGTH = 6;
const SUN_OUTLINE_SCALE = 1.035;

const tuneNodeMaterial = (material) => {
  const { edges, nodes } = material.nodeGraph ?? {};
  const principledNodeIndex = nodes?.findIndex(
    ({ type }) => type === "BSDF_PRINCIPLED_BL",
  );
  const principledNode = nodes?.[principledNodeIndex];

  if (
    !principledNode?.inputs ||
    principledNode.inputs.length <= PRINCIPLED_EMISSION_STRENGTH_INDEX
  ) {
    return false;
  }

  principledNode.inputs[PRINCIPLED_EMISSION_COLOR_INDEX] =
    [...SUN_EMISSION_COLOR];
  principledNode.inputs[PRINCIPLED_EMISSION_STRENGTH_INDEX] =
    SUN_EMISSION_STRENGTH;
  const emissionEdge = edges?.find(
    ({ toInput, toNode }) =>
      toNode === principledNodeIndex &&
      toInput === PRINCIPLED_EMISSION_COLOR_INDEX,
  );
  const emissionRamp = nodes?.[emissionEdge?.fromNode];
  const rampColors = emissionRamp?.curve?.output;

  if (Array.isArray(rampColors)) {
    const colorCount = rampColors.length / 4;

    for (let index = 0; index < colorCount; index += 1) {
      const offset = index * 4;
      const progress = colorCount > 1 ? index / (colorCount - 1) : 1;

      rampColors[offset] = 0.08 + progress * 0.92;
      rampColors[offset + 1] = 0.008 + progress * 0.15;
      rampColors[offset + 2] = progress * 0.008;
    }
  }
  material.updateNodeGraph?.();
  material.needsUpdate = true;
  return true;
};

const tuneStandardMaterial = (material) => {
  if (!material.emissive?.set) {
    return;
  }

  material.emissive.set(SUN_COLOR);
  material.emissiveIntensity = SUN_EMISSION_STRENGTH;
  material.needsUpdate = true;
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
  materials.forEach((material) => {
    if (!tuneNodeMaterial(material)) {
      tuneStandardMaterial(material);
    }
  });
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
