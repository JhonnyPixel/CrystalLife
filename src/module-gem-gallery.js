import {
  AmbientLight,
  DirectionalLight,
  HalfFloatType,
  NeutralToneMapping,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { GEM_ASSETS } from "./gem-assets.js";
import { styleGemMaterials } from "./gem-materials.js";
import {
  clearGemModelCache,
  GemModelFactory,
} from "./gem-model.js";
import {
  getDecorativeRenderPixelRatio,
  isMobileDisplay,
  observeRenderVisibility,
} from "./render-performance.js";
import { replaceCanvasWithSnapshot } from "./webgl-snapshot.js";

const MODEL_SIZE = 1.05;
const DRAG_SENSITIVITY = 0.011;
const MAX_ANGULAR_VELOCITY = 4;
const AUTO_ROTATION_SPEED = 0.16;
const CORE_BLOOM_STRENGTH = 0.95;
const CORE_BLOOM_RADIUS = 0.28;
const CORE_BLOOM_THRESHOLD = 0.05;
const MODULE_EMISSION_SCALE = 1.5;
const CARD_CLIP_INSET = 1;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

class ModuleGemPostProcessor {
  constructor(renderer, camera) {
    const supportsHdr = renderer.capabilities.isWebGL2;
    const renderTargetOptions = {
      format: RGBAFormat,
      stencilBuffer: false,
      ...(supportsHdr
        ? {
            type: HalfFloatType,
          }
        : {}),
    };
    const renderTarget = new WebGLRenderTarget(
      1,
      1,
      renderTargetOptions,
    );
    this.bloomPass = new UnrealBloomPass(
      new Vector2(1, 1),
      CORE_BLOOM_STRENGTH,
      CORE_BLOOM_RADIUS,
      CORE_BLOOM_THRESHOLD,
    );
    this.outputPass = new OutputPass();

    this.renderPass = new RenderPass(new Scene(), camera);
    this.composer = new EffectComposer(renderer, renderTarget);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
    this.pixelRatio = renderer.getPixelRatio();
    this.renderSize = { width: 0, height: 0 };
    this.composer.setPixelRatio(this.pixelRatio);
  }

  setPixelRatio(pixelRatio) {
    if (pixelRatio === this.pixelRatio) {
      return;
    }

    this.pixelRatio = pixelRatio;
    this.composer.setPixelRatio(pixelRatio);
  }

  setSize(width, height) {
    const renderWidth = Math.max(Math.round(width), 1);
    const renderHeight = Math.max(Math.round(height), 1);

    if (
      renderWidth === this.renderSize.width &&
      renderHeight === this.renderSize.height
    ) {
      return;
    }

    this.renderSize = { width: renderWidth, height: renderHeight };
    this.composer.setSize(renderWidth, renderHeight);
  }

  render(scene) {
    this.renderPass.scene = scene;
    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
    this.bloomPass.dispose();
    this.outputPass.dispose();
  }
}

class ModuleGemCard {
  constructor(
    element,
    prefersReducedMotion,
    renderer,
    camera,
    sharedPostProcessing = null,
  ) {
    this.element = element;
    this.asset = GEM_ASSETS[element.dataset.gemModel];
    this.modelUrl = this.asset?.modelUrl;
    this.prefersReducedMotion = prefersReducedMotion;
    this.visual = null;
    this.pointerId = null;
    this.lastPointerPosition = null;
    this.angularVelocity = { x: 0, y: 0 };

    if (!this.modelUrl) {
      throw new Error("Configurazione gemma modulo incompleta.");
    }

    this.postProcessing =
      sharedPostProcessing ??
      new ModuleGemPostProcessor(renderer, camera);
    this.ownsPostProcessing = !sharedPostProcessing;

    this.interactionElement = this.createInteractionElement();
    this.createScene();
    this.bindInteraction();
  }

  createInteractionElement() {
    const interactionElement = document.createElement("span");

    interactionElement.className = "module-card__gem-interaction";
    interactionElement.setAttribute("aria-hidden", "true");
    this.element.append(interactionElement);
    return interactionElement;
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
    const factory = new GemModelFactory(this.asset);

    await factory.load();

    const { materials, visual } = factory.create({ size: MODEL_SIZE });
    const orb = this.element.querySelector(".module-card__orb");
    const color = orb ? getComputedStyle(orb).backgroundColor : null;
    styleGemMaterials({
      color,
      emissionScale: MODULE_EMISSION_SCALE,
      materials,
      visual,
    });
    visual.rotation.set(0.2, -0.45, -0.08);
    this.visual = visual;
    this.scene.add(visual);
    this.element.classList.add("has-gem");
  }

  bindInteraction() {
    const moduleName =
      this.element.querySelector("h3")?.textContent?.trim() ?? "modulo";

    this.element.tabIndex = 0;
    this.element.setAttribute(
      "aria-label",
      `${moduleName}. Trascina per ruotare la gemma 3D.`,
    );
    this.interactionElement.addEventListener(
      "pointerdown",
      this.onPointerDown,
    );
    this.interactionElement.addEventListener(
      "pointermove",
      this.onPointerMove,
    );
    this.interactionElement.addEventListener(
      "pointerup",
      this.onPointerEnd,
    );
    this.interactionElement.addEventListener(
      "pointercancel",
      this.onPointerEnd,
    );
    this.interactionElement.addEventListener(
      "lostpointercapture",
      this.onPointerEnd,
    );
    this.element.addEventListener("keydown", this.onKeyDown);
  }

  onPointerDown = (event) => {
    if (!this.visual || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }

    event.preventDefault();
    this.pointerId = event.pointerId;
    this.lastPointerPosition = {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
    };
    this.angularVelocity.x = 0;
    this.angularVelocity.y = 0;
    this.element.classList.add("is-rotating");
    this.interactionElement.setPointerCapture(event.pointerId);
  };

  onPointerMove = (event) => {
    if (
      !this.visual ||
      event.pointerId !== this.pointerId ||
      !this.lastPointerPosition
    ) {
      return;
    }

    event.preventDefault();
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

    if (this.interactionElement.hasPointerCapture(event.pointerId)) {
      this.interactionElement.releasePointerCapture(event.pointerId);
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

  render(width, height) {
    if (this.ownsPostProcessing) {
      this.postProcessing.setSize(width, height);
    }

    this.postProcessing.render(this.scene);
  }

  release() {
    if (
      this.pointerId !== null &&
      this.interactionElement.hasPointerCapture(this.pointerId)
    ) {
      this.interactionElement.releasePointerCapture(this.pointerId);
    }

    this.interactionElement.removeEventListener(
      "pointerdown",
      this.onPointerDown,
    );
    this.interactionElement.removeEventListener(
      "pointermove",
      this.onPointerMove,
    );
    this.interactionElement.removeEventListener(
      "pointerup",
      this.onPointerEnd,
    );
    this.interactionElement.removeEventListener(
      "pointercancel",
      this.onPointerEnd,
    );
    this.interactionElement.removeEventListener(
      "lostpointercapture",
      this.onPointerEnd,
    );
    this.element.removeEventListener("keydown", this.onKeyDown);
    this.element.removeAttribute("tabindex");
    this.element.removeAttribute("aria-label");
    this.element.classList.remove("has-gem", "is-rotating");
    this.interactionElement.remove();
    this.scene.clear();
    this.visual = null;
    this.scene = null;
    this.postProcessing = null;
  }
}

export class ModuleGemGallery {
  constructor(elements) {
    this.grid = elements[0]?.parentElement;

    if (!this.grid) {
      throw new Error("Griglia moduli mancante.");
    }

    this.isVisible = false;
    this.hasStartedLoading = false;
    this.hasStaticSnapshot = false;
    this.lastFrameTime = performance.now();
    this.useStaticSnapshot = isMobileDisplay();
    this.prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    this.createScene();
    this.sharedPostProcessing = this.useStaticSnapshot
      ? new ModuleGemPostProcessor(this.renderer, this.camera)
      : null;
    this.cards = elements.map(
      (element) =>
        new ModuleGemCard(
          element,
          this.prefersReducedMotion,
          this.renderer,
          this.camera,
          this.sharedPostProcessing,
        ),
    );
    this.observeSize();
    this.observeVisibility();
    this.observeLoading();
    this.resize();
    this.frameId = this.useStaticSnapshot
      ? null
      : requestAnimationFrame(this.render);
  }

  createScene() {
    this.canvasLayer = document.createElement("div");
    this.canvasLayer.className = "module-gem-gallery";
    this.canvasLayer.setAttribute("aria-hidden", "true");
    this.grid.append(this.canvasLayer);

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(34, 1, 0.1, 30);
    this.camera.position.set(0, 0, 5.2);

    this.renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: this.useStaticSnapshot,
    });
    this.canvasLayer.append(this.renderer.domElement);

    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(
      getDecorativeRenderPixelRatio(1.5, 1.5),
    );
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = false;
    this.renderer.setScissorTest(true);
  }

  async load() {
    if (this.hasStartedLoading) {
      return;
    }

    this.hasStartedLoading = true;
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
      }
    });

    this.canvasLayer.classList.add("is-ready");

    if (this.useStaticSnapshot) {
      await this.captureStaticSnapshot();
    }
  }

  observeLoading() {
    if (!("IntersectionObserver" in window)) {
      void this.load();
      return;
    }

    this.loadObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return;
        }

        this.loadObserver.disconnect();
        void this.load();
      },
      { rootMargin: "600px 0px" },
    );
    this.loadObserver.observe(this.grid);
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
    this.visibilityObserver = observeRenderVisibility(
      this.grid,
      (isVisible) => {
        this.isVisible = isVisible;
        if (isVisible && !this.useStaticSnapshot) {
          this.lastFrameTime = performance.now();
          if (this.frameId === null) {
            this.frameId = requestAnimationFrame(this.render);
          }
        } else if (this.frameId !== null) {
          cancelAnimationFrame(this.frameId);
          this.frameId = null;
        }
      },
    );
  }

  resize = () => {
    if (!this.renderer) {
      return;
    }

    const width = Math.max(this.grid.clientWidth, 1);
    const height = Math.max(this.grid.clientHeight, 1);
    const pixelRatio = getDecorativeRenderPixelRatio(1.5, 1.5);

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    new Set(
      this.cards.map(({ postProcessing }) => postProcessing),
    ).forEach((postProcessing) => {
      postProcessing.setPixelRatio(pixelRatio);
    });

    if (this.sharedPostProcessing) {
      const maximumCardSize = this.cards.reduce(
        (maximum, { element }) => ({
          width: Math.max(maximum.width, element.clientWidth),
          height: Math.max(maximum.height, element.clientHeight),
        }),
        { width: 1, height: 1 },
      );

      this.sharedPostProcessing.setSize(
        maximumCardSize.width,
        maximumCardSize.height,
      );
    }

    this.updateClipMask(width, height);
  };

  updateClipMask(width, height) {
    const gridBounds = this.grid.getBoundingClientRect();
    const clipRects = this.cards.map(({ element }) => {
      const bounds = element.getBoundingClientRect();
      const radius =
        parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
      const clippedWidth = Math.max(bounds.width - CARD_CLIP_INSET * 2, 0);
      const clippedHeight = Math.max(
        bounds.height - CARD_CLIP_INSET * 2,
        0,
      );
      const x = bounds.left - gridBounds.left + CARD_CLIP_INSET;
      const y = bounds.top - gridBounds.top + CARD_CLIP_INSET;
      const clippedRadius = Math.max(radius - CARD_CLIP_INSET, 0);

      return `<rect
        x="${x}"
        y="${y}"
        width="${clippedWidth}"
        height="${clippedHeight}"
        rx="${clippedRadius}"
        fill="white"
      />`;
    });
    const maskSvg = `<svg
      xmlns="http://www.w3.org/2000/svg"
      width="${width}"
      height="${height}"
      viewBox="0 0 ${width} ${height}"
    >${clipRects.join("")}</svg>`;
    const encodedMask = encodeURIComponent(maskSvg);
    const maskImage = `url("data:image/svg+xml,${encodedMask}")`;

    this.canvasLayer.style.maskImage = maskImage;
    this.canvasLayer.style.webkitMaskImage = maskImage;
  }

  renderCard(card, gridBounds, onlyWhenVisible = true) {
    if (!card.visual) {
      return;
    }

    const cardBounds = card.element.getBoundingClientRect();

    if (
      onlyWhenVisible &&
      (cardBounds.bottom <= 0 ||
        cardBounds.right <= 0 ||
        cardBounds.top >= window.innerHeight ||
        cardBounds.left >= window.innerWidth)
    ) {
      return;
    }

    const left = cardBounds.left - gridBounds.left;
    const bottom = gridBounds.bottom - cardBounds.bottom;
    const width = cardBounds.width;
    const height = cardBounds.height;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    card.positionVisual(this.camera.aspect);
    this.renderer.setViewport(left, bottom, width, height);
    this.renderer.setScissor(left, bottom, width, height);
    card.render(width, height);
  }

  renderStaticFrame() {
    if (!this.renderer) {
      return;
    }

    const gridBounds = this.grid.getBoundingClientRect();

    this.renderer.setScissorTest(false);
    this.renderer.clear(true, true, true);
    this.renderer.setScissorTest(true);
    this.cards.forEach((card) => card.update(0));
    this.cards.forEach((card) => {
      this.renderCard(card, gridBounds, false);
    });
  }

  captureStaticSnapshot = async () => {
    if (this.hasStaticSnapshot || !this.renderer) {
      return;
    }

    this.hasStaticSnapshot = true;

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    this.renderStaticFrame();
    const canvas = this.renderer.domElement;
    const didReplaceCanvas = await replaceCanvasWithSnapshot(canvas, {
      className: "module-gem-gallery__snapshot",
    });

    if (didReplaceCanvas) {
      this.releaseRenderer();
      return;
    }

    this.hasStaticSnapshot = false;
  };

  releaseRenderer() {
    const renderer = this.renderer;

    if (!renderer) {
      return;
    }

    this.loadObserver?.disconnect();
    this.resizeObserver?.disconnect();
    this.visibilityObserver?.disconnect();
    window.removeEventListener("resize", this.resize);

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    const postProcessors = new Set(
      this.cards.map(({ postProcessing }) => postProcessing),
    );

    postProcessors.forEach((postProcessing) => {
      postProcessing.dispose();
    });
    this.cards.forEach((card) => card.release());
    renderer.dispose();
    renderer.forceContextLoss();
    this.scene.clear();
    this.cards = [];
    this.sharedPostProcessing = null;
    this.renderer = null;
    this.camera = null;
    this.scene = null;
    clearGemModelCache();
  }

  render = (frameTime) => {
    this.frameId = null;

    if (!this.renderer || !this.isVisible) {
      return;
    }

    const deltaSeconds = Math.min(
      (frameTime - this.lastFrameTime) / 1000,
      0.05,
    );
    this.lastFrameTime = frameTime;

    const gridBounds = this.grid.getBoundingClientRect();

    this.renderer.setScissorTest(false);
    this.renderer.clear(true, true, true);
    this.renderer.setScissorTest(true);
    this.cards.forEach((card) => card.update(deltaSeconds));
    this.cards.forEach((card) => this.renderCard(card, gridBounds));

    if (!this.useStaticSnapshot) {
      this.frameId = requestAnimationFrame(this.render);
    }
  };
}
