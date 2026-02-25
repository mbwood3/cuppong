import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

let composer = null;

// Vignette shader
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    darkness: { value: 1.2 },
    offset: { value: 1.1 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float darkness;
    uniform float offset;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vignette = 1.0 - dot(uv, uv);
      vignette = clamp(pow(vignette, darkness), 0.0, 1.0);
      texel.rgb *= vignette;
      gl_FragColor = texel;
    }
  `,
};

export function initPostProcessing(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());

  composer = new EffectComposer(renderer);

  // Render pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom — subtle glow on emissive surfaces (ball, gore highlights, particles)
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.35,  // strength — subtle
    0.5,   // radius
    0.72   // threshold — only bright things bloom
  );
  composer.addPass(bloomPass);

  // Vignette — dark edges for horror framing
  const vignettePass = new ShaderPass(VignetteShader);
  composer.addPass(vignettePass);

  // Output pass (tone mapping + color space)
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return composer;
}

export function resizePostProcessing(width, height, pixelRatio) {
  if (composer) {
    composer.setSize(width, height);
    composer.setPixelRatio(pixelRatio);
  }
}

export function getComposer() {
  return composer;
}
