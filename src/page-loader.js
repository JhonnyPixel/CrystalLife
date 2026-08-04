const MINIMUM_VISIBLE_TIME_MS = 1200;
const MAXIMUM_WAIT_TIME_MS = 5000;
const EXIT_TRANSITION_TIME_MS = 520;

const wait = (duration) =>
  new Promise((resolve) => window.setTimeout(resolve, duration));

const waitForWindowLoad = () => {
  if (document.readyState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.addEventListener("load", resolve, { once: true });
  });
};

const waitForFonts = () => document.fonts?.ready ?? Promise.resolve();

const waitForStableFrame = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

export class PageLoader {
  constructor(element, root = document.documentElement) {
    this.element = element;
    this.root = root;
    this.startedAt = performance.now();
  }

  async hideWhenReady(readinessTasks = []) {
    if (!this.element) {
      this.root.classList.remove("is-page-loading");
      return;
    }

    await Promise.race([
      Promise.allSettled([
        waitForWindowLoad(),
        waitForFonts(),
        ...readinessTasks,
      ]),
      wait(MAXIMUM_WAIT_TIME_MS),
    ]);
    await waitForStableFrame();

    const elapsed = performance.now() - this.startedAt;
    await wait(Math.max(MINIMUM_VISIBLE_TIME_MS - elapsed, 0));

    this.element.setAttribute("aria-hidden", "true");
    this.root.classList.add("is-page-ready");
    await wait(EXIT_TRANSITION_TIME_MS);
    this.element.remove();
    this.root.classList.remove("is-page-loading");
  }
}
