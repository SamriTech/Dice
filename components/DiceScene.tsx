"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type DiceSkin = "classic" | "neon" | "gold" | "magma" | "crystal";

export interface DiceSceneRef {
  rollTo: (targetNumber: number, onComplete?: () => void) => void;
  setSkin: (skin: DiceSkin) => void;
}

interface DiceSceneProps {
  onRollComplete?: (result: number) => void;
  soundEnabled?: boolean;
  skin?: DiceSkin;
}

// -------------------------------------------------------------
// Audio Synthesis Engine
// -------------------------------------------------------------
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) sharedAudioCtx = new AudioCtx();
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
// Procedural Textures for All Dice Skins
// -------------------------------------------------------------
function createDiceFaceTexture(number: number, skin: DiceSkin = "classic"): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // 1. Background per skin
  if (skin === "neon") {
    ctx.fillStyle = "#09090e";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth = 14;
    ctx.strokeRect(14, 14, size - 28, size - 28);
  } else if (skin === "gold") {
    const goldGrad = ctx.createLinearGradient(0, 0, size, size);
    goldGrad.addColorStop(0, "#fde047");
    goldGrad.addColorStop(0.5, "#ca8a04");
    goldGrad.addColorStop(1, "#854d0e");
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, 0, size, size);
  } else if (skin === "magma") {
    const magmaGrad = ctx.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size * 0.7);
    magmaGrad.addColorStop(0, "#fb923c");
    magmaGrad.addColorStop(0.6, "#dc2626");
    magmaGrad.addColorStop(1, "#450a0a");
    ctx.fillStyle = magmaGrad;
    ctx.fillRect(0, 0, size, size);
  } else if (skin === "crystal") {
    const crystalGrad = ctx.createLinearGradient(0, 0, size, size);
    crystalGrad.addColorStop(0, "#a7f3d0");
    crystalGrad.addColorStop(0.5, "#10b981");
    crystalGrad.addColorStop(1, "#064e3b");
    ctx.fillStyle = crystalGrad;
    ctx.fillRect(0, 0, size, size);
  } else {
    // Classic Acrylic
    const baseGrad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.75);
    baseGrad.addColorStop(0, "#ffffff");
    baseGrad.addColorStop(0.85, "#f6f7f9");
    baseGrad.addColorStop(1, "#e2e8f0");
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, size, size);
  }

  // 2. Pip Drawing with skin-specific colors and glows
  const drawPip = (x: number, y: number, radius = 34) => {
    if (skin === "neon") {
      // Glowing Cyan/Magenta Pip
      ctx.shadowColor = "#22d3ee";
      ctx.shadowBlur = 25;
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else if (skin === "gold") {
      // Inset Dark Obsidian / Ruby Pip
      const pipGrad = ctx.createRadialGradient(x, y, 4, x, y, radius);
      pipGrad.addColorStop(0, "#450a0a");
      pipGrad.addColorStop(1, "#18181b");
      ctx.fillStyle = pipGrad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(253, 224, 71, 0.6)";
      ctx.beginPath();
      ctx.arc(x - 8, y - 8, 8, 0, Math.PI * 2);
      ctx.fill();
    } else if (skin === "magma") {
      // Fiery Yellow Ember Pip
      ctx.shadowColor = "#fef08a";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (skin === "crystal") {
      // Emerald Glow Pip
      ctx.fillStyle = "#ecfdf5";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Classic Inset Acrylic Pip
      const shadowGrad = ctx.createRadialGradient(x - 3, y - 3, radius * 0.6, x, y, radius + 5);
      shadowGrad.addColorStop(0, "rgba(0, 0, 0, 0.45)");
      shadowGrad.addColorStop(0.7, "rgba(0, 0, 0, 0.2)");
      shadowGrad.addColorStop(1, "rgba(255, 255, 255, 0.4)");
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
      ctx.fill();

      const pipGrad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius);
      pipGrad.addColorStop(0, "#27272a");
      pipGrad.addColorStop(0.7, "#111113");
      pipGrad.addColorStop(1, "#09090b");
      ctx.fillStyle = pipGrad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.beginPath();
      ctx.arc(x - radius * 0.32, y - radius * 0.32, radius * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }
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
// Exact Face Rotations for Top Alignment
// [0: Face 1 (+X), 1: Face 6 (-X), 2: Face 2 (+Y), 3: Face 5 (-Y), 4: Face 3 (+Z), 5: Face 4 (-Z)]
// -------------------------------------------------------------
const FACE_ROTATIONS: Record<number, { x: number; y: number; z: number }> = {
  1: { x: 0, y: 0, z: Math.PI / 2 },
  6: { x: 0, y: 0, z: -Math.PI / 2 },
  2: { x: 0, y: 0, z: 0 },
  5: { x: Math.PI, y: 0, z: 0 },
  3: { x: -Math.PI / 2, y: 0, z: 0 },
  4: { x: Math.PI / 2, y: 0, z: 0 },
};

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const DiceScene = forwardRef<DiceSceneRef, DiceSceneProps>(
  ({ onRollComplete, soundEnabled = true, skin = "classic" }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const diceRef = useRef<THREE.Mesh | null>(null);
    const isRollingRef = useRef<boolean>(false);
    const hasRolledRef = useRef<boolean>(false);
    const soundEnabledRef = useRef<boolean>(soundEnabled);
    const currentSkinRef = useRef<DiceSkin>(skin);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const cameraBasePos = useRef<THREE.Vector3>(new THREE.Vector3(2.8, 3.4, 4.6));

    useEffect(() => {
      soundEnabledRef.current = soundEnabled;
    }, [soundEnabled]);

    const updateDiceSkin = (newSkin: DiceSkin) => {
      if (!diceRef.current) return;
      currentSkinRef.current = newSkin;
      const faceNumbers = [1, 6, 2, 5, 3, 4];
      const newMaterials = faceNumbers.map((num) => {
        const texture = createDiceFaceTexture(num, newSkin);
        const isGold = newSkin === "gold";
        const isNeon = newSkin === "neon";
        return new THREE.MeshPhysicalMaterial({
          map: texture,
          roughness: isGold ? 0.25 : 0.1,
          metalness: isGold ? 0.85 : isNeon ? 0.2 : 0.02,
          clearcoat: 0.95,
          clearcoatRoughness: 0.05,
          reflectivity: isGold ? 0.9 : 0.7,
          emissive: isNeon ? new THREE.Color(0x082f49) : new THREE.Color(0x000000),
          emissiveIntensity: isNeon ? 0.4 : 0.0,
        });
      });
      diceRef.current.material = newMaterials;
    };

    useEffect(() => {
      updateDiceSkin(skin);
    }, [skin]);

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
      setSkin: (newSkin: DiceSkin) => {
        updateDiceSkin(newSkin);
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
      camera.position.copy(cameraBasePos.current);
      camera.lookAt(0, -0.1, 0);
      cameraRef.current = camera;

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
      const faceNumbers = [1, 6, 2, 5, 3, 4];
      const materials = faceNumbers.map((num) => {
        const texture = createDiceFaceTexture(num, currentSkinRef.current);
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

      // 6. Physics Animation Loop with Camera Shake & Collision Sync
      let animationFrameId: number;
      let shakeIntensity = 0;

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
              shakeIntensity = 0.12; // Trigger camera shake on heavy impact
              if (soundEnabledRef.current) playImpactSound("heavy");
            }
            const tNorm = (progress - 0.48) / (0.76 - 0.48);
            dice.position.y = 0.1 + Math.sin(tNorm * Math.PI) * 0.75;
          } else if (progress < 0.96) {
            if (!anim.hit2Played) {
              anim.hit2Played = true;
              shakeIntensity = 0.05; // Minor camera shake on bounce
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

          // Complete Animation
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

        // Camera Shake Damping
        if (cameraRef.current) {
          if (shakeIntensity > 0.001) {
            cameraRef.current.position.set(
              cameraBasePos.current.x + (Math.random() - 0.5) * shakeIntensity,
              cameraBasePos.current.y + (Math.random() - 0.5) * shakeIntensity,
              cameraBasePos.current.z + (Math.random() - 0.5) * shakeIntensity
            );
            shakeIntensity *= 0.85; // Rapid decay
          } else {
            cameraRef.current.position.copy(cameraBasePos.current);
          }
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
        style={{ width: "100%", height: "430px" }}
        className="flex items-center justify-center relative"
      />
    );
  }
);

DiceScene.displayName = "DiceScene";
export default DiceScene;
