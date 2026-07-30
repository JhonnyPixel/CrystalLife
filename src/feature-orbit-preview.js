import {
  AgXBlenderToneMapping,
  AmbientLight,
  App,
  DirectionalLight,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  SRGBColorSpace,
} from "verge3d";
import {
  GEM_ASSETS,
  GEM_MODEL_URLS,
} from "./gem-assets.js";
import { styleGemMaterials } from "./gem-materials.js";
import { GemModelFactory } from "./gem-model.js";
import {
  styleSunMaterials,
  SunEffects,
} from "./sun-effects.js";

const CORE_SIZE = 0.7;
const MAX_DELTA_SECONDS = 0.05;
const MODULE_DEFINITIONS = [
  {
    binaryUrl: GEM_ASSETS.mind.binaryUrl,
    color: 0x8b5cf6,
    distance: 1.22,
    modelUrl: GEM_MODEL_URLS.mind,
    size: 0.2,
    speed: 0.5,
  },
  {
    binaryUrl: GEM_ASSETS.body.binaryUrl,
    color: 0xb6f34a,
    distance: 1.62,
    modelUrl: GEM_MODEL_URLS.body,
    size: 0.18,
    speed: 0.41,
  },
  {
    binaryUrl: GEM_ASSETS.discipline.binaryUrl,
    color: 0xf97316,
    distance: 2.02,
    modelUrl: GEM_MODEL_URLS.discipline,
    size: 0.17,
    speed: 0.34,
  },
  {
    binaryUrl: GEM_ASSETS.relationships.binaryUrl,
    color: 0xec4899,
    distance: 2.42,
    modelUrl: GEM_MODEL_URLS.relationships,
    size: 0.16,
    speed: 0.28,
  },
  {
    binaryUrl: GEM_ASSETS.growth.binaryUrl,
    color: 0x3b82f6,
    distance: 2.82,
    modelUrl: GEM_MODEL_URLS.growth,
    size: 0.15,
    speed: 0.23,
  },
];

const disposeMesh = (mesh) => {
  mesh.geometry?.dispose();
  mesh.material?.dispose();
};

export class FeatureOrbitPreview {
  constructor(element) {
    this.element = element;
    this.modules = [];
    this.lastFrameTime = performance.now();
    this.isVisible = true;
    this.prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    this.createScene();
    this.createCore();
    this.createModules();
    this.createLights();
    this.observeSize();
    this.observeVisibility();
    this.resize();
    void this.loadModels();
    this.frameId = requestAnimationFrame(this.render);
  }

