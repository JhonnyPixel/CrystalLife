import { MOBILE_VIEWPORT_QUERY } from "./render-performance.js";

const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const lerp = (start, end, progress) =>
  start + (end - start) * progress;

const smoothstep = (start, end, value) => {
  const progress = clamp((value - start) / (end - start));

  return progress * progress * (3 - 2 * progress);
};

export class HeroShowcase {
  constructor(
    element,
    {
      onDeviceScaleChange,
      onOrbitProgressChange,
      orbitOriginElement,
    } = {},
  ) {
    this.element = element;
    this.orbitOriginElement = orbitOriginElement;
    this.onDeviceScaleChange = onDeviceScaleChange;
    this.onOrbitProgressChange = onOrbitProgressChange;
    this.isTicking = false;
    this.narrowViewport = window.matchMedia("(max-width: 860px)");
    this.mobileViewport = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    this.prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    this.useSimpleTransition = this.prefersReducedMotion.matches;

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

    this.writeStyles(progress, rect.bottom <= 0);
    this.isTicking = false;
  };

  getOrbitOrigin() {
    const fallback = {
      radius: 4.6,
      x: this.narrowViewport.matches ? 50 : 70.5,
      y: this.narrowViewport.matches ? 70 : 48,
    };
    const bounds = this.orbitOriginElement?.getBoundingClientRect();

    if (!bounds?.width || !bounds.height) {
      return fallback;
    }

    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);
    const viewportMaximum = Math.max(viewportWidth, viewportHeight);

    return {
      radius: clamp(
        (Math.max(bounds.width, bounds.height) * 50) / viewportMaximum,
        3.8,
        9,
      ),
      x: clamp(
        ((bounds.left + bounds.width / 2) / viewportWidth) * 100,
        0,
        100,
      ),
      y: clamp(
        ((bounds.top + bounds.height / 2) / viewportHeight) * 100,
        0,
        100,
      ),
    };
  }

  writeStyles(progress, isPastShowcase) {
    if (this.mobileViewport.matches) {
      this.writeDirectMobileStyles();
      return;
    }

    const focusProgress = smoothstep(0.06, 0.48, progress);
    const orbitRevealProgress = smoothstep(0.16, 0.86, progress);
    const orbitVisibility = this.useSimpleTransition
      ? 0
      : smoothstep(0.12, 0.34, progress);
    const maximumScale = this.prefersReducedMotion.matches
      ? 1.06
      : this.useSimpleTransition
        ? 1.08
        : 1.34;
    const deviceScale = lerp(1, maximumScale, focusProgress);
    const maximumDeviceShift = this.narrowViewport.matches
      ? -Math.min(window.innerHeight * 0.18, 140)
      : 0;
    const deviceShift = lerp(0, maximumDeviceShift, focusProgress);
    const copyOpacity = 1 - smoothstep(0.08, 0.38, progress);
    const copyShift = lerp(0, -28, smoothstep(0.04, 0.42, progress));
    const sideOpacity = 1 - smoothstep(0.16, 0.52, progress);
    const stageOpacity = 1 - smoothstep(0.74, 0.98, progress);
    const cueOpacity = 1 - smoothstep(0.01, 0.12, progress);
    const previewOpacity = 1 - smoothstep(0.14, 0.36, progress);
    const maskEntrance = smoothstep(0.14, 0.28, progress);
    const maskExit = 1 - smoothstep(0.58, 0.86, progress);
    const transitionMaskOpacity = this.useSimpleTransition
      ? 0
      : maskEntrance * maskExit;
    const deviceBlur = lerp(
      0,
      this.useSimpleTransition ? 0 : 1.1,
      smoothstep(0.34, 0.72, progress) * maskExit,
    );
    const { radius: originRadius, x: originX, y: originY } =
      this.useSimpleTransition
      ? { radius: 145, x: 50, y: 50 }
      : this.getOrbitOrigin();
    const clipX = lerp(originX, 50, orbitRevealProgress);
    const clipY = lerp(originY, 50, orbitRevealProgress);
    const clipRadius = lerp(originRadius, 145, orbitRevealProgress);
    const canvasShiftX = lerp(originX - 50, 0, orbitRevealProgress);
    const canvasShiftY = lerp(originY - 50, 0, orbitRevealProgress);
    const style = this.element.style;
    const rootStyle = document.documentElement.style;

    style.setProperty("--showcase-progress", progress.toFixed(4));
    style.setProperty("--showcase-device-scale", deviceScale.toFixed(4));
    style.setProperty(
      "--showcase-device-shift-y",
      `${deviceShift.toFixed(2)}px`,
    );
    style.setProperty("--showcase-copy-opacity", copyOpacity.toFixed(3));
    style.setProperty("--showcase-copy-shift", `${copyShift.toFixed(2)}px`);
    style.setProperty("--showcase-side-opacity", sideOpacity.toFixed(3));
    style.setProperty("--showcase-stage-opacity", stageOpacity.toFixed(3));
    style.setProperty("--showcase-cue-opacity", cueOpacity.toFixed(3));
    style.setProperty("--phone-orbit-opacity", previewOpacity.toFixed(3));
    rootStyle.setProperty(
      "--transition-mask-opacity",
      transitionMaskOpacity.toFixed(3),
    );
    style.setProperty("--showcase-device-blur", `${deviceBlur.toFixed(2)}px`);
    rootStyle.setProperty(
      "--orbit-intro-opacity",
      isPastShowcase ? "0" : orbitVisibility.toFixed(3),
    );
    rootStyle.setProperty("--orbit-clip-radius", `${clipRadius.toFixed(2)}vmax`);
    rootStyle.setProperty("--orbit-clip-x", `${clipX.toFixed(2)}%`);
    rootStyle.setProperty("--orbit-clip-y", `${clipY.toFixed(2)}%`);
    rootStyle.setProperty(
      "--orbit-canvas-shift-x",
      `${canvasShiftX.toFixed(2)}vw`,
    );
    rootStyle.setProperty(
      "--orbit-canvas-shift-y",
      `${canvasShiftY.toFixed(2)}vh`,
    );
    this.onDeviceScaleChange?.(deviceScale);
    this.onOrbitProgressChange?.(
      this.useSimpleTransition ? 0 : orbitRevealProgress,
      !this.useSimpleTransition && !isPastShowcase && stageOpacity > 0.01,
    );
  }

  writeDirectMobileStyles() {
    const style = this.element.style;
    const rootStyle = document.documentElement.style;

    style.setProperty("--showcase-progress", "0");
    style.setProperty("--showcase-device-scale", "1");
    style.setProperty("--showcase-device-shift-y", "0px");
    style.setProperty("--showcase-copy-opacity", "1");
    style.setProperty("--showcase-copy-shift", "0px");
    style.setProperty("--showcase-side-opacity", "1");
    style.setProperty("--showcase-stage-opacity", "1");
    style.setProperty("--showcase-cue-opacity", "1");
    style.setProperty("--phone-orbit-opacity", "1");
    style.setProperty("--showcase-device-blur", "0px");
    rootStyle.setProperty("--transition-mask-opacity", "0");
    rootStyle.setProperty("--orbit-intro-opacity", "0");
    rootStyle.setProperty("--orbit-clip-radius", "145vmax");
    rootStyle.setProperty("--orbit-clip-x", "50%");
    rootStyle.setProperty("--orbit-clip-y", "50%");
    rootStyle.setProperty("--orbit-canvas-shift-x", "0vw");
    rootStyle.setProperty("--orbit-canvas-shift-y", "0vh");
    this.onDeviceScaleChange?.(1);
    this.onOrbitProgressChange?.(0, false);
  }
}
