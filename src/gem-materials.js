import {
  Box3,
  Color,
  DoubleSide,
  FrontSide,
  NormalBlending,
  PointLight,
  Vector3,
} from "three";
import MeshTransmissionMaterialImpl from "./transmissionmaterial.js";

const GLASS_CLEARCOAT = 0.9;
const GLASS_CLEARCOAT_ROUGHNESS = 0.035;
const GLASS_ENVIRONMENT_INTENSITY = 1.4;
const GLASS_IOR = 1.52;
const GLASS_ROUGHNESS = 0.045;
const GLASS_SPECULAR_IOR_LEVEL = 0.65;
const INNER_EMISSION_MAX_STRENGTH = 4;
const INNER_EMISSION_MIN_STRENGTH = 1;
const INNER_EMISSION_TARGET_LUMINANCE = 0.65;
const INNER_EMISSION_THRESHOLD = 0.05;
const INNER_LIGHT_DECAY = 1.5;
const INNER_LIGHT_DISTANCE_RATIO = 3.2;
const INNER_LIGHT_INTENSITY = 1.8;

const getEmissionStrength = (material) => {
  return Number(material.emissiveIntensity) || (material.emissive ? 1 : 0);
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

const getEmissionStrengthForColor = (color) => {
  const relativeLuminance =
    0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const strength =
    INNER_EMISSION_TARGET_LUMINANCE /
    Math.max(relativeLuminance, Number.EPSILON);

  return Math.min(
    INNER_EMISSION_MAX_STRENGTH,
    Math.max(INNER_EMISSION_MIN_STRENGTH, strength),
  );
};

/**
 * Create a MeshTransmissionMaterialImpl configured for gem glass appearance.
 * The material requires a `buffer` uniform to be set each frame with an FBO
 * texture of the scene rendered behind the transparent object.
 */
const createGlassMaterial = (color) => {
  const material = new MeshTransmissionMaterialImpl(6, false);

  // Physical base properties
  material.color = color ?? new Color(0xffffff);
  material.roughness = GLASS_ROUGHNESS;
  material.ior = GLASS_IOR;
  material.clearcoat = GLASS_CLEARCOAT;
  material.clearcoatRoughness = GLASS_CLEARCOAT_ROUGHNESS;
  material.specularIntensity = GLASS_SPECULAR_IOR_LEVEL;
  material.envMapIntensity = GLASS_ENVIRONMENT_INTENSITY;
  material.side = DoubleSide;
  material.depthWrite = false;
  material.transparent = true;
  material.blending = NormalBlending;

  // Transmission uniforms (managed by the custom shader)
  material._transmission = 1;
  material.thickness = 0.5;
  material.chromaticAberration = 0.06;
  material.anisotropicBlur = 0.1;
  material.distortion = 0.0;
  material.distortionScale = 0.3;
  material.temporalDistortion = 0.0;
  material.attenuationDistance = 0.5;
  material.attenuationColor = color ?? new Color(0xffffff);

  material.needsUpdate = true;
  return material;
};

const styleInnerMaterial = (material, color) => {
  const emissionStrength = getEmissionStrengthForColor(color);

  if (material.color) {
    material.color.copy(color);
  }
  if (material.emissive) {
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
    if (material.emissive) {
      const color = material.emissive.clone();
      const strongestChannel = Math.max(color.r, color.g, color.b);

      if (strongestChannel > 0) {
        color.multiplyScalar(1 / strongestChannel);
        return color;
      }
    }
    if (material.color) {
      return material.color.clone();
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

  visual.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    if (Array.isArray(object.material)) {
      object.material = object.material.map((mat) => {
        if (innerMaterials.has(mat)) {
          styleInnerMaterial(mat, coreColor);
          return mat;
        }
        const glassMat = createGlassMaterial(coreColor);
        const matIdx = materials.indexOf(mat);

        if (matIdx !== -1) {
          materials[matIdx] = glassMat;
        }
        return glassMat;
      });
    } else if (object.material) {
      const mat = object.material;

      if (innerMaterials.has(mat)) {
        styleInnerMaterial(mat, coreColor);
      } else {
        const glassMat = createGlassMaterial(coreColor);
        const matIdx = materials.indexOf(mat);

        if (matIdx !== -1) {
          materials[matIdx] = glassMat;
        }
        object.material = glassMat;
      }
    }
  });

  orderGemMeshes(visual, innerMaterials);
  if (addLight) {
    addCoreLight(visual, coreColor);
  }
};
