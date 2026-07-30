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
      ?.addEventListener("click", this.close);
    this.element.addEventListener(
      "pointerdown",
      this.stopSceneInteraction,
    );
    this.element.ownerDocument.addEventListener(
      "pointerdown",
      this.closeFromOutside,
      true,
    );
    this.element.ownerDocument.addEventListener(
      "keydown",
      this.closeWithKeyboard,
    );
  }

  show(module) {
    if (!this.element) {
      return;
    }

    this.selectedModule = module;
    this.nameElement.textContent = module.definition.name;
    this.descriptionElement.textContent = module.definition.description;
    this.updateOrbitLabel();
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

  close = () => {
    if (!this.selectedModule) {
      return;
    }

    const moduleIndex = this.selectedModule.index;

    this.hide();
    this.onRelease?.(moduleIndex);
  };

  closeFromOutside = (event) => {
    if (
      !this.selectedModule ||
      this.element.contains(event.target)
    ) {
      return;
    }

    this.close();
  };

  closeWithKeyboard = (event) => {
    if (event.key === "Escape") {
      this.close();
    }
  };

  stopSceneInteraction = (event) => {
    event.stopPropagation();
  };

  updateOrbitLabel() {
    if (!this.orbitElement || !this.selectedModule) {
      return;
    }

    this.orbitElement.textContent =
      `${this.selectedModule.orbitDistance.toFixed(1)} UA`;
  }

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
