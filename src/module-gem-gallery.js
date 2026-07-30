import {
  AgXBlenderToneMapping,
  AmbientLight,
  App,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
} from "verge3d";
import { GEM_MODEL_URLS } from "./gem-assets.js";
import { GemModelFactory } from "./gem-model.js";

const MODEL_SIZE = 1.05;
const DRAG_SENSITIVITY = 0.011;
const MAX_ANGULAR_VELOCITY = 4;
const AUTO_ROTATION_SPEED = 0.16;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

class ModuleGemCard {
  constructor(element, prefersReducedMotion) {
    this.element = element;
    this.modelUrl = GEM_MODEL_URLS[element.dataset.gemModel];
    this.prefersReducedMotion = prefersReducedMotion;
    this.visual = null;
    this.pointerId = null;
    this.lastPointerPosition = null;
    this.angularVelocity = { x: 0, y: 0 };

    if (!this.modelUrl) {
      throw new Error("Configurazione gemma modulo incompleta.");
    }

    this.createScene();
    this.bindInteraction();
  }

  createScene() {
    this.scene = new Scene();

    const ambientLight = new AmbientLight(0xffffff, 0.52);
    const keyLight = new DirectionalLight(0xffffff, 1.5);
    const rimLight = new DirectionalLight(0xbba1ff, 1.1);

    keyLight.position.set(4, 6, 7);
    rimLight.position.set(-4, 2, -5);
    this.scene.add(ambientLight, keyLight, rimLight);
  }

  async load() {
    const factory = new GemModelFactory({ modelUrl: this.modelUrl });

    await factory.load();

    const { visual } = factory.create({ size: MODEL_SIZE });

    visual.rotation.set(0.2, -0.45, -0.08);
    this.visual = visual;
    this.scene.add(visual);
    this.element.classList.add("has-gem");

    return factory;
  }

  bindInteraction() {
    const moduleName =
      this.element.querySelector("h3")?.textContent?.trim() ?? "modulo";

    this.element.tabIndex = 0;
    this.element.setAttribute(
      "aria-label",
      `${moduleName}. Trascina per ruotare la gemma 3D.`,
    );
    this.element.addEventListener("pointerdown", this.onPointerDown);
    this.element.addEventListener("pointermove", this.onPointerMove);
    this.element.addEventListener("pointerup", this.onPointerEnd);
    this.element.addEventListener("pointercancel", this.onPointerEnd);
    this.element.addEventListener("lostpointercapture", this.onPointerEnd);
    this.element.addEventListener("keydown", this.onKeyDown);
  }

  onPointerDown = (event) => {
    if (!this.visual || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }

    this.pointerId = event.pointerId;
    this.lastPointerPosition = {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
    };
    this.angularVelocity.x = 0;
    this.angularVelocity.y = 0;
    this.element.classList.add("is-rotating");
    this.element.setPointerCapture(event.pointerId);
  };

  onPointerMove = (event) => {
    if (
      !this.visual ||
      event.pointerId !== this.pointerId ||
      !this.lastPointerPosition
    ) {
      return;
    }

    const deltaX = event.clientX - this.lastPointerPosition.x;
    const deltaY = event.clientY - this.lastPointerPosition.y;
    const deltaTime = Math.max(
      (event.timeStamp - this.lastPointerPosition.time) / 1000,
      0.008,
    );
    const rotationX = deltaY * DRAG_SENSITIVITY;
    const rotationY = deltaX * DRAG_SENSITIVITY;

    this.visual.rotation.x += rotationX;
    this.visual.rotation.y += rotationY;
    this.angularVelocity.x = clamp(
      rotationX / deltaTime,
      -MAX_ANGULAR_VELOCITY,
      MAX_ANGULAR_VELOCITY,
    );
    this.angularVelocity.y = clamp(
      rotationY / deltaTime,
      -MAX_ANGULAR_VELOCITY,
      MAX_ANGULAR_VELOCITY,
    );
    this.lastPointerPosition = {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
    };
  };

  onPointerEnd = (event) => {
    if (event.pointerId !== this.pointerId) {
      return;
    }

    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }

