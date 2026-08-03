import {
  AgXToneMapping,
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { GEM_ASSETS } from "./gem-assets.js";
import { styleGemMaterials } from "./gem-materials.js";
import { GemModelFactory } from "./gem-model.js";
import {
  isElementInViewport,
  observeRenderVisibility,
  RenderBudget,
} from "./render-performance.js";

const MAX_DELTA_SECONDS = 0.05;
const DETAIL_MODEL_SIZE = 1.55;
const MODULE_MODEL_SIZE = 1.35;

class HeroGemPreview {
  constructor(element) {
    this.element = element;
    this.asset = GEM_ASSETS[element.dataset.heroGemModel];
    this.color = element.dataset.gemColor;
    this.modelSize = element.classList.contains("hero-detail-gem-3d")
      ? DETAIL_MODEL_SIZE
      : MODULE_MODEL_SIZE;
    this.visual = null;
    this.createScene();

    if (!this.asset) {
      throw new Error("Configurazione gemma hero incompleta.");
    }
  }

  createScene() {
    this.scene = new Scene();
    const ambientLight = new AmbientLight(0xffffff, 0.58);
    const keyLight = new DirectionalLight(0xffffff, 1.65);
    const rimLight = new DirectionalLight(0xcab9ff, 1.2);

    keyLight.position.set(4, 6, 7);
    rimLight.position.set(-4, 3, -5);
    this.scene.add(ambientLight, keyLight, rimLight);
  }

  async load() {
    const factory = new GemModelFactory(this.asset);

    await factory.load();
    const { materials, visual } = factory.create({ size: this.modelSize });

    styleGemMaterials({
      color: this.color,
      materials,
      visual,
    });
    visual.rotation.set(0.22, -0.42, -0.08);
    this.visual = visual;
    this.scene.add(visual);
    this.element.classList.add("is-ready");
  }

  update(deltaSeconds, prefersReducedMotion) {
    if (!this.visual || prefersReducedMotion) {
      return;
    }

    this.visual.rotation.y += deltaSeconds * 0.42;
    this.visual.rotation.x += deltaSeconds * 0.08;
  }
}

const getOffsetRect = (element, root) => {
  let currentElement = element;
  let left = 0;
  let top = 0;

  while (currentElement && currentElement !== root) {
    left += currentElement.offsetLeft;
    top += currentElement.offsetTop;
    currentElement = currentElement.offsetParent;
  }

  return {
    height: element.offsetHeight,
    left,
    top,
    width: element.offsetWidth,
  };
};

export class HeroGemGallery {
  constructor(root) {
    this.root = root;
    this.isModuleGallery = root.matches("[data-hero-gem-gallery]");
    this.elements = [...root.querySelectorAll("[data-hero-gem-model]")];
    this.previews = this.elements.map((element) => new HeroGemPreview(element));
    this.lastFrameTime = performance.now();
    this.isVisible = false;
    this.frameId = null;
    this.isLoaded = false;
    this.hasStaticSnapshot = false;
    this.renderBudget = new RenderBudget({
      desktopPixelRatio: this.isModuleGallery ? 1 : 1.5,
      mobileFps: 60,
      mobilePixelRatio: this.isModuleGallery ? 0.75 : 1.35,
    });
    this.prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    this.isStatic = this.prefersReducedMotion || this.renderBudget.isMobile;

    this.createRenderer();
    this.observeSize();
    this.observeVisibility();
    this.resize();
    void this.load();
    this.requestRender();
  }

  createRenderer() {
    this.canvasLayer = document.createElement("div");
    this.canvasLayer.className = "hero-gem-gallery";
    this.canvasLayer.setAttribute("aria-hidden", "true");
    this.root.append(this.canvasLayer);

    this.camera = new PerspectiveCamera(34, 1, 0.1, 30);
    this.camera.position.set(0, 0, 5.2);
    this.renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: this.isStatic,
    });
    this.canvasLayer.append(this.renderer.domElement);

    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(this.renderBudget.getPixelRatio());
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = AgXToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = false;
    this.renderer.setScissorTest(true);
  }

  async load() {
    const results = await Promise.allSettled(
      this.previews.map((preview) => preview.load()),
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        return;
      }

      console.warn("Gemma 3D hero non disponibile.", result.reason);
      this.previews[index].element.classList.add("is-fallback");
    });
    this.isLoaded = true;
    this.canvasLayer.classList.add("is-ready");
    this.requestRender();
  }

  observeSize() {
    if (!("ResizeObserver" in window)) {
      window.addEventListener("resize", this.resize, { passive: true });
      return;
    }

    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.root);
  }

  observeVisibility() {
    this.visibilityObserver = observeRenderVisibility(
      this.root,
      (isVisible) => {
        this.isVisible = isVisible;
        this.lastFrameTime = performance.now();
        this.renderBudget.reset();

        if (isVisible) {
          this.requestRender();
        } else if (this.frameId !== null) {
          cancelAnimationFrame(this.frameId);
          this.frameId = null;
        }
      },
    );
  }

  resize = () => {
    this.renderer.setPixelRatio(this.renderBudget.getPixelRatio());
    this.renderer.setSize(
      Math.max(this.root.clientWidth, 1),
      Math.max(this.root.clientHeight, 1),
      false,
    );
  };

  renderPreview(preview) {
    if (!preview.visual) {
      return;
    }

    const bounds = getOffsetRect(preview.element, this.root);
    const bottom = this.root.clientHeight - bounds.top - bounds.height;

    this.camera.aspect = bounds.width / Math.max(bounds.height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setViewport(bounds.left, bottom, bounds.width, bounds.height);
    this.renderer.setScissor(bounds.left, bottom, bounds.width, bounds.height);
    this.renderer.render(preview.scene, this.camera);
  }

  requestRender() {
    if (!this.isVisible || this.frameId !== null) {
      return;
    }

    this.lastFrameTime = performance.now();
    this.renderBudget.reset();
    this.frameId = requestAnimationFrame(this.render);
  }

  captureStaticFrame() {
    if (
      !this.isStatic ||
      !this.isLoaded ||
      this.hasStaticSnapshot
    ) {
      return;
    }

    this.hasStaticSnapshot = true;
    const canvas = this.renderer.domElement;

    canvas.toBlob(
      (blob) => this.replaceCanvasWithSnapshot(canvas, blob),
      "image/webp",
      0.92,
    );
  }

  replaceCanvasWithSnapshot(canvas, blob) {
    if (!blob) {
      return;
    }

    const snapshotUrl = URL.createObjectURL(blob);
    const image = document.createElement("img");

    image.className = "hero-gem-gallery__snapshot";
    image.alt = "";
    image.src = snapshotUrl;
    canvas.replaceWith(image);

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  render = (frameTime) => {
    this.frameId = null;

    if (!this.isVisible) {
      return;
    }

    const deltaSeconds = Math.min(
      (frameTime - this.lastFrameTime) / 1000,
      MAX_DELTA_SECONDS,
    );

    this.lastFrameTime = frameTime;

    if (!this.isStatic && !this.renderBudget.shouldRender(deltaSeconds)) {
      this.frameId = requestAnimationFrame(this.render);
      return;
    }

    this.renderer.setScissorTest(false);
    this.renderer.clear(true, true, true);
    this.renderer.setScissorTest(true);

    let hasVisiblePreview = false;

    this.previews.forEach((preview) => {
      preview.update(deltaSeconds, this.prefersReducedMotion);

      if (isElementInViewport(preview.element, 80)) {
        hasVisiblePreview = true;
        this.renderPreview(preview);
      }
    });

    if (this.isStatic && hasVisiblePreview) {
      this.captureStaticFrame();
      return;
    }

    if (!this.prefersReducedMotion) {
      this.frameId = requestAnimationFrame(this.render);
    }
  };
}
