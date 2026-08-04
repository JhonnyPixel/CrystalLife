export const replaceCanvasWithSnapshot = (
  canvas,
  { className, quality = 0.92, type = "image/webp" },
) =>
  new Promise((resolve) => {
    const handleBlob = (blob) => {
      if (!blob) {
        resolve(false);
        return;
      }

      const snapshotUrl = URL.createObjectURL(blob);
      const image = document.createElement("img");
      const finish = (didLoad) => {
        URL.revokeObjectURL(snapshotUrl);

        if (!didLoad && image.isConnected) {
          image.replaceWith(canvas);
        }

        resolve(didLoad);
      };

      image.className = className;
      image.alt = "";
      image.decoding = "async";
      image.draggable = false;
      image.setAttribute("aria-hidden", "true");
      image.addEventListener("load", () => finish(true), { once: true });
      image.addEventListener("error", () => finish(false), { once: true });
      image.src = snapshotUrl;
      canvas.replaceWith(image);
    };

    try {
      canvas.toBlob(handleBlob, type, quality);
    } catch {
      resolve(false);
    }
  });
