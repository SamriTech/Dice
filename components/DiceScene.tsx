"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export interface DiceSceneRef {
  rollTo: (targetNumber: number, onComplete?: () => void) => void;
}

interface DiceSceneProps {
  onRollComplete?: (result: number) => void;
  soundEnabled?: boolean;
}

// -------------------------------------------------------------
// Frame-Accurate Collision Sound Synthesizer
// -------------------------------------------------------------
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

function playImpactSound(intensity: "heavy" | "medium" | "soft") {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const config = {
    heavy: { vol: 0.55, thudFreq: 220, clickFreq: 1200, decay: 0.09 },
    medium: { vol: 0.32, thudFreq: 310, clickFreq: 1500, decay: 0.06 },
    soft: { vol: 0.15, thudFreq: 420, clickFreq: 1900, decay: 0.04 },
  }[intensity];

  // 1. Sharp acrylic transient click
  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  clickOsc.type = "square";
  clickOsc.frequency.setValueAtTime(config.clickFreq, now);
  clickOsc.frequency.exponentialRampToValueAtTime(160, now + 0.025);

  clickGain.gain.setValueAtTime(config.vol * 0.4, now);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

  clickOsc.connect(clickGain);
  clickGain.connect(ctx.destination);
  clickOsc.start(now);
  clickOsc.stop(now + 0.03);

  // 2. Resonant tabletop thud
  const thudOsc = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thudOsc.type = "triangle";
  thudOsc.frequency.setValueAtTime(config.thudFreq, now);
  thudOsc.frequency.exponentialRampToValueAtTime(60, now + config.decay);

  thudGain.gain.setValueAtTime(config.vol, now);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, now + config.decay);

  thudOsc.connect(thudGain);
  thudGain.connect(ctx.destination);
  thudOsc.start(now);
  thudOsc.stop(now + config.decay + 0.01);
}

// -------------------------------------------------------------
// Face textures generator for numbers 1 to 6
// -------------------------------------------------------------
function createDiceFaceTexture(number: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Glossy Off-White Acrylic Base
  const baseGrad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.1,
    size / 2,
    size / 2,
    size * 0.75
  );
  baseGrad.addColorStop(0, "#ffffff");
  baseGrad.addColorStop(0.85, "#f6f7f9");
  baseGrad.addColorStop(1, "#e2e8f0");

  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  const drawPip = (x: number, y: number, radius = 34) => {
    // Outer shadow ring
    const shadowGrad = ctx.createRadialGradient(
      x - 3,
      y - 3,
      radius * 0.6,
      x,
      y,
      radius + 5
    );
    shadowGrad.addColorStop(0, "rgba(0, 0, 0, 0.45)");
    shadowGrad.addColorStop(0.7, "rgba(0, 0, 0, 0.2)");
    shadowGrad.addColorStop(1, "rgba(255, 255, 255, 0.4)");

    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.fill();

    // Glossy black core
    const pipGrad = ctx.createRadialGradient(
      x - radius * 0.3,
      y - radius * 0.3,
      radius * 0.1,
      x,
      y,
      radius
    );
    pipGrad.addColorStop(0, "#27272a");
    pipGrad.addColorStop(0.7, "#111113");
    pipGrad.addColorStop(1, "#09090b");

    ctx.fillStyle = pipGrad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.beginPath();
    ctx.arc(x - radius * 0.32, y - radius * 0.32, radius * 0.26, 0, Math.PI * 2);
    ctx.fill();
  };

  const c = size / 2;
  const l = size * 0.27;
  const r = size * 0.73;
  const t = size * 0.27;
  const b = size * 0.73;

  switch (number) {
    case 1:
      drawPip(c, c, 46);
      break;
    case 2:
      drawPip(l, t);
      drawPip(r, b);
      break;
    case 3:
      drawPip(l, t);
      drawPip(c, c);
      drawPip(r, b);
      break;
    case 4:
      drawPip(l, t);
      drawPip(r, t);
      drawPip(l, b);
      drawPip(r, b);
      break;
    case 5:
      drawPip(l, t);
      drawPip(r, t);
      drawPip(c, c);
      drawPip(l, b);
      drawPip(r, b);
      break;
    case 6:
      drawPip(l, t);
      drawPip(l, c);
      drawPip(l, b);
      drawPip(r, t);
      drawPip(r, c);
      drawPip(r, b);
      break;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  return texture;
}