  createScene() {
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(48, 1, 0.1, 30);
    this.camera.position.set(0, 7.8, 0.01);
    this.camera.lookAt(0, 0, 0);

    this.app = new App(this.element, {
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.app.registerServiceKeys = false;
    this.app.scene = this.scene;
    this.app.setCamera(this.camera);

    this.renderer = this.app.renderer;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = AgXBlenderToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = false;

    this.world = new Group();
    this.scene.add(this.world);
  }

  createCore() {
    const body = new Mesh(
      new IcosahedronGeometry(CORE_SIZE, 1),
      new MeshStandardMaterial({
        color: 0x1c1238,
        emissive: 0x8b5cf6,
        emissiveIntensity: 0.42,
        flatShading: true,
        metalness: 0.08,
        roughness: 0.22,
      }),
    );
    const shell = new Mesh(
      new IcosahedronGeometry(CORE_SIZE * 1.1, 2),
      new MeshBasicMaterial({
        color: 0x8b5cf6,
        opacity: 0.24,
        transparent: true,
        wireframe: true,
      }),
    );

    this.coreFallback = new Group();
    this.coreFallback.add(body, shell);
    this.core = new Group();
    this.core.add(this.coreFallback);
    this.sunEffects = new SunEffects({
      distance: 8,
      intensity: 2.8,
    });
    this.core.add(this.sunEffects.root);
    this.world.add(this.core);
  }

  createModules() {
    MODULE_DEFINITIONS.forEach((definition, index) => {
      const fallback = new Mesh(
        new IcosahedronGeometry(definition.size, 0),
        new MeshStandardMaterial({
          color: definition.color,
          emissive: definition.color,
          emissiveIntensity: 0.08,
          flatShading: true,
          roughness: 0.28,
        }),
      );
      const mesh = new Group();
      const angle =
        (index / MODULE_DEFINITIONS.length) * Math.PI * 2 + 0.35;

      mesh.add(fallback);
      this.world.add(mesh);
      this.modules.push({
        angle,
        definition,
        fallback,
        mesh,
        visual: fallback,
      });

      const orbit = new Mesh(
        new RingGeometry(
          definition.distance - 0.009,
          definition.distance + 0.009,
          120,
        ),
        new MeshBasicMaterial({
          color: 0xe3e2e3,
          depthWrite: false,
          opacity: 0.11,
          side: DoubleSide,
          transparent: true,
        }),
      );

      orbit.rotation.x = Math.PI / 2;
      this.world.add(orbit);
    });
  }

  createLights() {
    const keyLight = new DirectionalLight(0xffffff, 1.45);
    const rimLight = new DirectionalLight(0xcab9ff, 1.05);

    keyLight.position.set(4, 7, 6);
    rimLight.position.set(-4, 3, -5);
    this.scene.add(
      new AmbientLight(0xffffff, 0.5),
      keyLight,
      rimLight,
    );
  }

  async loadModels() {
    const results = await Promise.allSettled([
      this.loadCoreModel(),
      ...this.modules.map((module) => this.loadModuleModel(module)),
    ]);
    const environmentFactory = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value)
      .find((factory) => factory?.applyEnvironment(this.scene));

    if (environmentFactory) {
      this.app.updateEnvironment(this.scene.worldMaterial);
    }

    this.element.classList.add("is-ready");
  }

  async loadCoreModel() {
    const factory = new GemModelFactory({
      binaryUrl: GEM_ASSETS.center.binaryUrl,
      modelUrl: GEM_MODEL_URLS.center,
    });

    await factory.load();
    const { materials, visual } = factory.create({ size: CORE_SIZE });

    styleSunMaterials(materials, visual);
    this.core.remove(this.coreFallback);
    this.coreFallback.traverse(disposeMesh);
    this.core.add(visual);
    this.coreFallback = null;
    return factory;
  }

  async loadModuleModel(module) {
    const factory = new GemModelFactory({
      binaryUrl: module.definition.binaryUrl,
      modelUrl: module.definition.modelUrl,
    });

    await factory.load();
    const { materials, visual } = factory.create({
      size: module.definition.size,
    });

    styleGemMaterials({
      color: module.definition.color,
      materials,
      visual,
    });
    module.mesh.remove(module.fallback);
    disposeMesh(module.fallback);
    module.mesh.add(visual);
    module.visual = visual;
    module.fallback = null;
    return factory;
  }

  observeSize() {
    if (!("ResizeObserver" in window)) {
      window.addEventListener("resize", this.resize, { passive: true });
      return;
    }

    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.element);
  }

  observeVisibility() {
    if (!("IntersectionObserver" in window)) {
      return;
    }

    this.visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        this.isVisible = entry.isIntersecting;
        this.lastFrameTime = performance.now();
      },
      { rootMargin: "20% 0px" },
    );
    this.visibilityObserver.observe(this.element);
  }

  resize = () => {
    const width = Math.max(this.element.clientWidth, 1);
    const height = Math.max(this.element.clientHeight, 1);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  render = (frameTime) => {
    const deltaSeconds = Math.min(
      (frameTime - this.lastFrameTime) / 1000,
      MAX_DELTA_SECONDS,
    );
    this.lastFrameTime = frameTime;

    if (this.isVisible) {
      this.update(deltaSeconds);
      this.renderer.render(this.scene, this.camera);
    }

    this.frameId = requestAnimationFrame(this.render);
  };

  update(deltaSeconds) {
    const motionScale = this.prefersReducedMotion ? 0 : 1;

    this.core.rotation.y += deltaSeconds * 0.28 * motionScale;
    this.core.rotation.x += deltaSeconds * 0.12 * motionScale;
    this.sunEffects.update(deltaSeconds, this.prefersReducedMotion);
    this.modules.forEach((module) => {
      module.angle +=
        module.definition.speed * deltaSeconds * motionScale;
      module.mesh.position.set(
        Math.cos(module.angle) * module.definition.distance,
        0,
        Math.sin(module.angle) * module.definition.distance,
      );
      module.visual.rotation.y += deltaSeconds * 0.65 * motionScale;
      module.visual.rotation.x += deltaSeconds * 0.24 * motionScale;
    });
  }
}
