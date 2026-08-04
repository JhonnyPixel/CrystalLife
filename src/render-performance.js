const MOBILE_DISPLAY_QUERY =
  "(max-width: 700px), (hover: none) and (pointer: coarse)";

export const MOBILE_VIEWPORT_QUERY =
  "(max-width: 560px), (hover: none) and (pointer: coarse)";

const getNativePixelRatio = (scale = 1) =>
  Math.max(window.devicePixelRatio || 1, 1) * scale;

export const isMobileDisplay = () =>
  window.matchMedia(MOBILE_DISPLAY_QUERY).matches;

export const getRenderPixelRatio = (
  desktopMaximumPixelRatio,
  scale = 1,
) => {
  const nativePixelRatio = getNativePixelRatio(scale);

  if (isMobileDisplay()) {
    return nativePixelRatio;
  }

  return Math.min(nativePixelRatio, desktopMaximumPixelRatio);
};

export const getDecorativeRenderPixelRatio = (
  desktopMaximumPixelRatio,
  mobileMaximumPixelRatio,
  scale = 1,
) =>
  Math.min(
    getNativePixelRatio(scale),
    isMobileDisplay()
      ? mobileMaximumPixelRatio
      : desktopMaximumPixelRatio,
  );

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

export const scheduleIdleTask = (task, timeout = 700) => {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(task, { timeout });
    return;
  }

  window.setTimeout(task, 120);
};
