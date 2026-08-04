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
import { GemModelFactory } from "./gem-model.js";
import {
  observeRenderVisibility,
  RenderBudget,
} from "./render-performance.js";

const MODEL_SIZE = 1.05;
const DRAG_SENSITIVITY = 0.011;
const MAX_ANGULAR_VELOCITY = 4;
const AUTO_ROTATION_SPEED = 0.16;
const CORE_BLOOM_STRENGTH = 0.7;
const CORE_BLOOM_RADIUS = 0.2;
const CORE_BLOOM_THRESHOLD = 0.1;
const GROWTH_EMISSION_SCALE = 1.55;
const CARD_CLIP_INSET = 1;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

class ModuleGemCard {
  constructor(
    element,
    prefersReducedMotion,
    renderer,
    camera,
    usePostProcessing,
  ) {
    this.element = element;
    this.asset = GEM_ASSETS[element.dataset.gemModel];
    this.modelUrl = this.asset?.modelUrl;
    this.prefersReducedMotion = prefersReducedMotion;
    this.visual = null;
    this.pointerId = null;
    this.lastPointerPosition = null;
    this.angularVelocity = { x: 0, y: 0 };
    this.renderSize = { width: 0, height: 0 };
    this.renderer = renderer;
    this.camera = camera;
    this.usePostProcessing = usePostProcessing;

    if (!this.modelUrl) {
      throw new Error("Configurazione gemma modulo incompleta.");
    }

    this.interactionElement = this.createInteractionElement();
    this.createScene();
    if (this.usePostProcessing) {
      this.createPostProcessing(renderer, camera);
    }
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

  createPostProcessing(renderer, camera) {
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
    const renderPass = new RenderPass(this.scene, camera);
    const bloomPass = new UnrealBloomPass(
      new Vector2(1, 1),
      CORE_BLOOM_STRENGTH,
      CORE_BLOOM_RADIUS,
      CORE_BLOOM_THRESHOLD,
    );
    const outputPass = new OutputPass();

    this.composer = new EffectComposer(renderer, renderTarget);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.addPass(renderPass);
    this.composer.addPass(bloomPass);
    this.composer.addPass(outputPass);
  }

  async load() {
    const factory = new GemModelFactory(this.asset);

    await factory.load();

    const { materials, visual } = factory.create({ size: MODEL_SIZE });
    const orb = this.element.querySelector(".module-card__orb");
    const color = orb ? getComputedStyle(orb).backgroundColor : null;
    const emissionScale =
      this.element.dataset.gemModel === "growth"
        ? GROWTH_EMISSION_SCALE
        : 1;

    styleGemMaterials({ color, emissionScale, materials, visual });
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

  get isInteracting() {
    return this.pointerId !== null;
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
    if (!this.usePostProcessing) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const renderWidth = Math.max(Math.round(width), 1);
    const renderHeight = Math.max(Math.round(height), 1);

    if (
      renderWidth !== this.renderSize.width ||
      renderHeight !== this.renderSize.height
    ) {
      this.renderSize = { width: renderWidth, height: renderHeight };
      this.composer.setSize(renderWidth, renderHeight);
    }

    this.composer.render();
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
    this.lastFrameTime = performance.now();
    this.renderBudget = new RenderBudget({
      desktopPixelRatio: 1.5,
      mobileFps: 60,
      mobilePixelRatio: 1.5,
    });
    this.prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    this.createScene();
    this.cards = elements.map(
      (element) =>
        new ModuleGemCard(
          element,
          this.prefersReducedMotion,
          this.renderer,
          this.camera,
          !this.renderBudget.isMobile,
        ),
    );
    this.observeSize();
    this.observeVisibility();
    this.observeLoading();
    this.resize();
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

    this.renderer = new WebGLRenderer({
      alpha: true,
      antialias: !this.renderBudget.isMobile,
      powerPreference: this.renderBudget.isMobile
        ? "low-power"
        : "high-performance",
    });
    this.canvasLayer.append(this.renderer.domElement);

    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(this.renderBudget.getPixelRatio());
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
    const results = [];

    if (this.renderBudget.isMobile) {
      for (const card of this.cards) {
        try {
          results.push({ status: "fulfilled", value: await card.load() });
        } catch (reason) {
          results.push({ status: "rejected", reason });
        }

        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    } else {
      results.push(
        ...(await Promise.allSettled(this.cards.map((card) => card.load()))),
      );
    }

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
        if (isVisible) {
          this.lastFrameTime = performance.now();
          this.renderBudget.reset();
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
    const width = Math.max(this.grid.clientWidth, 1);
    const height = Math.max(this.grid.clientHeight, 1);

    this.renderer.setPixelRatio(this.renderBudget.getPixelRatio());
    this.renderer.setSize(width, height, false);
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

  renderCard(card, gridBounds) {
    if (!card.visual) {
      return;
    }

    const cardBounds = card.element.getBoundingClientRect();

    if (
      cardBounds.bottom <= 0 ||
      cardBounds.right <= 0 ||
      cardBounds.top >= window.innerHeight ||
      cardBounds.left >= window.innerWidth
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

  render = (frameTime) => {
    this.frameId = null;

    if (!this.isVisible) {
      return;
    }

    const isInteracting = this.cards.some((card) => card.isInteracting);

    if (!this.renderBudget.shouldRender(frameTime, isInteracting)) {
      this.frameId = requestAnimationFrame(this.render);
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

    this.frameId = requestAnimationFrame(this.render);
  };
}
