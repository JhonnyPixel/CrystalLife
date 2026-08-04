import { Plane, Raycaster, Vector2, Vector3 } from "three";
import { GemSound } from "./gem-sound.js";

const DRAG_THRESHOLD_PX = 6;
const MAX_THROW_SPEED = 5.5;
const MIN_THROW_SPEED = 0.16;

const shortestAngleDelta = (from, to) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

export class GemInteractionController {
  constructor({
    container,
    camera,
    world,
    modules,
    statusElement,
    onDragStart,
    onDrag,
    onThrow,
    onStop,
  }) {
    this.container = container;
    this.camera = camera;
    this.world = world;
    this.modules = modules;
    this.hitAreas = modules.map(({ hitArea }) => hitArea);
    this.statusElement = statusElement;
    this.onDragStart = onDragStart;
    this.onDrag = onDrag;
    this.onThrow = onThrow;
    this.onStop = onStop;
    this.raycaster = new Raycaster();
    this.pointer = new Vector2();
    this.orbitPlane = new Plane(new Vector3(0, 1, 0), 0);
    this.worldPoint = new Vector3();
    this.localPoint = new Vector3();
    this.projectedPoint = new Vector3();
    this.sound = new GemSound();
    this.isEnabled = false;
    this.dragState = null;
    this.touchTargets = this.createTouchTargets();

    this.container.addEventListener("pointerdown", this.handlePointerDown);
    this.container.addEventListener("pointermove", this.handlePointerMove);
    this.container.addEventListener("pointerup", this.handlePointerUp);
    this.container.addEventListener("pointercancel", this.cancelDrag);
    this.container.addEventListener("pointerleave", this.handlePointerLeave);
    this.setEnabled(false);
  }

  setEnabled(isEnabled) {
    this.isEnabled = isEnabled;
    this.container.classList.toggle("is-interactive", isEnabled);
    this.container.setAttribute("aria-disabled", String(!isEnabled));

    if (!isEnabled) {
      this.cancelDrag();
      this.clearHover();
    }
  }

  handlePointerDown = (event) => {
    if (!this.isEnabled || event.button !== 0) {
      return;
    }

    const gemIndex =
      this.getTargetGemIndex(event.target) ??
      this.pickGem(event.clientX, event.clientY);

    if (gemIndex === null) {
      return;
    }

    const angle = this.getOrbitAngle(event.clientX, event.clientY);

    if (angle === null) {
      return;
    }

    event.preventDefault();
    this.sound.play(gemIndex, "grab");
    this.container.setPointerCapture(event.pointerId);
    this.container.classList.add("is-dragging-gem");
    this.onDragStart(gemIndex);

    this.dragState = {
      gemIndex,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastAngle: angle,
      lastTime: performance.now(),
      angularVelocity: 0,
      didMove: false,
    };
  };

  handlePointerMove = (event) => {
    if (!this.isEnabled) {
      return;
    }

    if (this.dragState?.pointerId === event.pointerId) {
      this.dragGem(event);
      return;
    }

    if (event.pointerType !== "touch") {
      const isGemHovered =
        this.pickGem(event.clientX, event.clientY) !== null;
      this.container.classList.toggle(
        "is-gem-hovered",
        isGemHovered,
      );
    }
  };

  handlePointerUp = (event) => {
    const dragState = this.dragState;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    if (this.container.hasPointerCapture(event.pointerId)) {
      this.container.releasePointerCapture(event.pointerId);
    }
    this.container.classList.remove("is-dragging-gem");
    this.dragState = null;

    if (!dragState.didMove) {
      this.onStop(dragState.gemIndex);
      this.sound.play(dragState.gemIndex, "stop");
      this.announce(
        `${this.modules[dragState.gemIndex].definition.name} fermata`,
      );
      return;
    }

    const releaseDelay = Math.max(
      (performance.now() - dragState.lastTime) / 1000,
      0,
    );
    const releaseVelocity =
      dragState.angularVelocity * Math.exp(-releaseDelay * 9);
    const throwSpeed =
      Math.abs(releaseVelocity) < MIN_THROW_SPEED
        ? Math.sign(releaseVelocity || 1) * MIN_THROW_SPEED
        : Math.max(
            -MAX_THROW_SPEED,
            Math.min(MAX_THROW_SPEED, releaseVelocity),
          );
    this.onThrow(dragState.gemIndex, throwSpeed);
    this.sound.play(
      dragState.gemIndex,
      "throw",
      Math.min(1.3, 0.7 + Math.abs(throwSpeed) / MAX_THROW_SPEED),
    );
    this.announce(
      `${this.modules[dragState.gemIndex].definition.name} lanciata`,
    );
  };