// -------------------------------------------------------------
// Exact Face Rotations to bring the target number onto the TOP face
// Three.js Box Materials order:
// [0: Face 1 (+X), 1: Face 6 (-X), 2: Face 2 (+Y), 3: Face 5 (-Y), 4: Face 3 (+Z), 5: Face 4 (-Z)]
// -------------------------------------------------------------
const FACE_ROTATIONS: Record<number, { x: number; y: number; z: number }> = {
  // Face 1 (+X): Rotating Z by +90 deg moves +X to +Y (TOP)
  1: { x: 0, y: 0, z: Math.PI / 2 },

  // Face 6 (-X): Rotating Z by -90 deg moves -X to +Y (TOP)
  6: { x: 0, y: 0, z: -Math.PI / 2 },

  // Face 2 (+Y): Already on +Y (TOP)
  2: { x: 0, y: 0, z: 0 },

  // Face 5 (-Y): Rotating X by 180 deg moves -Y to +Y (TOP)
  5: { x: Math.PI, y: 0, z: 0 },

  // Face 3 (+Z): Rotating X by -90 deg moves +Z to +Y (TOP)
  3: { x: -Math.PI / 2, y: 0, z: 0 },

  // Face 4 (-Z): Rotating X by +90 deg moves -Z to +Y (TOP)
  4: { x: Math.PI / 2, y: 0, z: 0 },
};

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const DiceScene = forwardRef<DiceSceneRef, DiceSceneProps>(
  ({ onRollComplete, soundEnabled = true }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const diceRef = useRef<THREE.Mesh | null>(null);
    const isRollingRef = useRef<boolean>(false);
    const hasRolledRef = useRef<boolean>(false);
    const soundEnabledRef = useRef<boolean>(soundEnabled);

    useEffect(() => {
      soundEnabledRef.current = soundEnabled;
    }, [soundEnabled]);

    const rollAnimRef = useRef<{
      startTime: number;
      duration: number;
      startRot: { x: number; y: number; z: number };
      targetRot: { x: number; y: number; z: number };
      finalTargetRot: { x: number; y: number; z: number };
      targetNumber: number;
      hit1Played: boolean;
      hit2Played: boolean;
      hit3Played: boolean;
      onComplete?: () => void;
    } | null>(null);

    useImperativeHandle(ref, () => ({
      rollTo: (targetNumber: number, onComplete?: () => void) => {
        if (!diceRef.current || isRollingRef.current) return;
        isRollingRef.current = true;
        hasRolledRef.current = true;

        getAudioContext();

        const dice = diceRef.current;
        const baseRotation = FACE_ROTATIONS[targetNumber] || { x: 0, y: 0, z: 0 };

        // Even integer number of 360-degree rotations (2 * PI * N)
        const fullSpinsX = 4 * Math.PI * 2;
        const fullSpinsY = 6 * Math.PI * 2;
        const fullSpinsZ = 4 * Math.PI * 2;

        rollAnimRef.current = {
          startTime: performance.now(),
          duration: 1350,
          startRot: { x: dice.rotation.x, y: dice.rotation.y, z: dice.rotation.z },
          targetRot: {
            x: baseRotation.x + fullSpinsX,
            y: baseRotation.y + fullSpinsY,
            z: baseRotation.z + fullSpinsZ,
          },
          finalTargetRot: { ...baseRotation },
          targetNumber,
          hit1Played: false,
          hit2Played: false,
          hit3Played: false,
          onComplete,
        };
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;
      const container = containerRef.current;

      const width = container.clientWidth || 550;
      const height = container.clientHeight || 450;

      // 1. Scene & Camera
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
      camera.position.set(2.8, 3.4, 4.6);
      camera.lookAt(0, -0.1, 0);

      // 2. Transparent WebGL Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.setClearColor(0x000000, 0);

      container.innerHTML = "";
      container.appendChild(renderer.domElement);

      // 3. Studio Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
      keyLight.position.set(4, 9, 5);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      keyLight.shadow.bias = -0.0004;
      keyLight.shadow.radius = 3;
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xcfd8dc, 1.0);
      fillLight.position.set(-6, 3, 2);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0x818cf8, 1.6);
      rimLight.position.set(-3, 6, -5);
      scene.add(rimLight);

      // 4. 3D Rounded Dice
      const diceGeometry = new RoundedBoxGeometry(2, 2, 2, 16, 0.32);
      
      // Face arrangement: [0: +X, 1: -X, 2: +Y, 3: -Y, 4: +Z, 5: -Z]
      const faceNumbers = [1, 6, 2, 5, 3, 4];
      const materials = faceNumbers.map((num) => {
        const texture = createDiceFaceTexture(num);
        return new THREE.MeshPhysicalMaterial({
          map: texture,
          roughness: 0.1,
          metalness: 0.02,
          clearcoat: 0.95,
          clearcoatRoughness: 0.05,
          reflectivity: 0.7,
        });
      });

      const dice = new THREE.Mesh(diceGeometry, materials);
      dice.position.set(0, 0.1, 0);
      dice.castShadow = true;
      dice.receiveShadow = true;
      scene.add(dice);
      diceRef.current = dice;

      // Initial resting pose: Face 6 on top
      dice.rotation.set(FACE_ROTATIONS[6].x, FACE_ROTATIONS[6].y, FACE_ROTATIONS[6].z);

      // 5. Floor (Shadow receiver)
      const floorGeometry = new THREE.PlaneGeometry(30, 30);
      const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.45 });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.25;
      floor.receiveShadow = true;
      scene.add(floor);

      // 6. Physics Animation Loop
      let animationFrameId: number;
      const animate = (time: number) => {
        animationFrameId = requestAnimationFrame(animate);

        if (rollAnimRef.current && dice) {
          const anim = rollAnimRef.current;
          const elapsed = time - anim.startTime;
          const progress = Math.min(1, Math.max(0, elapsed / anim.duration));

          // Easing rotation
          const easeT = easeOutCubic(progress);
          dice.rotation.x = anim.startRot.x + (anim.targetRot.x - anim.startRot.x) * easeT;
          dice.rotation.y = anim.startRot.y + (anim.targetRot.y - anim.startRot.y) * easeT;
          dice.rotation.z = anim.startRot.z + (anim.targetRot.z - anim.startRot.z) * easeT;

          // 3-Phase Bounce Physics:
          if (progress < 0.48) {
            const tNorm = progress / 0.48;
            dice.position.y = 0.1 + Math.sin(tNorm * Math.PI) * 2.4;
          } else if (progress < 0.76) {
            if (!anim.hit1Played) {
              anim.hit1Played = true;
              if (soundEnabledRef.current) playImpactSound("heavy");
            }
            const tNorm = (progress - 0.48) / (0.76 - 0.48);
            dice.position.y = 0.1 + Math.sin(tNorm * Math.PI) * 0.75;
          } else if (progress < 0.96) {
            if (!anim.hit2Played) {
              anim.hit2Played = true;
              if (soundEnabledRef.current) playImpactSound("medium");
            }
            const tNorm = (progress - 0.76) / (0.96 - 0.76);
            dice.position.y = 0.1 + Math.sin(tNorm * Math.PI) * 0.2;
          } else {
            if (!anim.hit3Played) {
              anim.hit3Played = true;
              if (soundEnabledRef.current) playImpactSound("soft");
            }
            dice.position.y = 0.1;
          }

          // Complete Animation: Lock rotation to EXACT face angles
          if (progress >= 1) {
            dice.rotation.set(
              anim.finalTargetRot.x,
              anim.finalTargetRot.y,
              anim.finalTargetRot.z
            );
            dice.position.y = 0.1;
            isRollingRef.current = false;
            const { onComplete, targetNumber } = anim;
            rollAnimRef.current = null;
            if (onComplete) onComplete();
            if (onRollComplete) onRollComplete(targetNumber);
          }
        } else if (dice && !isRollingRef.current && !hasRolledRef.current) {
          dice.rotation.y += 0.003;
        }

        renderer.render(scene, camera);
      };

      animationFrameId = requestAnimationFrame(animate);

      // 7. Resize Observer
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width: w, height: h } = entry.contentRect;
          if (w > 0 && h > 0) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
          }
        }
      });

      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
        cancelAnimationFrame(animationFrameId);
        renderer.dispose();
        diceGeometry.dispose();
        materials.forEach((m) => {
          m.map?.dispose();
          m.dispose();
        });
        floorGeometry.dispose();
        floorMaterial.dispose();
        container.innerHTML = "";
      };
    }, [onRollComplete]);

    return (
      <div
        ref={containerRef}
        style={{ width: "100%", height: "450px" }}
        className="flex items-center justify-center relative"
      />
    );
  }
);

DiceScene.displayName = "DiceScene";
export default DiceScene;