    this.pointerId = null;
    this.lastPointerPosition = null;
    this.element.classList.remove("is-rotating");
  };

  onKeyDown = (event) => {
    if (!this.visual) {
      return;
    }

    const rotations = {
      ArrowDown: [0.14, 0],
      ArrowLeft: [0, -0.14],
      ArrowRight: [0, 0.14],
      ArrowUp: [-0.14, 0],
    };
    const rotation = rotations[event.key];

    if (!rotation) {
      return;
    }

    event.preventDefault();
    this.visual.rotation.x += rotation[0];
    this.visual.rotation.y += rotation[1];
  };

  update(deltaSeconds) {
    if (!this.visual || this.pointerId !== null) {
      return;
    }

    const damping = Math.exp(-deltaSeconds * 4.2);
    const autoRotation = this.prefersReducedMotion
      ? 0
      : AUTO_ROTATION_SPEED;

    this.visual.rotation.x += this.angularVelocity.x * deltaSeconds;
    this.visual.rotation.y +=
      (this.angularVelocity.y + autoRotation) * deltaSeconds;
    this.angularVelocity.x *= damping;
    this.angularVelocity.y *= damping;
  }

  positionVisual(aspect) {
    if (!this.visual) {
      return;
    }

    const horizontalOffset = clamp(
      0.25 + (aspect - 1) * 0.48,
      0.25,
      0.9,
    );

    this.visual.position.set(horizontalOffset, 0.42, 0);
  }
}

export class ModuleGemGallery {
  constructor(elements) {
    this.grid = elements[0]?.parentElement;

    if (!this.grid) {
      throw new Error("Griglia moduli mancante.");
    }

    this.isVisible = true;
    this.lastFrameTime = performance.now();
    this.prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    this.createScene();
    this.cards = elements.map(
      (element) =>
        new ModuleGemCard(element, this.prefersReducedMotion),
    );
    this.observeSize();
    this.observeVisibility();
    this.resize();
    void this.load();
    this.frameId = requestAnimationFrame(this.render);
  }

  createScene() {
    this.canvasLayer = document.createElement("div");
    this.canvasLayer.className = "module-gem-gallery";
    this.canvasLayer.setAttribute("aria-hidden", "true");
    this.grid.append(this.canvasLayer);

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(34, 1, 0.1, 30);
    this.camera.position.set(0, 0, 5.2);

    this.app = new App(this.canvasLayer, {
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.app.registerServiceKeys = false;
    this.app.scene = this.scene;
    this.app.setCamera(this.camera);

    this.renderer = this.app.renderer;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = AgXBlenderToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = false;
    this.renderer.setScissorTest(true);

  }

  async load() {
    const results = await Promise.allSettled(
      this.cards.map((card) => card.load()),
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.warn(
          "Gemma 3D della scheda non disponibile.",
          this.cards[index].modelUrl,
          result.reason,
        );
        return;
      }

      const cardScene = this.cards[index].scene;

      if (result.value.applyEnvironment(cardScene)) {
        this.app.scene = cardScene;
        this.app.updateEnvironment(cardScene.worldMaterial);
      }
    });

    this.canvasLayer.classList.add("is-ready");
  }

  observeSize() {
    if (!("ResizeObserver" in window)) {
      window.addEventListener("resize", this.resize, { passive: true });
      return;
    }

    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.grid);
  }

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
    this.visibilityObserver.observe(this.grid);
  }

  resize = () => {
    const width = Math.max(this.grid.clientWidth, 1);
    const height = Math.max(this.grid.clientHeight, 1);

    this.renderer.setSize(width, height, false);
  };

  renderCard(card, gridBounds) {
    if (!card.visual) {
      return;
    }

    const cardBounds = card.element.getBoundingClientRect();
    const left = cardBounds.left - gridBounds.left;
    const bottom = gridBounds.bottom - cardBounds.bottom;
    const width = cardBounds.width;
    const height = cardBounds.height;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    card.positionVisual(this.camera.aspect);
    this.renderer.setViewport(left, bottom, width, height);
    this.renderer.setScissor(left, bottom, width, height);
    this.renderer.render(card.scene, this.camera);
  }

  render = (frameTime) => {
    const deltaSeconds = Math.min(
      (frameTime - this.lastFrameTime) / 1000,
      0.05,
    );
    this.lastFrameTime = frameTime;

    if (this.isVisible) {
      const gridBounds = this.grid.getBoundingClientRect();

      this.renderer.setScissorTest(false);
      this.renderer.clear(true, true, true);
      this.renderer.setScissorTest(true);
      this.cards.forEach((card) => card.update(deltaSeconds));
      this.cards.forEach((card) => this.renderCard(card, gridBounds));
    }

    this.frameId = requestAnimationFrame(this.render);
  };
}
