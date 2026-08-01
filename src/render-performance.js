export const MOBILE_PERFORMANCE_QUERY =
  "(max-width: 700px), (hover: none) and (pointer: coarse)";
const FRAME_TIME_TOLERANCE_MS = 0.75;

export const initializeMobilePerformanceMode = (
  root = document.documentElement,
) => {
  const mobileViewport = window.matchMedia(MOBILE_PERFORMANCE_QUERY);
  const updateMode = () => {
    root.classList.toggle(
      "is-mobile-performance",
      mobileViewport.matches,
    );
  };

  updateMode();

  if (typeof mobileViewport.addEventListener === "function") {
    mobileViewport.addEventListener("change", updateMode);
  } else {
    mobileViewport.addListener(updateMode);
  }
};

export const isElementInViewport = (element) => {
  const bounds = element.getBoundingClientRect();

  return (
    bounds.bottom > 0 &&
    bounds.right > 0 &&
    bounds.top < window.innerHeight &&
    bounds.left < window.innerWidth
  );
};

export const observeRenderVisibility = (
  element,
  onVisibilityChange,
) => {
  if (!("IntersectionObserver" in window)) {
    onVisibilityChange(true);
    return null;
  }

  const observer = new IntersectionObserver(
    ([entry]) => onVisibilityChange(entry.isIntersecting),
    {
      rootMargin: "0px",
      threshold: [0, 0.01],
    },
  );

  observer.observe(element);
  return observer;
};

export class RenderBudget {
  constructor({
    desktopPixelRatio,
    mobileFps = 30,
    mobilePixelRatio = 1,
  }) {
    this.desktopPixelRatio = desktopPixelRatio;
    this.mobileFrameInterval = 1000 / mobileFps;
    this.mobilePixelRatio = mobilePixelRatio;
    this.mobileViewport = window.matchMedia(MOBILE_PERFORMANCE_QUERY);
    this.lastRenderedAt = null;
  }

  get isMobile() {
    return this.mobileViewport.matches;
  }

  getPixelRatio(scale = 1) {
    const maximumPixelRatio = this.isMobile
      ? this.mobilePixelRatio
      : this.desktopPixelRatio;

    return Math.min((window.devicePixelRatio || 1) * scale, maximumPixelRatio);
  }

  shouldRender(frameTime) {
    if (!this.isMobile) {
      return true;
    }

    if (this.lastRenderedAt === null) {
      this.lastRenderedAt = frameTime;
      return true;
    }

    const elapsed = frameTime - this.lastRenderedAt;

    if (elapsed + FRAME_TIME_TOLERANCE_MS < this.mobileFrameInterval) {
      return false;
    }

    this.lastRenderedAt =
      frameTime - (elapsed % this.mobileFrameInterval);
    return true;
  }

  reset() {
    this.lastRenderedAt = null;
  }
}

export const scheduleIdleTask = (task, timeout = 700) => {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(task, { timeout });
    return;
  }

  window.setTimeout(task, 120);
};
