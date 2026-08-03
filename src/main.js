import {
  AdditiveBlending,
  AgXToneMapping,
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PointLight,
  RingGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import {
  GEM_ASSETS,
  GEM_MODEL_URLS,
} from "./gem-assets.js";
import { FeatureOrbitPreview } from "./feature-orbit-preview.js";
import { GemInfoCard } from "./gem-info-card.js";
import { GemInteractionController } from "./gem-interaction.js";
import { HeroGemGallery } from "./hero-gem-gallery.js";
import { HeroShowcase } from "./hero-showcase.js";
import { initializeIPhoneShells } from "./iphone-shell.js";
import { styleGemMaterials } from "./gem-materials.js";
import { GemModelFactory } from "./gem-model.js";
import { ModuleGemGallery } from "./module-gem-gallery.js";
import {
  initializeMobilePerformanceMode,
  observeRenderVisibility,
  RenderBudget,
  scheduleIdleTask,
} from "./render-performance.js";
import { SpaceBackground } from "./space-background.js";
import {
  styleSunMaterials,
  SunEffects,
} from "./sun-effects.js";
import "./styles.css";

initializeMobilePerformanceMode();

const spaceBackgroundCanvas = document.querySelector(
  "[data-space-background]",
);

if (spaceBackgroundCanvas) {
  new SpaceBackground(spaceBackgroundCanvas);
}

const showcaseElement = document.querySelector("[data-showcase-story]");
const heroOrbitElement = document.querySelector("[data-hero-orbit]");
let heroOrbitPreview;

if (heroOrbitElement) {
  try {
    heroOrbitPreview = new FeatureOrbitPreview(heroOrbitElement);
  } catch (error) {
    console.error(
      "Impossibile inizializzare l'orbita della dashboard.",
      error,
    );
    heroOrbitElement.classList.add("is-fallback");
  }
}

scheduleIdleTask(() => {
  void initializeIPhoneShells();

  document
    .querySelectorAll("[data-hero-gem-gallery], [data-hero-detail-gallery]")
    .forEach((element) => {
      try {
        new HeroGemGallery(element);
      } catch (error) {
        console.error("Impossibile inizializzare le gemme della hero.", error);
      }
    });
});

(() => {
  "use strict";

  const CORE_MODEL_SIZE = 1.76;
  const INTERACTION_START = 0.42;
  const CAMERA_FOV_DEGREES = 58;
  const INITIAL_CAMERA_HEIGHT = 24;
  const FINAL_CAMERA_HEIGHT = 14;
  const MOBILE_VIEWPORT_QUERY =
    "(max-width: 560px), (hover: none) and (pointer: coarse)";
  const MOBILE_ORBIT_SCALE_BOOST = 1.1;
  const MOBILE_ORBIT_OPACITY = 0.16;
  const ORBIT_OPACITY = 0.075;
  const ORBIT_SCREEN_EDGE_RATIO = 0.94;
  const GEM_HINT_DURATION_SECONDS = 1.35;
  const GEM_HINT_DELAY_MIN_SECONDS = 2.4;
  const GEM_HINT_DELAY_MAX_SECONDS = 4.2;
  const storyElement = document.querySelector("[data-orbit-story]");
  const canvasElement = document.querySelector("[data-orbit-canvas]");
  const gemStatusElement = document.querySelector("[data-gem-status]");
  const gemInfoElement = document.querySelector("[data-gem-info]");
  const featureOrbitElement = document.querySelector(
    "[data-feature-orbit]",
  );
  const moduleCardElements = [
    ...document.querySelectorAll("[data-module-card]"),
  ];

  if (!storyElement || !canvasElement) {
    return;
  }

  const clamp = (value, min = 0, max = 1) =>
    Math.min(max, Math.max(min, value));

  const lerp = (start, end, progress) =>
    start + (end - start) * progress;

  const smoothstep = (start, end, value) => {
    const progress = clamp((value - start) / (end - start));
    return progress * progress * (3 - 2 * progress);
  };

  const createInteractionGlowTexture = () => {
    const canvas = document.createElement("canvas");

    canvas.width = 128;
    canvas.height = 128;

    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);

    gradient.addColorStop(0, "rgba(255, 255, 255, 0.92)");
    gradient.addColorStop(0.2, "rgba(255, 255, 255, 0.58)");
    gradient.addColorStop(0.52, "rgba(255, 255, 255, 0.16)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);

    const texture = new CanvasTexture(canvas);

    texture.colorSpace = SRGBColorSpace;
    return texture;
  };

  const disposeRenderable = (root) => {
    root.traverse((object) => {
      object.geometry?.dispose();

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.filter(Boolean).forEach((material) => material.dispose());
    });
  };

  class OrbitExperience {
    constructor(container) {
      this.container = container;
      this.progress = 0;
      this.introProgress = 0;
      this.elapsedSeconds = 0;
      this.lastFrameTime = performance.now();
      this.isVisible = true;
      this.isInteractive = false;
      this.isIntroVisible = true;
      this.isStoryVisible = false;
      this.renderBudget = new RenderBudget({
        desktopPixelRatio: 1.8,
        mobileFps: 60,
        mobilePixelRatio: 1.35,
      });
      this.prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      this.mobileViewport = window.matchMedia(MOBILE_VIEWPORT_QUERY);
      this.activeHintIndex = null;
      this.hintStartedAt = 0;
      this.lastHintIndex = null;
      this.nextHintAt = Number.POSITIVE_INFINITY;
      this.interactionGlowTexture = createInteractionGlowTexture();
      this.loaderLabel = container.querySelector(
        "[data-orbit-loader-label]",
      );
      this.hasEnvironment = false;
      this.modelLoadStarted = false;
      this.modules = [];
      this.orbits = [];

      this.createScene();
      this.createCore();
      this.createModules();
      this.createLights();
      this.createInfoCard();
      this.createInteractions();
      this.observeSize();
      this.observeVisibility();
      this.resize();
      this.container.classList.add("is-renderable");

      scheduleIdleTask(this.loadModelsOnce);
      this.frameId = requestAnimationFrame(this.render);
    }

    loadModelsOnce = () => {
      if (this.modelLoadStarted) {
        return;
      }

      this.modelLoadStarted = true;
      void this.loadModels();
    };

    createScene() {
      this.scene = new Scene();
      this.camera = new PerspectiveCamera(
        CAMERA_FOV_DEGREES,
        1,
        0.1,
        100,
      );
      this.camera.up.set(0, 0, -1);
      this.renderer = new WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
      this.container.append(this.renderer.domElement);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setPixelRatio(this.renderBudget.getPixelRatio());
      this.renderer.toneMapping = AgXToneMapping;
      this.renderer.toneMappingExposure = 1;
      this.renderer.shadowMap.enabled = false;
      this.renderer.shadowMap.type = PCFSoftShadowMap;
      this.renderer.shadowMap.type = PCFSoftShadowMap;

      this.renderer.outputColorSpace = SRGBColorSpace;
      this.renderer.domElement.addEventListener(
        "webglcontextlost",
        this.onContextLost,
        false,
      );
      this.renderer.domElement.addEventListener(
        "webglcontextrestored",
        this.onContextRestored,
        false,
      );

      this.world = new Group();
      this.scene.add(this.world);
    }

    createCore() {
      const primary = new Color(0x8b5cf6);

      const coreGeometry = new IcosahedronGeometry(1.48, 1);
      const coreMaterial = new MeshStandardMaterial({
        color: 0x1c1238,
        emissive: primary,
        emissiveIntensity: 0.48,
        flatShading: true,
        metalness: 0.08,
        roughness: 0.22,
      });
      const coreBody = new Mesh(coreGeometry, coreMaterial);

      const shellGeometry = new IcosahedronGeometry(1.62, 2);
      const shellMaterial = new MeshBasicMaterial({
        color: primary,
        wireframe: true,
        transparent: true,
        opacity: 0.2,
      });
      this.shell = new Mesh(shellGeometry, shellMaterial);
      this.coreFallback = new Group();
      this.coreFallback.add(coreBody, this.shell);

      this.core = new Group();
      this.core.add(this.coreFallback);
      this.sunEffects = new SunEffects({
        distance: 22,
        intensity: 5.2,
      });
      this.core.add(this.sunEffects.root);
      this.world.add(this.core);
    }

    async loadModels() {
      const tasks = [
        { label: "Centro", promise: this.loadCoreModel() },
        ...this.modules.map((module) => ({
          label: module.definition.name,
          promise: this.loadGemModel(module),
        })),
      ];
      const results = await Promise.allSettled(
        tasks.map(({ promise }) => promise),
      );
      const failedTasks = results
        .map((result, index) => ({ result, task: tasks[index] }))
        .filter(({ result }) => result.status === "rejected");

      failedTasks.forEach(({ result, task }) => {
        console.warn(
          `Modello Verge3D "${task.label}" non disponibile.`,
          result.reason,
        );
      });

      this.finishLoading(failedTasks.length);
    }

    finishLoading(failedModelCount) {
      this.container.classList.add("is-ready");
      this.container.setAttribute("aria-busy", "false");

      if (!this.loaderLabel) {
        return;
      }

      this.loaderLabel.textContent = failedModelCount
        ? "Orbita pronta con grafica semplificata"
        : "Orbita pronta";
    }

    applyModelEnvironment(factory) {
      if (this.hasEnvironment || !factory.applyEnvironment(this.scene)) {
        return;
      }

      this.hasEnvironment = true;
    }

    async loadCoreModel() {
      const factory = new GemModelFactory({
        binaryUrl: GEM_ASSETS.center.binaryUrl,
        modelUrl: GEM_MODEL_URLS.center,
      });

      await factory.load();
      this.applyModelEnvironment(factory);
      this.replaceCoreFallback(factory);
    }

    replaceCoreFallback(modelFactory) {
      const { materials, visual } = modelFactory.create({
        size: CORE_MODEL_SIZE,
      });
      const fallback = this.coreFallback;

      styleSunMaterials(materials, visual);
      this.core.remove(fallback);
      disposeRenderable(fallback);
      this.core.add(visual);
      this.coreFallback = null;
      this.shell = null;
    }

    createModules() {
      const definitions = [
        {
          name: "Mente",
          description:
            "Chiarezza, journaling e spazio mentale per scegliere con intenzione.",
          cssColor: "#8b5cf6",
          color: 0x8b5cf6,
          distance: 3.2,
          binaryUrl: GEM_ASSETS.mind.binaryUrl,
          modelUrl: GEM_MODEL_URLS.mind,
          speed: 0.48,
          size: 0.52,
        },
        {
          name: "Corpo",
          description:
            "Energia, allenamento e recupero come fondamenta quotidiane.",
          cssColor: "#b6f34a",
          color: 0xb6f34a,
          distance: 3.9,
          binaryUrl: GEM_ASSETS.body.binaryUrl,
          modelUrl: GEM_MODEL_URLS.body,
          speed: 0.39,
          size: 0.46,
        },
        {
          name: "Disciplina",
          description:
            "Promesse mantenute, attenzione protetta e azioni che restano.",
          cssColor: "#f97316",
          color: 0xf97316,
          distance: 4.6,
          binaryUrl: GEM_ASSETS.discipline.binaryUrl,
          modelUrl: GEM_MODEL_URLS.discipline,
          speed: 0.31,
          size: 0.41,
        },
        {
          name: "Relazioni",
          description:
            "Presenza reale e tempo di qualità per le persone che contano.",
          cssColor: "#ec4899",
          color: 0xec4899,
          distance: 5.3,
          binaryUrl: GEM_ASSETS.relationships.binaryUrl,
          modelUrl: GEM_MODEL_URLS.relationships,
          speed: 0.26,
          size: 0.36,
        },
        {
          name: "Crescita",
          description:
            "Obiettivi leggibili e progresso continuo, senza rumore.",
          cssColor: "#3b82f6",
          color: 0x3b82f6,
          distance: 6,
          binaryUrl: GEM_ASSETS.growth.binaryUrl,
          modelUrl: GEM_MODEL_URLS.growth,
          speed: 0.21,
          size: 0.32,
        },
      ];

      definitions.forEach((definition, index) => {
        const geometry = new IcosahedronGeometry(definition.size, 0);
        const material = new MeshStandardMaterial({
          color: definition.color,
          emissive: definition.color,
          emissiveIntensity: 0.1,
          flatShading: true,
          metalness: 0.02,
          roughness: 0.28,
        });
        material.userData.restEmissiveIntensity = 0.1;
        material.userData.activeEmissiveIntensity = 0.72;

        const visual = new Mesh(geometry, material);
        const mesh = new Group();
        const angle = (index / definitions.length) * Math.PI * 2 + 0.3;
        mesh.userData.gemIndex = index;
        mesh.add(visual);

        const hitArea = new Mesh(
          new IcosahedronGeometry(definition.size * 1.9, 1),
          new MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        hitArea.userData.gemIndex = index;
        mesh.add(hitArea);

        const light = new PointLight(definition.color, 1.35, 3.8);
        const hintGlow = new Sprite(
          new SpriteMaterial({
            map: this.interactionGlowTexture,
            color: definition.color,
            blending: AdditiveBlending,
            depthWrite: false,
            opacity: 0,
            transparent: true,
          }),
        );

        hintGlow.scale.setScalar(definition.size * 4);
        mesh.add(light, hintGlow);
        this.world.add(mesh);
        this.modules.push({
          index,
          mesh,
          hitArea,
          hintGlow,
          light,
          visual,
          visualMaterials: [material],
          definition,
          orbitDistance: definition.distance,
          angle,
          angularVelocity: definition.speed,
          isDragging: false,
          isStopped: false,
        });

        const orbitGeometry = new RingGeometry(
          definition.distance - 0.018,
          definition.distance + 0.018,
          160,
        );
        const orbitMaterial = new MeshBasicMaterial({
          color: 0xe3e2e3,
          transparent: true,
          opacity: this.mobileViewport.matches
            ? MOBILE_ORBIT_OPACITY
            : ORBIT_OPACITY,
          side: DoubleSide,
          depthWrite: false,
        });
        const orbit = new Mesh(orbitGeometry, orbitMaterial);
        orbit.rotation.x = Math.PI / 2;
        this.world.add(orbit);
        this.orbits.push(orbit);
      });
    }

    async loadGemModel(module) {
      const factory = new GemModelFactory({
        binaryUrl: module.definition.binaryUrl,
        modelUrl: module.definition.modelUrl,
      });

      await factory.load();
      this.applyModelEnvironment(factory);
      this.replaceGemFallback(module, factory);
    }

    replaceGemFallback(module, modelFactory) {
      const { materials, visual } = modelFactory.create(module.definition);
      const fallback = module.visual;

      styleGemMaterials({
        addLight: false,
        color: module.definition.color,
        materials,
        visual,
      });
      module.mesh.remove(fallback);
      fallback.geometry.dispose();
      fallback.material.dispose();
      module.mesh.add(visual);
      module.visual = visual;
      module.visualMaterials = materials;
    }

    createLights() {
      this.scene.add(new AmbientLight(0xffffff, 0.22));

      const keyLight = new DirectionalLight(0xffffff, 0.48);
      keyLight.position.set(4, 8, 7);
      this.scene.add(keyLight);

      const rimLight = new DirectionalLight(0xff9a52, 0.42);
      rimLight.position.set(-5, 4, -6);
      this.scene.add(rimLight);
    }

    createInfoCard() {
      this.infoCard = new GemInfoCard({
        element: gemInfoElement,
        container: this.container,
        onRelease: this.releaseGem,
      });
    }

    createInteractions() {
      this.interactions = new GemInteractionController({
        container: this.container,
        camera: this.camera,
        world: this.world,
        modules: this.modules,
        statusElement: gemStatusElement,
        onDragStart: this.startDraggingGem,
        onDrag: this.dragGem,
        onThrow: this.throwGem,
        onStop: this.stopGem,
      });
    }

    setProgress(progress) {
      this.progress = clamp(progress);
      const shouldBeInteractive = this.progress >= INTERACTION_START;

      if (shouldBeInteractive === this.isInteractive) {
        return;
      }

      this.isInteractive = shouldBeInteractive;
      this.interactions?.setEnabled(shouldBeInteractive);

      if (shouldBeInteractive) {
        this.scheduleInteractionHint(0.7, 0.7);
      } else {
        this.resetInteractionHint();
        this.resetGemStates();
      }
    }

    onContextLost = (event) => {
      event.preventDefault();
      this.container.classList.add("is-fallback");

      if (this.frameId !== null) {
        cancelAnimationFrame(this.frameId);
        this.frameId = null;
      }
    };

    onContextRestored = () => {
      this.container.classList.remove("is-fallback");
      this.resize();
      this.requestRender();
    };

    setIntroProgress(progress) {
      this.introProgress = clamp(progress);
      if (this.introProgress > 0.005) {
        this.loadModelsOnce();
      }
      this.requestRender();
    }

    setIntroVisible(isVisible) {
      this.isIntroVisible = isVisible;
      this.requestRender();
    }

    setStoryVisible(isVisible) {
      this.isStoryVisible = isVisible;
      if (isVisible) {
        this.loadModelsOnce();
      }
      this.container.classList.toggle("is-presented", isVisible);
      this.requestRender();
    }

    isSceneActive() {
      return (
        this.isVisible &&
        (this.isStoryVisible ||
          (this.isIntroVisible && this.introProgress > 0.005))
      );
    }

    requestRender() {
      if (this.frameId === null && this.isSceneActive()) {
        this.lastFrameTime = performance.now();
        this.renderBudget.reset();
        this.frameId = requestAnimationFrame(this.render);
      }
    }

    startDraggingGem = (gemIndex) => {
      const module = this.modules[gemIndex];

      if (!module) {
        return;
      }

      this.infoCard.close();
      module.isDragging = true;
      module.isStopped = false;
      module.angularVelocity = 0;
    };

    dragGem = (gemIndex, angle) => {
      const module = this.modules[gemIndex];

      if (!module) {
        return;
      }

      module.angle = angle;
    };

    throwGem = (gemIndex, angularVelocity) => {
      const module = this.modules[gemIndex];

      if (!module) {
        return;
      }

      module.isDragging = false;
      module.isStopped = false;
      module.angularVelocity = angularVelocity;
    };

    stopGem = (gemIndex) => {
      const module = this.modules[gemIndex];

      if (!module) {
        return;
      }

      module.isDragging = false;
      module.isStopped = true;
      module.angularVelocity = 0;
      this.infoCard.show(module);
    };

    releaseGem = (gemIndex) => {
      const module = this.modules[gemIndex];

      if (!module) {
        return;
      }

      module.isStopped = false;
      module.angularVelocity = module.definition.speed;
      this.interactions?.playRelease(gemIndex);
    };

    resetGemStates() {
      this.modules.forEach((module) => {
        module.angularVelocity = module.definition.speed;
        module.isDragging = false;
        module.isStopped = false;
      });
      this.infoCard.hide();
    }

    scheduleInteractionHint(
      minimumDelay = GEM_HINT_DELAY_MIN_SECONDS,
      maximumDelay = GEM_HINT_DELAY_MAX_SECONDS,
    ) {
      this.nextHintAt =
        this.elapsedSeconds +
        lerp(minimumDelay, maximumDelay, Math.random());
    }

    resetInteractionHint() {
      this.activeHintIndex = null;
      this.nextHintAt = Number.POSITIVE_INFINITY;
      this.modules.forEach(({ hintGlow }) => {
        hintGlow.material.opacity = 0;
      });
    }

    updateInteractionHint() {
      if (!this.isInteractive || this.prefersReducedMotion) {
        return;
      }

      if (this.activeHintIndex !== null) {
        const hintAge = this.elapsedSeconds - this.hintStartedAt;

        if (hintAge < GEM_HINT_DURATION_SECONDS) {
          return;
        }

        this.activeHintIndex = null;
        this.scheduleInteractionHint();
        return;
      }

      if (this.elapsedSeconds < this.nextHintAt) {
        return;
      }

      let candidates = this.modules.filter(
        (module) => !module.isDragging && !module.isStopped,
      );

      if (candidates.length > 1) {
        candidates = candidates.filter(
          ({ index }) => index !== this.lastHintIndex,
        );
      }

      const selected =
        candidates[Math.floor(Math.random() * candidates.length)];

      if (!selected) {
        this.scheduleInteractionHint();
        return;
      }

      this.activeHintIndex = selected.index;
      this.lastHintIndex = selected.index;
      this.hintStartedAt = this.elapsedSeconds;
    }

    getInteractionHintStrength(gemIndex) {
      if (gemIndex !== this.activeHintIndex) {
        return 0;
      }

      const progress = clamp(
        (this.elapsedSeconds - this.hintStartedAt) /
          GEM_HINT_DURATION_SECONDS,
      );
      const envelope = Math.sin(progress * Math.PI);
      const pulse = 0.72 + Math.sin(progress * Math.PI * 6) ** 2 * 0.28;

      return envelope * pulse;
    }

    updateCamera() {
      const introZoomProgress = smoothstep(0.04, 0.94, this.introProgress);
      const storyZoomProgress = smoothstep(0.02, 0.62, this.progress);
      const introCameraHeight = lerp(
        42,
        INITIAL_CAMERA_HEIGHT,
        introZoomProgress,
      );

      this.camera.position.set(
        0.001,
        lerp(introCameraHeight, FINAL_CAMERA_HEIGHT, storyZoomProgress),
        0.01,
      );
      this.camera.lookAt(0, 0, 0);

      const responsiveScale = clamp(this.camera.aspect, 0.56, 1);
      const introApparentScale = lerp(0.58, 0.79, introZoomProgress);
      const apparentScale = lerp(
        introApparentScale,
        1,
        smoothstep(0.08, 0.9, this.progress),
      );
      const mobileScaleBoost = this.mobileViewport.matches
        ? MOBILE_ORBIT_SCALE_BOOST
        : 1;
      const worldScale =
        responsiveScale *
        apparentScale *
        mobileScaleBoost;
      this.world.scale.setScalar(worldScale);
      this.world.position.y = 0;
      this.world.rotation.y = 0.14;
    }

    updateObjects(deltaSeconds) {
      const motionFactor = this.prefersReducedMotion ? 0 : 1;

      this.elapsedSeconds += deltaSeconds * motionFactor;
      this.updateInteractionHint();
      this.core.rotation.y += deltaSeconds * 0.32 * motionFactor;
      this.core.rotation.x += deltaSeconds * 0.17 * motionFactor;
      if (this.shell) {
        this.shell.rotation.y -= deltaSeconds * 0.12 * motionFactor;
      }

      const pulse = this.prefersReducedMotion
        ? 1
        : 1 + Math.sin(this.elapsedSeconds * 2) * 0.035;
      this.core.scale.setScalar(pulse);
      this.sunEffects.update(
        deltaSeconds,
        this.prefersReducedMotion,
      );

      this.modules.forEach((module, index) => {
        const { mesh, definition, orbitDistance } = module;
        const hintStrength = this.getInteractionHintStrength(index);

        if (!module.isDragging && !module.isStopped) {
          const isUserDriven =
            Math.abs(module.angularVelocity - definition.speed) > 0.01;
          const orbitMotion = isUserDriven ? 1 : motionFactor;
          const recoveryProgress = 1 - Math.exp(-deltaSeconds * 0.55);

          module.angle +=
            deltaSeconds * module.angularVelocity * orbitMotion;
          module.angularVelocity = lerp(
            module.angularVelocity,
            definition.speed,
            recoveryProgress,
          );
        }

        if (!module.isStopped) {
          mesh.position.set(
            Math.cos(module.angle) * orbitDistance,
            0,
            Math.sin(module.angle) * orbitDistance,
          );
        }

        module.hintGlow.material.opacity = lerp(0.2, 0.82, hintStrength);
        module.hintGlow.scale.setScalar(
          definition.size * lerp(5, 7.2, hintStrength),
        );

        if (!module.isDragging && !module.isStopped) {
          const rotationSpeed = Math.max(
            0.45,
            Math.min(4.2, Math.abs(module.angularVelocity) * 1.8),
          );
          mesh.rotation.x +=
            deltaSeconds * 0.72 * rotationSpeed * motionFactor;
          mesh.rotation.y +=
            deltaSeconds * 1.05 * rotationSpeed * motionFactor;
        }

        const baseTargetScale = module.isDragging
          ? 1.38
          : module.isStopped
            ? 1.28
            : 1;
        const targetScale = baseTargetScale * (1 + hintStrength * 0.14);
        const feedbackStrength = Math.max(
          hintStrength,
          module.isDragging ? 1 : module.isStopped ? 0.72 : 0,
        );
        const feedbackProgress = clamp(deltaSeconds * 11);

        mesh.scale.setScalar(
          lerp(mesh.scale.x, targetScale, feedbackProgress),
        );
        module.visualMaterials.forEach((material) => {
          if (!Number.isFinite(material.emissiveIntensity)) {
            return;
          }

          const restEmission =
            material.userData.restEmissiveIntensity ?? 0.1;
          const activeEmission =
            material.userData.activeEmissiveIntensity ?? 0.72;
          const targetEmission = lerp(
            restEmission,
            activeEmission,
            feedbackStrength,
          );

          material.emissiveIntensity = lerp(
            material.emissiveIntensity,
            targetEmission,
            feedbackProgress,
          );
        });
        module.light.intensity = lerp(
          module.light.intensity,
          lerp(1.35, 3.1, feedbackStrength),
          feedbackProgress,
        );
      });
    }

    render = (frameTime) => {
      this.frameId = null;

      if (!this.isSceneActive()) {
        return;
      }

      if (!this.renderBudget.shouldRender(frameTime)) {
        this.frameId = requestAnimationFrame(this.render);
        return;
      }

      const deltaSeconds = Math.min(
        (frameTime - this.lastFrameTime) / 1000,
        0.05,
      );
      this.lastFrameTime = frameTime;

      this.updateCamera();
      this.updateObjects(deltaSeconds);
      this.interactions?.updateTouchTargets();
      this.renderer.render(this.scene, this.camera);
      this.infoCard?.updatePosition(this.camera);

      this.frameId = requestAnimationFrame(this.render);
    };

    resize = () => {
      const width = Math.max(this.container.clientWidth, 1);
      const height = Math.max(this.container.clientHeight, 1);

      this.renderer.setPixelRatio(this.renderBudget.getPixelRatio());
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
      const orbitOpacity = this.mobileViewport.matches
        ? MOBILE_ORBIT_OPACITY
        : ORBIT_OPACITY;
      this.orbits.forEach(({ material }) => {
        material.opacity = orbitOpacity;
      });
      this.updateCamera();
      this.updateOrbitLayout();
    };

    requestResize = () => {
      if (this.resizeFrameId) {
        return;
      }

      this.resizeFrameId = requestAnimationFrame(() => {
        this.resizeFrameId = null;
        this.resize();
      });
    };

    observeSize() {
      window.addEventListener("orientationchange", this.requestResize, {
        passive: true,
      });

      if (!("ResizeObserver" in window)) {
        window.addEventListener("resize", this.requestResize, {
          passive: true,
        });
        return;
      }

      this.resizeObserver = new ResizeObserver(this.requestResize);
      this.resizeObserver.observe(this.container);
    }

    updateOrbitLayout() {
      this.modules.forEach((module) => {
        module.orbitDistance = module.definition.distance;
      });

      const outerModule = this.modules.at(-1);
      const penultimateModule = this.modules.at(-2);
      const outerOrbit = this.orbits.at(-1);

      if (!outerModule || !penultimateModule || !outerOrbit) {
        return;
      }

      const shouldMergeOuterOrbit = this.isOuterOrbitOffscreen(outerModule);

      if (shouldMergeOuterOrbit) {
        outerModule.orbitDistance = penultimateModule.orbitDistance;
      }

      outerOrbit.visible = !shouldMergeOuterOrbit;
      this.modules.forEach((module) => {
        module.mesh.position.set(
          Math.cos(module.angle) * module.orbitDistance,
          0,
          Math.sin(module.angle) * module.orbitDistance,
        );
      });
      this.infoCard?.updateOrbitLabel();
    }

    isOuterOrbitOffscreen(outerModule) {
      if (!this.mobileViewport.matches) {
        return false;
      }

      const finalResponsiveScale = clamp(this.camera.aspect, 0.56, 1);
      const finalWorldScale =
        finalResponsiveScale * MOBILE_ORBIT_SCALE_BOOST;
      const verticalHalfView =
        Math.tan((this.camera.fov * Math.PI) / 360) *
        FINAL_CAMERA_HEIGHT;
      const horizontalHalfView = verticalHalfView * this.camera.aspect;
      const outerOrbitRadius =
        outerModule.definition.distance * finalWorldScale;

      return (
        outerOrbitRadius >
        horizontalHalfView * ORBIT_SCREEN_EDGE_RATIO
      );
    }

    observeVisibility() {
      this.visibilityObserver = observeRenderVisibility(
        this.container,
        (isVisible) => {
          this.isVisible = isVisible;
          if (isVisible) {
            this.lastFrameTime = performance.now();
            this.renderBudget.reset();
            this.requestRender();
          }
        },
      );
    }
  }

  class ScrollStory {
    constructor(element, experience) {
      this.element = element;
      this.experience = experience;
      this.isTicking = false;
      this.lastProgress = null;
      this.lastStoryVisibility = null;

      this.update();
      window.addEventListener("scroll", this.requestUpdate, { passive: true });
      window.addEventListener("resize", this.requestUpdate, { passive: true });
    }

    requestUpdate = () => {
      if (this.isTicking) {
        return;
      }

      this.isTicking = true;
      requestAnimationFrame(this.update);
    };

    update = () => {
      const rect = this.element.getBoundingClientRect();
      const progress = clamp(
        (window.innerHeight - rect.top) /
          Math.max(this.element.offsetHeight, 1),
      );
      const hasEnteredViewport = rect.top < window.innerHeight;
      const exitVisibility = smoothstep(
        window.innerHeight * 0.52,
        window.innerHeight * 0.96,
        rect.bottom,
      );
      const storyVisibility = hasEnteredViewport ? exitVisibility : 0;

      if (
        progress !== this.lastProgress ||
        storyVisibility !== this.lastStoryVisibility
      ) {
        this.lastProgress = progress;
        this.lastStoryVisibility = storyVisibility;
        this.experience?.setProgress(progress);
        this.experience?.setStoryVisible(storyVisibility > 0.72);
        this.writeStyles(progress, storyVisibility);
      }

      this.isTicking = false;
    };

    writeStyles(progress, storyVisibility) {
      const cueOpacity = 1 - smoothstep(0.01, 0.1, progress);
      const continueOpacity =
        smoothstep(0.68, 0.84, progress) * storyVisibility;
      const interactionOpacity =
        smoothstep(
          INTERACTION_START - 0.04,
          INTERACTION_START + 0.04,
          progress,
        ) * storyVisibility;

      const style = document.documentElement.style;
      style.setProperty(
        "--orbit-story-opacity",
        storyVisibility.toFixed(3),
      );
      if (storyVisibility > 0) {
        style.setProperty("--orbit-clip-radius", "145vmax");
        style.setProperty("--orbit-clip-x", "50%");
        style.setProperty("--orbit-clip-y", "50%");
        style.setProperty("--orbit-canvas-shift-x", "0vw");
        style.setProperty("--orbit-canvas-shift-y", "0vh");
      }
      style.setProperty("--cue-opacity", cueOpacity.toFixed(3));
      style.setProperty("--continue-opacity", continueOpacity.toFixed(3));
      style.setProperty(
        "--interaction-opacity",
        interactionOpacity.toFixed(3),
      );
    }
  }

  let orbitExperience;

  try {
    orbitExperience = new OrbitExperience(canvasElement);
  } catch (error) {
    console.error("Impossibile inizializzare la scena 3D.", error);
    canvasElement.classList.add("is-fallback");
  }

  if (showcaseElement) {
    new HeroShowcase(showcaseElement, {
      onDeviceScaleChange: (scale) => heroOrbitPreview?.setRenderScale(scale),
      onOrbitProgressChange: (progress, isVisible) => {
        heroOrbitPreview?.setAnimationEnabled(progress <= 0.005);
        orbitExperience?.setIntroProgress(progress);
        orbitExperience?.setIntroVisible(isVisible);
      },
      orbitOriginElement: heroOrbitElement,
    });
  }

  new ScrollStory(storyElement, orbitExperience);

  if (moduleCardElements.length > 0) {
    scheduleIdleTask(() => {
      try {
        new ModuleGemGallery(moduleCardElements);
      } catch (error) {
        console.error("Impossibile inizializzare le gemme dei moduli.", error);
      }
    });
  }

  if (featureOrbitElement) {
    scheduleIdleTask(() => {
      try {
        new FeatureOrbitPreview(featureOrbitElement);
      } catch (error) {
        console.error(
          "Impossibile inizializzare l'orbita della funzionalità.",
          error,
        );
        featureOrbitElement.classList.add("is-fallback");
      }
    });
  }
})();
