import { getRenderPixelRatio } from "./render-performance.js";

const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;

  void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;

  varying vec2 v_texCoord;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_pointer;

  float random(vec2 point) {
    return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
  }

  float smoothNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);

    local = local * local * (3.0 - 2.0 * local);

    float bottomLeft = random(cell);
    float bottomRight = random(cell + vec2(1.0, 0.0));
    float topLeft = random(cell + vec2(0.0, 1.0));
    float topRight = random(cell + vec2(1.0, 1.0));

    return mix(
      mix(bottomLeft, bottomRight, local.x),
      mix(topLeft, topRight, local.x),
      local.y
    );
  }

  float fractalNoise(vec2 point) {
    float result = 0.0;
    float amplitude = 0.5;

    for (int octave = 0; octave < 5; octave++) {
      result += amplitude * smoothNoise(point);
      point *= 2.0;
      amplitude *= 0.5;
    }

    return result;
  }

  float shootingStar(vec2 uv, float time, float seed) {
    float duration = 5.5 + seed * 2.8;
    float shiftedTime = time + seed * 19.31;
    float cycle = floor(shiftedTime / duration);
    float phase = fract(shiftedTime / duration);
    float chance = step(
      0.44,
      random(vec2(cycle + seed * 7.0, seed * 93.17))
    );
    float appear = smoothstep(0.0, 0.018, phase);
    float disappear = 1.0 - smoothstep(0.16, 0.23, phase);
    float aspect = u_resolution.x / u_resolution.y;
    vec2 position = vec2(uv.x * aspect, uv.y);
    float startX = mix(
      -0.12,
      aspect * 0.72,
      random(vec2(cycle + seed, 5.27))
    );
    float startY = mix(
      0.7,
      1.08,
      random(vec2(cycle - seed, 17.43))
    );
    float slope = mix(
      -0.48,
      -0.76,
      random(vec2(cycle + 2.0, seed * 31.0))
    );
    vec2 direction = normalize(vec2(1.0, slope));
    vec2 head =
      vec2(startX, startY) +
      direction * phase * 3.4;
    vec2 delta = position - head;
    float behind = dot(delta, -direction);
    float perpendicular = abs(
      delta.x * direction.y -
      delta.y * direction.x
    );
    float line =
      (1.0 - smoothstep(0.0, 0.007, perpendicular)) *
      (1.0 - smoothstep(0.0, 0.3, behind)) *
      step(0.0, behind);
    float headLight =
      1.0 - smoothstep(0.0, 0.016, length(delta));

    return chance * appear * disappear * (line * 0.58 + headLight);
  }

  void main() {
    vec2 uv = v_texCoord;
    vec2 point = (uv - 0.5) * 2.0;

    point.x *= u_resolution.x / u_resolution.y;

    float time = u_time * 0.025;
    float nebulaNoise = fractalNoise(point * 0.62 + time * 0.12);
    float cloud = smoothstep(0.34, 0.86, nebulaNoise);

    vec3 black = vec3(0.0015, 0.001, 0.0025);
    vec3 violetBlack = vec3(0.038, 0.006, 0.082);
    vec3 color = mix(black, violetBlack, cloud * 0.72);

    float stars = 0.0;

    for (float layer = 0.0; layer < 3.0; layer++) {
      vec2 starCell =
        point * (layer + 1.0) * 6.5 +
        time * (layer + 0.35);
      float starSeed = random(floor(starCell));
      float starMask = step(0.991, starSeed);
float starShape = pow(
  clamp(1.0 - length(fract(starCell) - 0.5) * 3.5, 0.0, 1.0),
  4.0
);
      float pulse =
        0.42 +
        0.28 * sin(u_time * 0.75 + starSeed * 80.0);

      stars += starMask * starShape * pulse;
    }

    vec2 pointer = u_pointer / u_resolution - 0.5;
    pointer.x *= u_resolution.x / u_resolution.y;
    float pointerDistance = length(point - pointer * 0.38);
    float pointerLight = 0.012 / (pointerDistance + 0.72);
    vec3 violet = vec3(0.34, 0.12, 0.72);
    float shooting =
      step(0.001, u_time) *
      (
        shootingStar(uv, u_time, 0.37) +
        shootingStar(uv, u_time, 0.81)
      );

    color += violet * pointerLight;
    color += vec3(0.82, 0.79, 0.9) * stars;
    color += vec3(0.72, 0.58, 1.0) * shooting;

    float vignette =
      1.0 -
      smoothstep(0.28, 1.48, length(point * vec2(0.72, 0.9)));

    color *= 0.62 + vignette * 0.38;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const createShader = (gl, type, source) => {
  const shader = gl.createShader(type);

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);

    gl.deleteShader(shader);
    throw new Error(`Shader sfondo non compilato: ${message}`);
  }

  return shader;
};

