import { Vector3 } from "verge3d";

const VIEWPORT_MARGIN = 16;

export class GemInfoCard {
  constructor({ element, container, onRelease }) {
    this.element = element;
    this.container = container;
    this.onRelease = onRelease;
    this.selectedModule = null;
    this.worldPosition = new Vector3();

    if (!this.element) {
      return;
    }

    this.nameElement = this.element.querySelector("[data-gem-name]");
    this.descriptionElement = this.element.querySelector(
      "[data-gem-description]",
    );
    this.orbitElement = this.element.querySelector("[data-gem-orbit]");
    this.accentElement = this.element.querySelector("[data-gem-accent]");

    this.element
      .querySelector("[data-gem-close]")
      ?.addEventListener("click", this.hide);
    this.element
      .querySelector("[data-gem-release]")
      ?.addEventListener("click", this.release);
  }

  show(module) {
    if (!this.element) {
      return;
    }

    this.selectedModule = module;
    this.nameElement.textContent = module.definition.name;
    this.descriptionElement.textContent = module.definition.description;
    this.orbitElement.textContent = `${module.definition.distance.toFixed(1)} UA`;
    this.accentElement.style.backgroundColor =
      module.definition.cssColor;
    this.accentElement.style.boxShadow =
      `0 0 22px ${module.definition.cssColor}66`;
    this.element.hidden = false;
    requestAnimationFrame(() => {
      this.element.classList.add("is-visible");
    });
  }

  hide = () => {
    if (!this.element) {
      return;
    }

    this.selectedModule = null;
    this.element.classList.remove("is-visible");
    this.element.hidden = true;
  };

  release = () => {
    if (!this.selectedModule) {
      return;
    }

    this.onRelease(this.selectedModule.index);
    this.hide();
  };

  updatePosition(camera) {
    if (!this.element || !this.selectedModule) {
      return;
    }

    this.selectedModule.mesh.getWorldPosition(this.worldPosition);
    this.worldPosition.project(camera);

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const rawX = (this.worldPosition.x * 0.5 + 0.5) * width;
    const rawY = (-this.worldPosition.y * 0.5 + 0.5) * height;
    const cardHalfWidth = this.element.offsetWidth / 2;
    const cardHeight = this.element.offsetHeight;
    const safeX = Math.min(
      width - cardHalfWidth - VIEWPORT_MARGIN,
      Math.max(cardHalfWidth + VIEWPORT_MARGIN, rawX),
    );
    const safeY = Math.max(
      cardHeight + VIEWPORT_MARGIN,
      Math.min(height - VIEWPORT_MARGIN, rawY - 30),
    );

    this.element.style.left = `${safeX}px`;
    this.element.style.top = `${safeY}px`;
  }
}