  dragGem(event) {
    event.preventDefault();
    const angle = this.getOrbitAngle(event.clientX, event.clientY);

    if (angle === null) {
      return;
    }

    const now = performance.now();
    const deltaSeconds = Math.max((now - this.dragState.lastTime) / 1000, 0.01);
    const deltaAngle = shortestAngleDelta(
      this.dragState.lastAngle,
      angle,
    );
    const movement = Math.hypot(
      event.clientX - this.dragState.startX,
      event.clientY - this.dragState.startY,
    );

    this.dragState.angularVelocity = deltaAngle / deltaSeconds;
    this.dragState.lastAngle = angle;
    this.dragState.lastTime = now;
    this.dragState.didMove ||= movement >= DRAG_THRESHOLD_PX;
    this.onDrag(this.dragState.gemIndex, angle);
  }

  pickGem(clientX, clientY) {
    this.setRayFromPointer(clientX, clientY);
    const [intersection] = this.raycaster.intersectObjects(
      this.hitAreas,
      false,
    );
    return intersection?.object.userData.gemIndex ?? null;
  }

  createTouchTargets() {
    return this.modules.map(({ definition }, gemIndex) => {
      const target = document.createElement("span");

      target.className = "gem-touch-target";
      target.dataset.gemTouchTarget = String(gemIndex);
      target.setAttribute("aria-hidden", "true");
      target.title = definition.name;
      this.container.append(target);
      return target;
    });
  }

  getTargetGemIndex(eventTarget) {
    const target = eventTarget?.closest?.("[data-gem-touch-target]");

    if (!target || !this.container.contains(target)) {
      return null;
    }

    const gemIndex = Number(target.dataset.gemTouchTarget);
    return Number.isInteger(gemIndex) ? gemIndex : null;
  }

  updateTouchTargets() {
    const bounds = this.container.getBoundingClientRect();

    this.modules.forEach(({ mesh }, index) => {
      const target = this.touchTargets[index];

      mesh.getWorldPosition(this.projectedPoint);
      this.projectedPoint.project(this.camera);

      const isVisible =
        this.projectedPoint.z >= -1 && this.projectedPoint.z <= 1;

      target.hidden = !isVisible;
      if (!isVisible) {
        return;
      }

      target.style.left = `${
        (this.projectedPoint.x * 0.5 + 0.5) * bounds.width
      }px`;
      target.style.top = `${
        (-this.projectedPoint.y * 0.5 + 0.5) * bounds.height
      }px`;
    });
  }

  getOrbitAngle(clientX, clientY) {
    this.setRayFromPointer(clientX, clientY);
    this.orbitPlane.constant = -this.world.position.y;

    if (!this.raycaster.ray.intersectPlane(this.orbitPlane, this.worldPoint)) {
      return null;
    }

    this.localPoint.copy(this.worldPoint);
    this.world.worldToLocal(this.localPoint);
    return Math.atan2(this.localPoint.z, this.localPoint.x);
  }

  setRayFromPointer(clientX, clientY) {
    const bounds = this.container.getBoundingClientRect();

    this.pointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  cancelDrag = () => {
    if (this.dragState) {
      this.onThrow(this.dragState.gemIndex, 0);
    }

    this.dragState = null;
    this.container.classList.remove("is-dragging-gem");
  };

  handlePointerLeave = () => {
    if (!this.dragState) {
      this.clearHover();
    }
  };

  clearHover() {
    this.container.classList.remove("is-gem-hovered");
  }

  playRelease(gemIndex) {
    this.sound.play(gemIndex, "release");
    this.announce(
      `${this.modules[gemIndex].definition.name} di nuovo in orbita`,
    );
  }

  announce(message) {
    if (!this.statusElement) {
      return;
    }

    this.statusElement.textContent = "";
    requestAnimationFrame(() => {
      this.statusElement.textContent = message;
    });
  }
}
