"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import confetti from "canvas-confetti";
import type { DiceSceneRef, DiceSkin } from "@/components/DiceScene";

const DiceScene = dynamic(() => import("@/components/DiceScene"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[430px] flex items-center justify-center text-slate-500 animate-pulse font-medium">
      Loading 3D Physics Engine...
    </div>
  ),
});

type PredictionType = "free" | "low" | "high" | "even" | "odd" | "exact";

interface Challenge {
  id: string;
  title: string;
  rewardXP: number;
  completed: boolean;
}

export default function Home() {
  const diceRef = useRef<DiceSceneRef>(null);

  // -------------------------------------------------------------
  // Game State
  // -------------------------------------------------------------
  const [score, setScore] = useState<number>(0);
  const [xp, setXp] = useState<number>(0);
  const [level, setLevel] = useState<number>(1);
  const [streak, setStreak] = useState<number>(0);
  const [bestStreak, setBestStreak] = useState<number>(0);
  const [totalRolls, setTotalRolls] = useState<number>(0);

  // Prediction State (Allows picking up to 3 numbers for exact choice)
  const [predictionType, setPredictionType] = useState<PredictionType>("high");
  const [exactNumbers, setExactNumbers] = useState<number[]>([6]);

  // Roll Status
  const [result, setResult] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [lastWin, setLastWin] = useState<boolean | null>(null);
  const [earnedPoints, setEarnedPoints] = useState<number>(0);
  const [rollHistory, setRollHistory] = useState<number[]>([]);

  // Customization & Settings
  const [currentSkin, setCurrentSkin] = useState<DiceSkin>("classic");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [showSkinModal, setShowSkinModal] = useState<boolean>(false);

  // Challenges
  const [challenges, setChallenges] = useState<Challenge[]>([
    { id: "roll6", title: "Roll a 6", rewardXP: 100, completed: false },
    { id: "streak3", title: "Reach a 3x Streak", rewardXP: 250, completed: false },
    { id: "exact", title: "Hit an Exact Prediction", rewardXP: 500, completed: false },
    { id: "even", title: "Roll an Even Number", rewardXP: 150, completed: false },
  ]);

  const xpNeeded = level * 300;

  const multiplier =
    streak >= 20 ? 5 : streak >= 10 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;

  // Toggle exact number selection (allows 1, 2, or up to 3 choices)
  const toggleExactNumber = (num: number) => {
    setExactNumbers((prev) => {
      if (prev.includes(num)) {
        // If already selected, remove it unless it's the only one selected
        if (prev.length > 1) {
          return prev.filter((n) => n !== num);
        }
        return prev;
      } else {
        // If less than 3, add it; if 3 already selected, replace the oldest one
        if (prev.length < 3) {
          return [...prev, num].sort((a, b) => a - b);
        } else {
          return [...prev.slice(1), num].sort((a, b) => a - b);
        }
      }
    });
  };

  // -------------------------------------------------------------
  // Roll Handler & Prediction Evaluation
  // -------------------------------------------------------------
  const rollDice = useCallback(() => {
    if (isRolling) return;

    setIsRolling(true);
    setLastWin(null);
    setEarnedPoints(0);

    const rolledNumber = Math.floor(Math.random() * 6) + 1;

    diceRef.current?.rollTo(rolledNumber, () => {
      setResult(rolledNumber);
      setIsRolling(false);
      setRollHistory((prev) => [rolledNumber, ...prev.slice(0, 7)]);
      setTotalRolls((prev) => prev + 1);

      // Evaluate Prediction
      let won = false;
      let basePoints = 0;

      if (predictionType === "free") {
        won = true;
        basePoints = 20;
      } else if (predictionType === "low" && rolledNumber <= 3) {
        won = true;
        basePoints = 50;
      } else if (predictionType === "high" && rolledNumber >= 4) {
        won = true;
        basePoints = 50;
      } else if (predictionType === "even" && rolledNumber % 2 === 0) {
        won = true;
        basePoints = 50;
      } else if (predictionType === "odd" && rolledNumber % 2 !== 0) {
        won = true;
        basePoints = 50;
      } else if (predictionType === "exact" && exactNumbers.includes(rolledNumber)) {
        won = true;
        // Payout scales according to how many numbers chosen: 1 choice = 300, 2 choices = 150, 3 choices = 100
        basePoints = exactNumbers.length === 1 ? 300 : exactNumbers.length === 2 ? 150 : 100;
      }

      if (won) {
        const nextStreak = streak + 1;
        const pts = Math.round(basePoints * multiplier);
        setLastWin(true);
        setEarnedPoints(pts);
        setScore((prev) => prev + pts);
        setStreak(nextStreak);
        setBestStreak((prev) => Math.max(prev, nextStreak));

        // Add XP
        const addedXp = pts + 30;
        setXp((prev) => {
          const newXp = prev + addedXp;
          if (newXp >= xpNeeded) {
            setLevel((lvl) => lvl + 1);
            confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
            return newXp - xpNeeded;
          }
          return newXp;
        });

        if (rolledNumber === 6 || predictionType === "exact" || nextStreak >= 3) {
          confetti({
            particleCount: 75,
            spread: 60,
            origin: { y: 0.7 },
            colors: ["#6366f1", "#a855f7", "#ec4899", "#fbbf24"],
          });
        }
      } else {
        setLastWin(false);
        setStreak(0);
        setXp((prev) => Math.min(xpNeeded - 1, prev + 10));
      }

      setChallenges((prev) =>
        prev.map((ch) => {
          if (ch.completed) return ch;
          if (ch.id === "roll6" && rolledNumber === 6) return { ...ch, completed: true };
          if (ch.id === "even" && rolledNumber % 2 === 0) return { ...ch, completed: true };
          if (ch.id === "streak3" && streak + 1 >= 3 && won) return { ...ch, completed: true };
          if (ch.id === "exact" && predictionType === "exact" && won) return { ...ch, completed: true };
          return ch;
        })
      );
    });
  }, [isRolling, predictionType, exactNumbers, streak, multiplier, xpNeeded]);

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

  const skinsList: { id: DiceSkin; name: string; desc: string; unlockLevel: number; icon: string }[] = [
    { id: "classic", name: "Classic Acrylic", desc: "Glossy white with dark recessed pips", unlockLevel: 1, icon: "⚪" },
    { id: "neon", name: "Cyber Neon", desc: "Dark obsidian with glowing cyan pulse", unlockLevel: 2, icon: "🟣" },
    { id: "gold", name: "Royal Gold", desc: "Metallic 24K gold with ruby pips", unlockLevel: 3, icon: "🟡" },
    { id: "magma", name: "Magma Flame", desc: "Fiery molten crimson with burning embers", unlockLevel: 4, icon: "🔴" },
    { id: "crystal", name: "Emerald Crystal", desc: "Translucent emerald crystal shine", unlockLevel: 5, icon: "💎" },
  ];

  return (
    <main className="min-h-screen bg-[#07090e] text-white flex flex-col justify-between p-4 sm:p-8 relative overflow-hidden select-none">
      {/* Dynamic Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-indigo-600/10 blur-[160px] rounded-full pointer-events-none" />

      {/* TOP HUD */}
      <header className="w-full max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 z-10">
        {/* Level & XP Progress */}
        <div className="flex items-center gap-3 bg-slate-900/70 border border-slate-800/80 backdrop-blur-md px-4 py-2 rounded-2xl w-full sm:w-auto justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center font-black text-sm shadow-md shadow-indigo-500/30">
              {level}
            </span>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300">Level {level}</div>
              <div className="text-[11px] text-slate-500">{xp} / {xpNeeded} XP</div>
            </div>
          </div>
          {/* XP Bar */}
          <div className="w-24 h-2 rounded-full bg-slate-800 overflow-hidden ml-2">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (xp / xpNeeded) * 100)}%` }}
            />
          </div>
        </div>

        {/* Center Streak & Score HUD */}
        <div className="flex items-center gap-3">
          {/* Streak Badge */}
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl border transition-all duration-300 ${
              streak > 0
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-lg shadow-amber-500/10 scale-105"
                : "bg-slate-900/60 border-slate-800 text-slate-400"
            }`}
          >
            <span className={`text-lg ${streak >= 3 ? "animate-bounce" : ""}`}>🔥</span>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider">Streak: {streak}</div>
              <div className="text-[10px] text-amber-400/80 font-bold">{multiplier}x Multiplier</div>
            </div>
          </div>

          {/* Score Counter */}
          <div className="flex items-center gap-2 bg-slate-900/70 border border-slate-800/80 px-4 py-2 rounded-2xl">
            <span className="text-amber-400 font-bold text-lg">⭐</span>
            <div>
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Score</div>
              <div className="text-base font-extrabold text-white">{score}</div>
            </div>
          </div>
        </div>

        {/* Right Controls: Skin Drawer & Sound */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSkinModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-indigo-300 transition-all cursor-pointer hover:border-indigo-500/50"
          >
            <span>🎨 Skins</span>
          </button>
          <button
            onClick={() => setSoundEnabled((prev) => !prev)}
            className="px-3 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-300 transition-all cursor-pointer"
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>
        </div>
      </header>

      {/* 3D Dice Stage */}
      <div className="w-full max-w-xl mx-auto my-auto flex flex-col items-center z-10">
        <div className="w-full relative">
          <DiceScene ref={diceRef} soundEnabled={soundEnabled} skin={currentSkin} />
        </div>

        {/* Dynamic Outcome Banner */}
        <div className="min-h-[58px] flex items-center justify-center -mt-2">
          {isRolling ? (
            <div className="flex items-center gap-2 px-6 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-semibold animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
              Rolling the 3D dice...
            </div>
          ) : result !== null ? (
            <div
              className={`flex items-center gap-3 px-6 py-2.5 rounded-2xl border backdrop-blur-md shadow-xl transition-all duration-300 transform scale-105 ${
                lastWin
                  ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-200 shadow-emerald-500/10"
                  : "bg-rose-950/60 border-rose-500/40 text-rose-200 shadow-rose-500/10"
              }`}
            >
              <span className="text-xl">{lastWin ? "🎉" : "💀"}</span>
              <span className="font-bold text-base">
                You rolled <span className="text-2xl font-black text-white ml-1">{result}</span>!
              </span>
              {lastWin ? (
                <span className="text-xs font-extrabold uppercase px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  +{earnedPoints} PTS ({multiplier}x)
                </span>
              ) : (
                <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  STREAK BROKEN
                </span>
              )}
            </div>
          ) : (
            <div className="text-slate-400 text-sm font-medium">
              Choose your prediction below and hit <span className="text-indigo-400 font-semibold">[ ROLL DICE ]</span>!
            </div>
          )}
        </div>
      </div>

      {/* GAMEPLAY CONTROLS */}
      <footer className="w-full max-w-2xl mx-auto flex flex-col items-center gap-5 z-10">
        {/* Prediction Selector */}
        <div className="w-full flex flex-col items-center gap-2.5">
          <div className="text-xs uppercase font-bold tracking-widest text-slate-400 flex items-center gap-2">
            <span>🎯 Make Your Prediction</span>
            <span className="text-[10px] text-indigo-400 font-normal">(Choice + Risk)</span>
          </div>

          {/* Quick Categories */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 w-full">
            <button
              onClick={() => setPredictionType("low")}
              disabled={isRolling}
              className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                predictionType === "low"
                  ? "bg-indigo-600 border-indigo-400 text-white font-bold shadow-lg shadow-indigo-600/30 scale-[1.02]"
                  : "bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white"
              }`}
            >
              <div className="text-sm font-extrabold">⬇️ LOW</div>
              <div className="text-[10px] text-slate-400">1 - 3 (2x)</div>
            </button>

            <button
              onClick={() => setPredictionType("high")}
              disabled={isRolling}
              className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                predictionType === "high"
                  ? "bg-indigo-600 border-indigo-400 text-white font-bold shadow-lg shadow-indigo-600/30 scale-[1.02]"
                  : "bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white"
              }`}
            >
              <div className="text-sm font-extrabold">⬆️ HIGH</div>
              <div className="text-[10px] text-slate-400">4 - 6 (2x)</div>
            </button>

            <button
              onClick={() => setPredictionType("even")}
              disabled={isRolling}
              className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                predictionType === "even"
                  ? "bg-indigo-600 border-indigo-400 text-white font-bold shadow-lg shadow-indigo-600/30 scale-[1.02]"
                  : "bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white"
              }`}
            >
              <div className="text-sm font-extrabold">⚖️ EVEN</div>
              <div className="text-[10px] text-slate-400">2, 4, 6 (2x)</div>
            </button>

            <button
              onClick={() => setPredictionType("odd")}
              disabled={isRolling}
              className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                predictionType === "odd"
                  ? "bg-indigo-600 border-indigo-400 text-white font-bold shadow-lg shadow-indigo-600/30 scale-[1.02]"
                  : "bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white"
              }`}
            >
              <div className="text-sm font-extrabold">🔢 ODD</div>
              <div className="text-[10px] text-slate-400">1, 3, 5 (2x)</div>
            </button>

            <button
              onClick={() => setPredictionType("exact")}
              disabled={isRolling}
              className={`col-span-2 sm:col-span-1 p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                predictionType === "exact"
                  ? "bg-gradient-to-r from-amber-500 to-pink-500 border-amber-300 text-white font-bold shadow-lg shadow-pink-500/20 scale-[1.02]"
                  : "bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white"
              }`}
            >
              <div className="text-sm font-extrabold">🎯 EXACT</div>
              <div className="text-[10px] text-amber-300/90 font-semibold">
                {exactNumbers.length === 1 ? "6x Payout!" : exactNumbers.length === 2 ? "3x Payout!" : "2x Payout!"}
              </div>
            </button>
          </div>

          {/* Exact Numbers Multi-Selector (Allows picking up to 3 numbers) */}
          {predictionType === "exact" && (
            <div className="flex items-center gap-2 mt-1 animate-fadeIn">
              <span className="text-xs text-slate-400 mr-1">Pick up to 3:</span>
              {[1, 2, 3, 4, 5, 6].map((num) => {
                const isSelected = exactNumbers.includes(num);
                return (
                  <button
                    key={num}
                    onClick={() => toggleExactNumber(num)}
                    disabled={isRolling}
                    className={`w-9 h-9 rounded-xl font-black text-sm border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-amber-500 border-amber-300 text-slate-950 scale-110 shadow-md shadow-amber-500/30"
                        : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Big Roll Trigger Button */}
        <button
          onClick={rollDice}
          disabled={isRolling}
          className={`group relative w-full sm:w-80 py-4 rounded-2xl text-lg font-black tracking-wider uppercase transition-all duration-300 transform active:scale-95 shadow-2xl flex items-center justify-center gap-3 ${
            isRolling
              ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
              : "bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 border border-indigo-400/30 cursor-pointer"
          }`}
        >
          <span className="text-2xl transition-transform group-hover:rotate-12 duration-300">🎲</span>
          <span>{isRolling ? "Rolling..." : "ROLL DICE"}</span>
        </button>

        {/* Recent Roll Badges & Stats */}
        {rollHistory.length > 0 && (
          <div className="flex items-center justify-between w-full text-xs text-slate-400 px-2">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Recent:</span>
              {rollHistory.slice(0, 6).map((val, idx) => (
                <span
                  key={idx}
                  className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold border ${
                    idx === 0
                      ? "bg-indigo-600/30 border-indigo-400 text-indigo-200"
                      : "bg-slate-900 border-slate-800 text-slate-400"
                  }`}
                >
                  {val}
                </span>
              ))}
            </div>
            <div>Best Streak: <span className="text-amber-400 font-bold">{bestStreak}</span> | Rolls: <span className="text-white font-bold">{totalRolls}</span></div>
          </div>
        )}
      </footer>

      {/* SKIN SELECTOR MODAL */}
      {showSkinModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0c101c] border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold flex items-center gap-2">
                <span>🎨</span> Dice Collection
              </h3>
              <button
                onClick={() => setShowSkinModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400">Unlock new 3D dice materials as you level up!</p>

            <div className="space-y-2.5">
              {skinsList.map((item) => {
                const isUnlocked = level >= item.unlockLevel;
                const isSelected = currentSkin === item.id;
                return (
                  <button
                    key={item.id}
                    disabled={!isUnlocked}
                    onClick={() => {
                      setCurrentSkin(item.id);
                      diceRef.current?.setSkin(item.id);
                      setShowSkinModal(false);
                    }}
                    className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left ${
                      isSelected
                        ? "bg-indigo-600/20 border-indigo-500 text-white"
                        : isUnlocked
                        ? "bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800 cursor-pointer"
                        : "bg-slate-950 border-slate-900 text-slate-600 cursor-not-allowed opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{item.icon}</span>
                      <div>
                        <div className="text-sm font-bold flex items-center gap-2">
                          {item.name}
                          {isSelected && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500 text-white font-extrabold uppercase">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">{item.desc}</div>
                      </div>
                    </div>
                    <div>
                      {isUnlocked ? (
                        <span className="text-xs text-emerald-400 font-bold">Unlocked</span>
                      ) : (
                        <span className="text-xs text-amber-500/90 font-bold">Lv {item.unlockLevel} 🔒</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
