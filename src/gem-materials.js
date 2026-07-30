import {
  Box3,
  Color,
  DoubleSide,
  FrontSide,
  NormalBlending,
  PointLight,
  Vector3,
} from "verge3d";

const GLASS_ALPHA = 0.62;
const GLASS_CLEARCOAT = 0.9;
const GLASS_CLEARCOAT_ROUGHNESS = 0.035;
const GLASS_ENVIRONMENT_INTENSITY = 1.4;
const GLASS_IOR = 1.52;
const GLASS_ROUGHNESS = 0.045;
const GLASS_SPECULAR_IOR_LEVEL = 0.65;
const GLASS_TRANSMISSION = 1;
const INNER_EMISSION_MAX_STRENGTH = 4;
const INNER_EMISSION_MIN_STRENGTH = 1;
const INNER_EMISSION_TARGET_LUMINANCE = 0.65;
const INNER_EMISSION_THRESHOLD = 0.05;
const INNER_LIGHT_DECAY = 1.5;
const INNER_LIGHT_DISTANCE_RATIO = 3.2;
const INNER_LIGHT_INTENSITY = 1.8;

const PRINCIPLED_LAYOUTS = new Map([
  [
    31,
    {
      alpha: 4,
      baseColor: 0,
      clearcoat: 19,
      clearcoatRoughness: 20,
      emission: 27,
      emissionStrength: 28,
      ior: 3,
      roughness: 2,
      specularIorLevel: 13,
      transmission: 18,
    },
  ],
  [
    30,
    {
      alpha: 4,
      baseColor: 0,
      clearcoat: 18,
      clearcoatRoughness: 19,
      emission: 26,
      emissionStrength: 27,
      ior: 3,
      roughness: 2,
      specularIorLevel: 12,
      transmission: 17,
    },
  ],
  [
    29,
    {
      alpha: 4,
      baseColor: 0,
      clearcoat: 17,
      clearcoatRoughness: 18,
      emission: 25,
      emissionStrength: 26,
      ior: 3,
      roughness: 2,
      specularIorLevel: 11,
      transmission: 16,
    },
  ],
]);

const getPrincipledNode = (material) =>
  material.nodeGraph?.nodes?.find(
    ({ type }) => type === "BSDF_PRINCIPLED_BL",
  ) ?? null;

const getEmissionNode = (material) =>
  material.nodeGraph?.nodes?.find(
    ({ type }) => type === "EMISSION_BL",
  ) ?? null;

const getPrincipledLayout = (node) =>
  PRINCIPLED_LAYOUTS.get(node?.inputs?.length) ?? null;

const getEmissionStrength = (material) => {
  const node = getPrincipledNode(material);
  const layout = getPrincipledLayout(node);

  if (layout) {
    return Number(node.inputs[layout.emissionStrength]) || 0;
  }

  const emissionNode = getEmissionNode(material);

  if (emissionNode) {
    return Number(emissionNode.inputs[1]) || 0;
  }

  return Number(material.emissiveIntensity) || 0;
};

const getMeshVolume = (mesh) => {
  const size = new Box3().setFromObject(mesh).getSize(new Vector3());

  return Math.max(size.x * size.y * size.z, Number.EPSILON);
};

const findInnerMaterials = (visual, materials) => {
  const strongestEmission = Math.max(
    ...materials.map(getEmissionStrength),
    0,
  );

  if (strongestEmission > INNER_EMISSION_THRESHOLD) {
    return new Set(
      materials.filter(
        (material) =>
          getEmissionStrength(material) >= strongestEmission * 0.35,
      ),
    );
  }

  const meshes = [];

  visual.updateMatrixWorld(true);
  visual.traverse((object) => {
    if (object.isMesh) {
      meshes.push(object);
    }
  });
  meshes.sort((first, second) => getMeshVolume(first) - getMeshVolume(second));

  const smallestMeshMaterials = Array.isArray(meshes[0]?.material)
    ? meshes[0].material
    : [meshes[0]?.material];

  return new Set(smallestMeshMaterials.filter(Boolean));
};

const updateNodeMaterial = (material, updateInputs) => {
  const node = getPrincipledNode(material);
  const layout = getPrincipledLayout(node);

  if (!layout) {
    return false;
  }

  updateInputs(node.inputs, layout);
  material.updateNodeGraph?.();
  material.needsUpdate = true;
  return true;
};

const getEmissionStrengthForColor = (color) => {
  const relativeLuminance =
    0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const strength = INNER_EMISSION_TARGET_LUMINANCE / Math.max(
    relativeLuminance,
    Number.EPSILON,
  );

  return Math.min(
    INNER_EMISSION_MAX_STRENGTH,
    Math.max(INNER_EMISSION_MIN_STRENGTH, strength),
  );
};

