import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { GemInfoCard } from "./gem-info-card.js";
import { GemInteractionController } from "./gem-interaction.js";
import "./styles.css";

(() => {
  "use strict";

  const INTERACTION_START = 0.78;
  const storyElement = document.querySelector("[data-orbit-story]");
  const canvasElement = document.querySelector("[data-orbit-canvas]");
  const gemStatusElement = document.querySelector("[data-gem-status]");
  const gemInfoElement = document.querySelector("[data-gem-info]");

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

  class OrbitExperience {
    constructor(container) {
      this.container = container;
      this.progress = 0;
      this.elapsedSeconds = 0;
      this.lastFrameTime = performance.now();
      this.isVisible = true;
      this.isInteractive = false;
      this.prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      this.modules = [];
      this.orbits = [];

      this.createScene();
      this.createCore();
      this.createModules();
      this.createLights();
      this.createInfoCard();
      this.createInteractions();
      void this.loadGemModels();
      this.observeVisibility();
      this.resize();

      window.addEventListener("resize", this.resize, { passive: true });
      this.frameId = requestAnimationFrame(this.render);
    }

    createScene() {
      this.scene = new Scene();
      this.camera = new PerspectiveCamera(58, 1, 0.1, 100);
      this.renderer = new WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
      this.renderer.toneMapping = ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.28;
      this.renderer.shadowMap.enabled = false;
      this.renderer.shadowMap.type = PCFSoftShadowMap;

      this.renderer.outputColorSpace = SRGBColorSpace;

      this.container.appendChild(this.renderer.domElement);
      this.world = new Group();
      this.scene.add(this.world);
      void this.createMaterialEnvironment();
    }

    async createMaterialEnvironment() {
      try {
        const { RoomEnvironment } = await import(
          "three/addons/environments/RoomEnvironment.js"
        );
        const environmentScene = new RoomEnvironment();
        const generator = new PMREMGenerator(this.renderer);

        this.environmentTarget = generator.fromScene(
          environmentScene,
          0.04,
        );
        this.scene.environment = this.environmentTarget.texture;
        this.scene.environmentIntensity = 1.12;

        environmentScene.dispose();
        generator.dispose();
      } catch (error) {
        console.warn(
          "Illuminazione ambientale non disponibile.",
          error,
        );
      }
    }

    createCore() {
      const primary = new Color(0x8b5cf6);

      const coreGeometry = new IcosahedronGeometry(1.48, 1);
      const coreMaterial = new MeshPhongMaterial({
        color: 0x1c1238,
        emissive: primary,
        emissiveIntensity: 0.48,
        flatShading: true,
        shininess: 110,
      });
      this.core = new Mesh(coreGeometry, coreMaterial);
      this.world.add(this.core);

      const shellGeometry = new IcosahedronGeometry(1.62, 2);
      const shellMaterial = new MeshBasicMaterial({
        color: primary,
        wireframe: true,
        transparent: true,
        opacity: 0.2,
      });
      this.shell = new Mesh(shellGeometry, shellMaterial);
      this.core.add(this.shell);

      const coreLight = new PointLight(primary, 1.15, 7);
      this.core.add(coreLight);
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
          speed: 0.39,
          size: 0.46,
        },
        {
          name: "Disciplina",
          description:
            "Promesse mantenute, attenzione protetta e azioni che restano.",
          cssColor: "#7c3aed",
          color: 0x7c3aed,
          distance: 4.6,
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
          speed: 0.21,
          size: 0.32,
        },
      ];

      definitions.forEach((definition, index) => {
        const geometry = new IcosahedronGeometry(definition.size, 0);
        const material = new MeshPhongMaterial({
          color: definition.color,
          emissive: definition.color,
          emissiveIntensity: 0.1,
          flatShading: true,
          shininess: 70,
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

        const light = new PointLight(definition.color, 0.78, 3.8);
        mesh.add(light);
        this.world.add(mesh);
        this.modules.push({
          index,
          mesh,
          hitArea,
          visual,
          visualMaterials: [material],
          definition,
          angle,
          angularVelocity: definition.speed,
          isDragging: false,
          isStopped: false,
        });

        const orbitGeometry = new RingGeometry(
          definition.distance - 0.012,
          definition.distance + 0.012,
          160,
        );
        const orbitMaterial = new MeshBasicMaterial({
          color: 0xe3e2e3,
          transparent: true,
          opacity: 0.075,
          side: DoubleSide,
          depthWrite: false,
        });
        const orbit = new Mesh(orbitGeometry, orbitMaterial);
        orbit.rotation.x = Math.PI / 2;
        this.world.add(orbit);
        this.orbits.push(orbit);
      });
    }

    async loadGemModels() {
      try {
        const { GemModelFactory } = await import("./gem-model.js");
        const gemModelFactory = new GemModelFactory();

        await gemModelFactory.load();

        this.modules.forEach((module) => {
          const { materials, visual } = gemModelFactory.create(
            module.definition,
          );
          const fallback = module.visual;

          module.mesh.remove(fallback);
          fallback.geometry.dispose();
          fallback.material.dispose();
          module.mesh.add(visual);
          module.visual = visual;
          module.visualMaterials = materials;
        });
      } catch (error) {
        console.warn(
          "Modello GLB non disponibile. Uso gemme geometriche.",
          error,
        );
      }
    }

    createLights() {
      this.scene.add(new AmbientLight(0xffffff, 0.46));

      const keyLight = new DirectionalLight(0xffffff, 1.4);
      keyLight.position.set(4, 8, 7);
      this.scene.add(keyLight);

      const violetFill = new PointLight(0x8b5cf6, 1.1, 18);
      violetFill.position.set(-5, 2, 4);
      this.scene.add(violetFill);

      const rimLight = new DirectionalLight(0xd7c6ff, 1.15);
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

      if (!shouldBeInteractive) {
        this.resetGemStates();
      }
    }

    startDraggingGem = (gemIndex) => {
      const module = this.modules[gemIndex];

      if (!module) {
        return;
      }

      module.isDragging = true;
      module.isStopped = false;
      module.angularVelocity = 0;
      this.infoCard.hide();
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

    updateCamera() {
      const cameraProgress = smoothstep(0.06, 0.84, this.progress);
      const verticalProgress = smoothstep(0.18, 0.9, this.progress);

      this.camera.position.set(
        0.001,
        lerp(4.5, 14, verticalProgress),
        lerp(17, 0.08, cameraProgress),
      );

      const targetY = lerp(-1.35, 0, cameraProgress);
      this.camera.lookAt(0, targetY, 0);

      const startingResponsiveScale = clamp(this.camera.aspect * 1.5, 0.78, 1);
      const endingResponsiveScale = clamp(this.camera.aspect, 0.56, 1);
      const responsiveScale = lerp(
        startingResponsiveScale,
        endingResponsiveScale,
        smoothstep(0.16, 0.92, this.progress),
      );
      const apparentScale = lerp(0.79, 1, smoothstep(0.08, 0.9, this.progress));
      const worldScale = responsiveScale * apparentScale;
      this.world.scale.setScalar(worldScale);
      this.world.position.y = lerp(-1.35, 0, cameraProgress);
      this.world.rotation.y = lerp(-0.08, 0.14, cameraProgress);
    }

    updateObjects(deltaSeconds) {
      const motionFactor = this.prefersReducedMotion ? 0 : 1;
      const topViewProgress = smoothstep(0.55, 0.95, this.progress);
      const floatAmplitude = lerp(0.36, 0.02, topViewProgress);

      this.elapsedSeconds += deltaSeconds * motionFactor;
      this.core.rotation.y += deltaSeconds * 0.32 * motionFactor;
      this.core.rotation.x += deltaSeconds * 0.17 * motionFactor;
      this.shell.rotation.y -= deltaSeconds * 0.12 * motionFactor;

      const pulse = this.prefersReducedMotion
        ? 1
        : 1 + Math.sin(this.elapsedSeconds * 2) * 0.035;
      this.core.scale.setScalar(pulse);

      this.modules.forEach((module, index) => {
        const { mesh, definition } = module;

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
            Math.cos(module.angle) * definition.distance,
            Math.sin(this.elapsedSeconds * 1.1 + module.angle + index) *
              floatAmplitude,
            Math.sin(module.angle) * definition.distance,
          );
        }

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

        const targetScale = module.isDragging
          ? 1.38
          : module.isStopped
            ? 1.28
            : 1;
        const feedbackStrength = module.isDragging
          ? 1
          : module.isStopped
            ? 0.72
            : 0;
        const feedbackProgress = clamp(deltaSeconds * 11);

        mesh.scale.setScalar(
          lerp(mesh.scale.x, targetScale, feedbackProgress),
        );
        module.visualMaterials.forEach((material) => {
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
      });
    }

    render = (frameTime) => {
      const deltaSeconds = Math.min(
        (frameTime - this.lastFrameTime) / 1000,
        0.05,
      );
      this.lastFrameTime = frameTime;

      if (this.isVisible) {
        this.updateCamera();
        this.updateObjects(deltaSeconds);
        this.renderer.render(this.scene, this.camera);
        this.infoCard?.updatePosition(this.camera);
      }

      this.frameId = requestAnimationFrame(this.render);
    };

    resize = () => {
      const width = Math.max(this.container.clientWidth, 1);
      const height = Math.max(this.container.clientHeight, 1);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
      this.updateCamera();
    };

    observeVisibility() {
      if (!("IntersectionObserver" in window)) {
        return;
      }

      this.visibilityObserver = new IntersectionObserver(
        ([entry]) => {
          this.isVisible = entry.isIntersecting;
          if (this.isVisible) {
            this.lastFrameTime = performance.now();
          }
        },
        { rootMargin: "20% 0px" },
      );
      this.visibilityObserver.observe(this.container);
    }
  }

  class ScrollStory {
    constructor(element, experience) {
      this.element = element;
      this.experience = experience;
      this.isTicking = false;

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
      const scrollableDistance = Math.max(
        this.element.offsetHeight - window.innerHeight,
        1,
      );
      const progress = clamp(-rect.top / scrollableDistance);

      this.experience?.setProgress(progress);
      this.writeStyles(progress);
      this.isTicking = false;
    };

    writeStyles(progress) {
      const titleOpacity = 1 - smoothstep(0.06, 0.24, progress);
      const titleShift = lerp(0, -32, smoothstep(0.04, 0.28, progress));
      const cueOpacity = 1 - smoothstep(0.01, 0.1, progress);
      const revealOpacity = smoothstep(0.66, 0.84, progress);
      const revealShift = lerp(24, 0, revealOpacity);
      const interactionOpacity = smoothstep(
        INTERACTION_START - 0.04,
        INTERACTION_START + 0.04,
        progress,
      );

      const style = document.documentElement.style;
      style.setProperty("--title-opacity", titleOpacity.toFixed(3));
      style.setProperty("--title-shift", `${titleShift.toFixed(2)}px`);
      style.setProperty("--cue-opacity", cueOpacity.toFixed(3));
      style.setProperty("--reveal-opacity", revealOpacity.toFixed(3));
      style.setProperty("--reveal-shift", `${revealShift.toFixed(2)}px`);
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

  new ScrollStory(storyElement, orbitExperience);
})();
