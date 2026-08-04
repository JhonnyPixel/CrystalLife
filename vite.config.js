import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const GEM_ASSETS_MODULE_ID = "virtual:gem-assets";
const RESOLVED_GEM_ASSETS_MODULE_ID = `\0${GEM_ASSETS_MODULE_ID}`;
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const gemsDirectory = resolve(projectRoot, "public", "gems");
const GEM_DIRECTORIES = Object.freeze({
  body: "corpo",
  center: "centro",
  discipline: "disciplina",
  growth: "crescita",
  mind: "mente",
  relationships: "relazioni",
});

const getPublicGemPath = (directoryName, fileName) =>
  `gems/${encodeURIComponent(directoryName)}/${encodeURIComponent(fileName)}`;

const getAssetFingerprint = (filePaths) => {
  const hash = createHash("sha256");

  filePaths.filter(Boolean).forEach((filePath) => {
    const content = readFileSync(filePath);

    hash.update(String(content.byteLength));
    hash.update(content);
  });

  return hash.digest("hex");
};

const findReferencedBinary = (modelPath, availableFiles) => {
  if (extname(modelPath).toLowerCase() !== ".gltf") {
    return null;
  }

  try {
    const model = JSON.parse(readFileSync(modelPath, "utf8"));
    const referencedBinary = model.buffers
      ?.map(({ uri }) => uri)
      .find((uri) => /\.bin(?:$|[?#])/i.test(uri));
    const referencedName = referencedBinary
      ? basename(decodeURIComponent(referencedBinary.split(/[?#]/)[0]))
      : null;

    if (referencedName && availableFiles.includes(referencedName)) {
      return referencedName;
    }
  } catch {
    return null;
  }

  return null;
};

const findGemAsset = (directoryName) => {
  const directoryPath = resolve(gemsDirectory, directoryName);

  if (!existsSync(directoryPath)) {
    return { binaryPath: null, fingerprint: null, modelPath: null };
  }

  const availableFiles = readdirSync(directoryPath).sort((left, right) =>
    left.localeCompare(right, "it", { sensitivity: "base" })
  );

  // Prefer .glb (self-contained binary) over .gltf + .bin
  const glbName = availableFiles.find((fileName) =>
    /\.glb$/i.test(fileName)
  );

  if (glbName) {
    return {
      binaryPath: null,
      fingerprint: getAssetFingerprint([
        resolve(directoryPath, glbName),
      ]),
      modelPath: getPublicGemPath(directoryName, glbName),
    };
  }

  const modelName = availableFiles.find((fileName) =>
    /\.gltf$/i.test(fileName)
  );

  if (!modelName) {
    return { binaryPath: null, fingerprint: null, modelPath: null };
  }

  const modelPath = resolve(directoryPath, modelName);
  const referencedBinary = findReferencedBinary(
    modelPath,
    availableFiles,
  );
  const matchingBinary = availableFiles.find(
    (fileName) =>
      extname(fileName).toLowerCase() === ".bin" &&
      basename(fileName, extname(fileName)).toLowerCase() ===
        basename(modelName, extname(modelName)).toLowerCase(),
  );
  const fallbackBinary = availableFiles.find(
    (fileName) => extname(fileName).toLowerCase() === ".bin",
  );
  const binaryName =
    referencedBinary ?? matchingBinary ?? fallbackBinary ?? null;

  return {
    binaryPath: binaryName
      ? getPublicGemPath(directoryName, binaryName)
      : null,
    fingerprint: getAssetFingerprint([
      modelPath,
      binaryName ? resolve(directoryPath, binaryName) : null,
    ]),
    modelPath: getPublicGemPath(directoryName, modelName),
  };
};

const findGemAssets = () => {
  const canonicalAssets = new Map();

  return Object.fromEntries(
    Object.entries(GEM_DIRECTORIES).map(([key, directoryName]) => {
      const { fingerprint, ...asset } = findGemAsset(directoryName);
      const canonicalAsset = fingerprint
        ? canonicalAssets.get(fingerprint)
        : null;

      if (canonicalAsset) {
        return [key, canonicalAsset];
      }

      if (fingerprint) {
        canonicalAssets.set(fingerprint, asset);
      }

      return [key, asset];
    }),
  );
};

const gemAssetsPlugin = () => ({
  name: "gem-assets",

  resolveId(source) {
    return source === GEM_ASSETS_MODULE_ID
      ? RESOLVED_GEM_ASSETS_MODULE_ID
      : null;
  },

  load(id) {
    if (id !== RESOLVED_GEM_ASSETS_MODULE_ID) {
      return null;
    }

    return `export default Object.freeze(${JSON.stringify(
      findGemAssets(),
    )});`;
  },

  handleHotUpdate({ file, server }) {
    if (resolve(file).startsWith(gemsDirectory)) {
      const module = server.moduleGraph.getModuleById(
        RESOLVED_GEM_ASSETS_MODULE_ID,
      );

      if (module) {
        server.moduleGraph.invalidateModule(module);
      }
      server.ws.send({ type: "full-reload" });
      return [];
    }
  },
});

export default defineConfig({
  base: "./",
  plugins: [gemAssetsPlugin()],
  build: {
    // Three.js WebGL renderer supera di poco soglia Vite predefinita.
    chunkSizeWarningLimit: 550,
  },
});
