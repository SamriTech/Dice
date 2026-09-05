"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import confetti from "canvas-confetti";
import type { DiceSceneRef } from "@/components/DiceScene";

// Dynamically import DiceScene without SSR
const DiceScene = dynamic(() => import("@/components/DiceScene"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[450px] flex items-center justify-center text-slate-500 animate-pulse font-medium">
      Rendering 3D Dice Engine...
    </div>
  ),
});

export default function Home() {
  const diceRef = useRef<DiceSceneRef>(null);

  const [result, setResult] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [rollHistory, setRollHistory] = useState<number[]>([]);
  const [totalRolls, setTotalRolls] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const rollDice = useCallback(() => {
    if (isRolling) return;

    setIsRolling(true);
    const randomOutcome = Math.floor(Math.random() * 6) + 1;

    // Trigger 3D Dice physics roll (Frame-accurate sounds fire inside DiceScene on floor hit)
    diceRef.current?.rollTo(randomOutcome, () => {
      setResult(randomOutcome);
      setIsRolling(false);
      setRollHistory((prev) => [randomOutcome, ...prev.slice(0, 7)]);
      setTotalRolls((prev) => prev + 1);

      // Celebrate on max roll 6
      if (randomOutcome === 6) {
        confetti({
          particleCount: 85,
          spread: 70,
          origin: { y: 0.7 },
          colors: ["#6366f1", "#a855f7", "#ec4899", "#fbbf24"],
        });
      }
    });
  }, [isRolling]);

  // Spacebar shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isRolling) {
        e.preventDefault();
        rollDice();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rollDice, isRolling]);

  return (
    <main className="min-h-screen bg-[#090d16] text-white flex flex-col items-center justify-between p-6 sm:p-10 relative overflow-hidden select-none">
      {/* Ambient background lighting */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-indigo-600/10 blur-[150px] rounded-full pointer-events-none" />

      {/* Top Header with Sound Control */}
      <header className="w-full max-w-2xl flex items-center justify-between z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-widest">
          3D Interactive Game
        </div>

        <button
          onClick={() => setSoundEnabled((prev) => !prev)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
          title="Toggle Sound Effects"
        >
          <span>{soundEnabled ? "🔊 Sound: ON" : "🔇 Sound: OFF"}</span>
        </button>
      </header>

      {/* Main Title */}
      <div className="text-center z-10 space-y-1 mt-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-300 bg-clip-text text-transparent">
          🎲 3D Dice Game
        </h1>
        <p className="text-slate-400 text-sm sm:text-base max-w-md mx-auto">
          Press <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs text-indigo-300 font-mono">SPACE</kbd> or click the button below to roll!
        </p>
      </div>

      {/* 3D Dice Viewport */}
      <div className="w-full max-w-2xl z-10 my-auto flex flex-col items-center">
        <div className="w-full relative">
          <DiceScene ref={diceRef} soundEnabled={soundEnabled} />
        </div>

        {/* Display the Roll Result */}
        <div className="mt-2 min-h-[56px] flex items-center justify-center">
          {isRolling ? (
            <div className="flex items-center gap-2 px-5 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-base font-medium animate-pulse">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
              Rolling the dice...
            </div>
          ) : result !== null ? (
            <div className="flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-950/70 via-slate-900/80 to-purple-950/70 border border-indigo-500/30 shadow-lg shadow-indigo-500/10 backdrop-blur-md transition-all duration-300 transform scale-105">
              <span className="text-slate-400 font-medium text-lg">You rolled:</span>
              <span className="text-3xl font-black bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
                {result}
              </span>
              {result === 6 && (
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300">
                  MAX ROLL! 🔥
                </span>
              )}
            </div>
          ) : (
            <div className="text-slate-500 text-sm font-medium">
              Click <span className="text-slate-400 font-semibold">[ ROLL DICE ]</span> to start
            </div>
          )}
        </div>
      </div>

      {/* Roll Trigger & Game Controls */}
      <footer className="w-full max-w-md z-10 flex flex-col items-center gap-6">
        <button
          onClick={rollDice}
          disabled={isRolling}
          className={`group relative inline-flex items-center justify-center gap-3 px-10 py-4 rounded-2xl text-lg font-bold tracking-wider uppercase transition-all duration-300 transform active:scale-95 shadow-xl ${
            isRolling
              ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
              : "bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 border border-indigo-400/30 cursor-pointer"
          }`}
        >
          <span className="text-2xl transition-transform group-hover:rotate-12 duration-300">
            🎲
          </span>
          <span>{isRolling ? "Rolling..." : "ROLL DICE"}</span>
        </button>

        {/* Recent Roll History */}
        {rollHistory.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
              Recent Rolls (Total: {totalRolls})
            </div>
            <div className="flex items-center gap-2">
              {rollHistory.map((val, idx) => (
                <span
                  key={idx}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border transition-all ${
                    idx === 0
                      ? "bg-indigo-600/30 border-indigo-400 text-indigo-200 scale-110 shadow-sm"
                      : "bg-slate-900/60 border-slate-800 text-slate-400"
                  }`}
                >
                  {val}
                </span>
              ))}
            </div>
          </div>
        )}
      </footer>
    </main>
  );
}
