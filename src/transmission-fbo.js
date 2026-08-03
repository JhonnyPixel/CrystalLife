import { WebGLRenderTarget, LinearFilter, HalfFloatType } from "three";
import MeshTransmissionMaterialImpl from "./transmissionmaterial.js";

/**
 * Manages an FBO (Frame Buffer Object) that captures the scene behind
 * transmission materials so they can refract what's behind them.
 *
 * Usage:
 *   const fbo = new TransmissionFBO(renderer, scene, camera);
 *   // In your render loop, before your main render call:
 *   fbo.update();
 *   renderer.render(scene, camera);
 *   // On resize:
 *   fbo.setSize(width, height, pixelRatio);
 */
export class TransmissionFBO {
  constructor(renderer, scene, camera, { resolution = 0.5 } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.resolution = resolution;
    this.transmissionMeshes = [];

    const size = renderer.getSize(/** @type {any} */ ({}));
    const pr = renderer.getPixelRatio();
    const w = Math.max(Math.floor(size.x * pr * resolution), 1);
    const h = Math.max(Math.floor(size.y * pr * resolution), 1);

    this.renderTarget = new WebGLRenderTarget(w, h, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      type: HalfFloatType,
      generateMipmaps: false,
    });
  }

  /** Call after renderer resize. */
  setSize(width, height, pixelRatio = 1) {
    const w = Math.max(Math.floor(width * pixelRatio * this.resolution), 1);
    const h = Math.max(Math.floor(height * pixelRatio * this.resolution), 1);

    this.renderTarget.setSize(w, h);
  }

  /**
   * Render the scene to the FBO, hiding all transmission meshes.
   * Then assign the resulting texture as `buffer` on every
   * MeshTransmissionMaterialImpl found in the scene.
   */
  update() {
    // 1. Collect and hide transmission meshes
    this.transmissionMeshes.length = 0;
    this.scene.traverse((object) => {
      if (!object.isMesh) {
        return;
      }

      const mats = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const hasTransmission = mats.some(
        (m) => m instanceof MeshTransmissionMaterialImpl,
      );

      if (hasTransmission) {
        this.transmissionMeshes.push({ mesh: object, wasVisible: object.visible });
        object.visible = false;
      }
    });

    // 2. Render to FBO
    const currentTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(currentTarget);

    // 3. Restore visibility and assign buffer texture
    const texture = this.renderTarget.texture;

    this.transmissionMeshes.forEach(({ mesh, wasVisible }) => {
      mesh.visible = wasVisible;

      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];

      mats.forEach((m) => {
        if (m instanceof MeshTransmissionMaterialImpl) {
          m.buffer = texture;
        }
      });
    });
  }

  dispose() {
    this.renderTarget.dispose();
  }
}
