"use client";

/**
 * ZoeConnect's hero visual identity: the "Intelligence Core" — a single
 * engineered object standing in for the platform itself, rather than any
 * screenshot, dashboard, or floating UI card. Built from procedural
 * geometry and a hand-written GLSL shader so there are no texture/model
 * assets to fetch — everything here is generated on the GPU at runtime.
 *
 * Deliberately plain Three.js rather than @react-three/fiber: R3F's
 * react-reconciler integration currently crashes ("Cannot read properties
 * of undefined (reading 'ReactCurrentOwner')") under this project's
 * Next.js 15 / React 18 pairing — a known upstream incompatibility (R3F v8
 * targets React 18's internals shape, but Next 15's App Router bundles a
 * React 19-shaped internals object for client chunks; R3F v9 fixes it but
 * requires React 19 site-wide, which is out of scope for a hero-only
 * change). Driving the WebGL scene imperatively sidesteps the reconciler
 * entirely, so this component only depends on `three` itself.
 *
 * Visual language, deliberately: layered rings (the modules orbiting one
 * platform core), a breathing/displacing core (the engine is alive, always
 * computing), and a thin particle shell (data moving through the system).
 * Colors are pulled straight from the brand's brass/slate palette — no
 * violet/cyan sci-fi accents.
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Brand palette (mirrors tailwind.config.ts `signal` / `slate` tokens so the
// object always matches the rest of the UI, light or dark).
// ---------------------------------------------------------------------------
const COLOR_RIM = new THREE.Color("#f2c98a"); // signal-300
const COLOR_BAND = new THREE.Color("#e6b45c"); // signal-400
const COLOR_CORE = new THREE.Color("#15181d"); // near slate-900
const COLOR_RING_WARM = new THREE.Color("#d89a3a"); // signal-500
const COLOR_RING_COOL = new THREE.Color("#4a5568"); // cool structural gray

// ---------------------------------------------------------------------------
// Shader: a simplex-noise-displaced core with fresnel rim light and slow
// travelling energy bands. Kept as a single ShaderMaterial (no postprocessing
// pipeline) to stay cheap on the GPU and light on bundle size.
// ---------------------------------------------------------------------------
const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m*m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const CORE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uAmplitude;
uniform float uReveal;
varying vec3 vNormal;
varying vec3 vPos;
varying float vDisp;
${NOISE_GLSL}
void main() {
  vNormal = normalize(normalMatrix * normal);
  float n = snoise(position * 1.5 + uTime * 0.1);
  float disp = n * 0.025 * uAmplitude;
  vDisp = disp;
  vec3 newPos = position + normal * disp;
  vPos = newPos;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos * uReveal, 1.0);
}
`;

const CORE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uColorCore;
uniform vec3 uColorRim;
uniform vec3 uColorBand;
varying vec3 vNormal;
varying vec3 vPos;
varying float vDisp;
void main() {
  vec3 viewDir = normalize(cameraPosition - vPos);
  float fresnel = pow(1.0 - clamp(dot(viewDir, vNormal), 0.0, 1.0), 2.4);
  // A single bright equatorial energy line, like a lit seam running through
  // the core — it slowly drifts up and down rather than sitting static.
  float bandCenter = sin(uTime * 0.35) * 0.35;
  float bandDist = abs(vPos.y - bandCenter);
  float band = 1.0 - smoothstep(0.0, 0.11, bandDist);
  vec3 col = mix(uColorCore, uColorRim, fresnel);
  col += uColorBand * band * 1.1;
  col += uColorRim * max(vDisp, 0.0) * 2.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

type Quality = "high" | "low";

type RingSpec = {
  radius: number;
  tilt: [number, number, number];
  speed: number;
  color: THREE.Color;
  satellite?: boolean;
};

const RING_SPECS: RingSpec[] = [
  { radius: 2.05, tilt: [0.55, 0.15, 0], speed: 0.09, color: COLOR_RING_WARM, satellite: true },
  { radius: 2.55, tilt: [-0.35, 0.5, 0.2], speed: -0.06, color: COLOR_RING_COOL },
  { radius: 3.05, tilt: [0.2, -0.4, 0.4], speed: 0.045, color: COLOR_RING_WARM, satellite: true },
];

export default function IntelligenceCore({
  quality = "high",
  reducedMotion = false,
}: {
  quality?: Quality;
  reducedMotion?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // WebGL context creation can fail outright on some mobile browsers —
  // older Android WebViews, restrictive in-app browsers, devices under
  // memory pressure. Uncaught, that throw happens inside this effect with
  // nothing to catch it, and it took the whole page down blank instead of
  // just this one object failing to appear. `failed` lets the component
  // degrade to a plain static glow instead, so the rest of the page (and
  // the rest of the site's own content) is never at risk from this.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cleanup: (() => void) | undefined;

    function setupScene() {
    if (!container) return;

    // A deliberately low-poly icosahedron, flat-shaded — a cut-gem look,
    // not a smooth globe. The earlier high-subdivision + strong noise
    // displacement made the silhouette read as randomly lumpy rather than
    // a clean faceted object; keeping the facet count low and the
    // displacement subtle keeps the geometry crisp while it still breathes.
    const detail = quality === "high" ? 2 : 1;
    const particleCount = quality === "high" ? 520 : 180;
    const maxDpr = quality === "high" ? 1.6 : 1;

    let width = container.clientWidth || 1;
    let height = container.clientHeight || 1;

    // ---- scene / camera / renderer -----------------------------------
    const scene = new THREE.Scene();
    // Pulled back enough that the outer ring (radius 3.05, the farthest
    // any point in the scene gets from center) stays inside the view
    // frustum with margin at every rotation — it was clipping at the
    // container edge before because the camera sat closer than the ring's
    // own radius given this field of view.
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0, 9.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setSize(width, height);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const keyLight = new THREE.PointLight(0xf2c98a, 1.6);
    keyLight.position.set(4, 3, 5);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x4a5568, 0.8);
    rimLight.position.set(-4, -2, -4);
    scene.add(rimLight);

    // ---- rig: everything tilts together toward the cursor -------------
    const rig = new THREE.Group();
    scene.add(rig);

    // ---- core -----------------------------------------------------------
    const coreMaterial = new THREE.ShaderMaterial({
      vertexShader: CORE_VERTEX,
      fragmentShader: CORE_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: 1 },
        uReveal: { value: 0.001 },
        uColorCore: { value: COLOR_CORE },
        uColorRim: { value: COLOR_RIM },
        uColorBand: { value: COLOR_BAND },
      },
    });
    // `flatShading` on the material only affects three's built-in shader
    // chunks, which a fully custom ShaderMaterial doesn't use. To get true
    // per-facet flat shading here, bake it into the geometry itself: make
    // every face's three vertices unique (toNonIndexed) so each triangle
    // gets its own un-shared normal instead of an averaged, smoothed one.
    const coreGeometry = new THREE.IcosahedronGeometry(1.35, detail).toNonIndexed();
    coreGeometry.computeVertexNormals();
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    rig.add(coreMesh);

    // ---- orbit rings + satellites ---------------------------------------
    const disposableGeometries: THREE.BufferGeometry[] = [coreGeometry];
    const disposableMaterials: THREE.Material[] = [coreMaterial];

    const rings = RING_SPECS.map((spec) => {
      const group = new THREE.Group();
      group.rotation.set(...spec.tilt);
      rig.add(group);

      const torusGeometry = new THREE.TorusGeometry(spec.radius, 0.006, 12, 180);
      const torusMaterial = new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: 0.4,
      });
      disposableGeometries.push(torusGeometry);
      disposableMaterials.push(torusMaterial);
      group.add(new THREE.Mesh(torusGeometry, torusMaterial));

      let satellite: THREE.Mesh | null = null;
      if (spec.satellite) {
        const satGeometry = new THREE.OctahedronGeometry(0.075, 0);
        const satMaterial = new THREE.MeshBasicMaterial({
          color: COLOR_RIM,
          transparent: true,
          opacity: 1,
        });
        disposableGeometries.push(satGeometry);
        disposableMaterials.push(satMaterial);
        satellite = new THREE.Mesh(satGeometry, satMaterial);
        satellite.position.set(spec.radius, 0, 0);
        group.add(satellite);
      }

      return { group, satellite, spec };
    });

    // ---- ambient particle shell ------------------------------------------
    let particlePoints: THREE.Points | null = null;
    if (quality === "high") {
      const positions = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount; i++) {
        const r = 2.4 + Math.random() * 2.1;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
      }
      const particleGeometry = new THREE.BufferGeometry();
      particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const particleMaterial = new THREE.PointsMaterial({
        size: 0.018,
        color: COLOR_RIM,
        transparent: true,
        opacity: 0.55,
        sizeAttenuation: true,
        depthWrite: false,
      });
      disposableGeometries.push(particleGeometry);
      disposableMaterials.push(particleMaterial);
      particlePoints = new THREE.Points(particleGeometry, particleMaterial);
      rig.add(particlePoints);
    }

    // ---- pointer tracking -------------------------------------------------
    const pointer = { x: 0, y: 0 };
    function handlePointerMove(e: PointerEvent) {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    }
    if (!reducedMotion) {
      window.addEventListener("pointermove", handlePointerMove);
    }

    // ---- resize -------------------------------------------------------
    const resizeObserver = new ResizeObserver(() => {
      const el = containerRef.current;
      if (!el) return;
      width = el.clientWidth || 1;
      height = el.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(container);

    // ---- render loop -------------------------------------------------------
    const clock = new THREE.Clock();
    let raf = 0;
    let renderedOnce = false;

    function tick() {
      const elapsed = clock.getElapsedTime();

      if (!reducedMotion || !renderedOnce) {
        const revealT = Math.min(elapsed / 1.5, 1);
        const revealEased = 1 - Math.pow(1 - revealT, 3);
        coreMaterial.uniforms.uTime.value = reducedMotion ? 0 : elapsed;
        coreMaterial.uniforms.uReveal.value = reducedMotion ? 1 : 0.15 + revealEased * 0.85;
        coreMaterial.uniforms.uAmplitude.value = reducedMotion ? 0.25 : 1;

        const breathe = reducedMotion ? 0 : Math.sin(elapsed * 0.6) * 0.02;
        coreMesh.scale.setScalar(1 + breathe);
        if (!reducedMotion) {
          coreMesh.rotation.y = elapsed * 0.06;
          coreMesh.rotation.x = Math.sin(elapsed * 0.08) * 0.08;
        }

        rings.forEach(({ group, satellite, spec }) => {
          const ringT = Math.min(elapsed / 1.8, 1);
          const ringEased = 1 - Math.pow(1 - ringT, 3);
          const r = reducedMotion ? spec.radius : spec.radius * (0.3 + ringEased * 0.7);
          group.rotation.z = reducedMotion ? group.rotation.z : elapsed * spec.speed;
          group.scale.setScalar(r / spec.radius);
          if (satellite && !reducedMotion) {
            const angle = elapsed * spec.speed * 3 + spec.radius;
            satellite.position.set(Math.cos(angle) * spec.radius, Math.sin(angle) * spec.radius, 0);
          }
        });

        if (particlePoints && !reducedMotion) {
          particlePoints.rotation.y = elapsed * 0.015;
          particlePoints.rotation.x = elapsed * 0.006;
        }

        if (!reducedMotion) {
          const targetY = pointer.x * 0.35;
          const targetX = -pointer.y * 0.22;
          rig.rotation.y += (targetY - rig.rotation.y) * 0.04;
          rig.rotation.x += (targetX - rig.rotation.x) * 0.04;
        }
      }

      renderer.render(scene, camera);
      renderedOnce = true;

      if (!reducedMotion) {
        raf = requestAnimationFrame(tick);
      }
    }

    if (reducedMotion) {
      // Render a handful of frames so the reveal/breathe settle to their
      // resting state, then stop — a static frame instead of a live loop.
      let frames = 0;
      const settleFrames = () => {
        tick();
        frames += 1;
        if (frames < 90) raf = requestAnimationFrame(settleFrames);
      };
      settleFrames();
    } else {
      raf = requestAnimationFrame(tick);
    }

      cleanup = () => {
        cancelAnimationFrame(raf);
        resizeObserver.disconnect();
        window.removeEventListener("pointermove", handlePointerMove);
        disposableGeometries.forEach((g) => g.dispose());
        disposableMaterials.forEach((m) => m.dispose());
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      };
    }

    try {
      setupScene();
    } catch (err) {
      console.warn("IntelligenceCore: WebGL scene failed to initialize, falling back.", err);
      cleanup?.();
      setFailed(true);
    }

    return () => cleanup?.();
  }, [quality, reducedMotion]);

  if (failed) {
    // Same visual language as the loading fallback in hero-core.tsx's
    // CoreFallback — a plain, static, CSS-only glow. No WebGL, nothing
    // that can throw, so this can never itself be the thing that breaks.
    return (
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <div className="h-40 w-40 rounded-full bg-accent/20 blur-2xl sm:h-56 sm:w-56" />
        <div className="absolute h-24 w-24 rounded-full border border-accent/30 sm:h-32 sm:w-32" />
      </div>
    );
  }

  return <div ref={containerRef} className="absolute inset-0" />;
}