const updateEmissionNodeMaterial = (material, color, emissionStrength) => {
  const node = getEmissionNode(material);

  if (!node) {
    return false;
  }

  node.inputs[0] = getNodeColor(color);
  node.inputs[1] = emissionStrength;
  material.updateNodeGraph?.();
  material.needsUpdate = true;
  return true;
};

const styleGlassMaterial = (material) => {
  updateNodeMaterial(material, (inputs, layout) => {
    inputs[layout.alpha] = GLASS_ALPHA;
    inputs[layout.ior] = GLASS_IOR;
    inputs[layout.specularIorLevel] = Math.max(
      Number(inputs[layout.specularIorLevel]) || 0,
      GLASS_SPECULAR_IOR_LEVEL,
    );
    inputs[layout.roughness] = Math.min(
      Number(inputs[layout.roughness]) || GLASS_ROUGHNESS,
      GLASS_ROUGHNESS,
    );
    inputs[layout.transmission] = Math.max(
      Number(inputs[layout.transmission]) || 0,
      GLASS_TRANSMISSION,
    );
    inputs[layout.clearcoat] = Math.max(
      Number(inputs[layout.clearcoat]) || 0,
      GLASS_CLEARCOAT,
    );
    inputs[layout.clearcoatRoughness] = GLASS_CLEARCOAT_ROUGHNESS;
  });

  material.blending = NormalBlending;
  material.depthWrite = false;
  material.envMapIntensity = Math.max(
    Number(material.envMapIntensity) || 0,
    GLASS_ENVIRONMENT_INTENSITY,
  );
  material.opacity = 1;
  material.side = DoubleSide;
  material.transparent = true;
  material.needsUpdate = true;
};

const getNodeColor = (color) => [color.r, color.g, color.b, 1];

const styleInnerMaterial = (material, color) => {
  const emissionStrength = getEmissionStrengthForColor(color);
  let updatedNodeMaterial = updateNodeMaterial(
    material,
    (inputs, layout) => {
      inputs[layout.alpha] = 1;
      inputs[layout.baseColor] = getNodeColor(color);
      inputs[layout.emission] = getNodeColor(color);
      inputs[layout.transmission] = 0;
      inputs[layout.emissionStrength] = emissionStrength;
    },
  );

  if (!updatedNodeMaterial) {
    updatedNodeMaterial = updateEmissionNodeMaterial(
      material,
      color,
      emissionStrength,
    );
  }

  if (!updatedNodeMaterial && material.emissive) {
    material.color?.copy(color);
    material.emissive.copy(color);
    material.emissiveIntensity = emissionStrength;
  }

  material.blending = NormalBlending;
  material.depthWrite = true;
  material.opacity = 1;
  material.side = FrontSide;
  material.transparent = true;
  material.needsUpdate = true;
};

const getCoreColor = (innerMaterials, fallbackColor) => {
  if (fallbackColor !== undefined && fallbackColor !== null) {
    return new Color(fallbackColor);
  }

  for (const material of innerMaterials) {
    const node = getPrincipledNode(material);
    const layout = getPrincipledLayout(node);
    const emissionNode = getEmissionNode(material);
    const emission = layout
      ? node.inputs[layout.emission]
      : emissionNode?.inputs[0];

    if (!Array.isArray(emission)) {
      continue;
    }

    const color = new Color(emission[0], emission[1], emission[2]);
    const strongestChannel = Math.max(color.r, color.g, color.b);

    if (strongestChannel > 0) {
      color.multiplyScalar(1 / strongestChannel);
      return color;
    }
  }

  return new Color(0x8b5cf6);
};

const addCoreLight = (visual, color) => {
  const boundsSize = new Box3().setFromObject(visual).getSize(new Vector3());
  const diameter = Math.max(boundsSize.x, boundsSize.y, boundsSize.z);
  const light = new PointLight(
    color,
    INNER_LIGHT_INTENSITY,
    diameter * INNER_LIGHT_DISTANCE_RATIO,
    INNER_LIGHT_DECAY,
  );

  light.name = "GemCoreLight";
  visual.add(light);
};

const orderGemMeshes = (visual, innerMaterials) => {
  visual.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    const meshMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const isInner = meshMaterials.some((material) =>
      innerMaterials.has(material)
    );

    object.renderOrder = isInner ? 2 : 1;
  });
};

export const styleGemMaterials = ({
  addLight = true,
  color,
  materials,
  visual,
}) => {
  const innerMaterials = findInnerMaterials(visual, materials);
  const coreColor = getCoreColor(innerMaterials, color);

  materials.forEach((material) => {
    if (innerMaterials.has(material)) {
      styleInnerMaterial(material, coreColor);
    } else {
      styleGlassMaterial(material);
    }
  });

  orderGemMeshes(visual, innerMaterials);
  if (addLight) {
    addCoreLight(visual, coreColor);
  }
};