const createProgram = (gl) => {
  const program = gl.createProgram();
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    FRAGMENT_SHADER,
  );

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);

    gl.deleteProgram(program);
    throw new Error(`Programma sfondo non collegato: ${message}`);
  }

  return program;
};

export class SpaceBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl =
      canvas.getContext("webgl", { alpha: false, antialias: false }) ??
      canvas.getContext("experimental-webgl", {
        alpha: false,
        antialias: false,
      });
    this.pointer = { x: 0, y: 0 };
    this.frameId = null;
    this.isVisible = !document.hidden;
    this.prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    this.isStatic = this.prefersReducedMotion;

    if (!this.gl) {
      canvas.classList.add("is-static");
      return;
    }

    try {
      this.setupRenderer();
    } catch (error) {
      console.warn(error);
      canvas.classList.add("is-static");
      return;
    }

    if ("ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(canvas);
    } else {
      window.addEventListener("resize", this.resize, { passive: true });
    }
    window.addEventListener("pointermove", this.onPointerMove, {
      passive: true,
    });
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.resize();
    this.render(0);
  }

  setupRenderer() {
    const gl = this.gl;

    this.program = createProgram(gl);
    gl.useProgram(this.program);

    const vertices = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const position = gl.getAttribLocation(this.program, "a_position");

    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.timeUniform = gl.getUniformLocation(this.program, "u_time");
    this.resolutionUniform = gl.getUniformLocation(
      this.program,
      "u_resolution",
    );
    this.pointerUniform = gl.getUniformLocation(this.program, "u_pointer");
  }

  resize = () => {
    if (!this.gl) {
      return;
    }

    const pixelRatio = getRenderPixelRatio(1.35);
    const width = Math.max(
      Math.round(this.canvas.clientWidth * pixelRatio),
      1,
    );
    const height = Math.max(
      Math.round(this.canvas.clientHeight * pixelRatio),
      1,
    );

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    if (this.pointer.x === 0 && this.pointer.y === 0) {
      this.pointer.x = width * 0.5;
      this.pointer.y = height * 0.5;
    }
  };

  onPointerMove = (event) => {
    if (!this.gl) {
      return;
    }

    this.pointer.x =
      (event.clientX / Math.max(window.innerWidth, 1)) * this.canvas.width;
    this.pointer.y =
      (1 - event.clientY / Math.max(window.innerHeight, 1)) *
      this.canvas.height;
  };

  onVisibilityChange = () => {
    this.isVisible = !document.hidden;

    if (this.isVisible && this.frameId === null) {
      this.frameId = requestAnimationFrame(this.render);
    }
  };

  render = (frameTime) => {
    this.frameId = null;

    if (!this.gl || !this.isVisible) {
      return;
    }

    const gl = this.gl;
    const time = this.isStatic ? 0 : frameTime * 0.001;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.uniform1f(this.timeUniform, time);
    gl.uniform2f(
      this.resolutionUniform,
      this.canvas.width,
      this.canvas.height,
    );
    gl.uniform2f(
      this.pointerUniform,
      this.pointer.x,
      this.pointer.y,
    );
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (!this.isStatic) {
      this.frameId = requestAnimationFrame(this.render);
    }
  };
}
