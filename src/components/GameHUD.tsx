import { PlayerState } from '../types';
import { ShieldCheck, Zap, Maximize, AlertTriangle, Heart, Award, Sparkles } from 'lucide-react';

interface GameHUDProps {
  players: PlayerState[];
  timeRemaining: number;
  localPlayerId: string;
}

export default function GameHUD({ players, timeRemaining, localPlayerId }: GameHUDProps) {
  // Sort players to display local player first
  const displayPlayers = [...players].sort((a, b) => {
    if (a.id === localPlayerId) return -1;
    if (b.id === localPlayerId) return 1;
    return 0;
  });

  return (
    <div className="absolute top-0 inset-x-0 z-40 p-4 flex flex-col pointer-events-none select-none">
      {/* Top Lightning Deal & Time bar */}
      <div className="flex justify-between items-center bg-neon-yellow border-4 border-brutal-black px-4 py-2 text-brutal-black shadow-[5px_5px_0px_#1a1a1a] mx-auto w-full max-w-2xl mb-4 text-xs font-black select-none pointer-events-auto">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brutal-black animate-spin" />
          <span className="tracking-tight text-[10px] md:text-xs">⚡ 번개 마감 한정 99.9% 초특가 할인 질주 중 ⚡</span>
        </div>
        <div className="flex items-center gap-1.5 text-red-600 bg-white border-2 border-brutal-black px-2 py-0.5 text-xs font-extrabold animate-pulse">
          <span>마감대기: {timeRemaining}초</span>
        </div>
      </div>

      {/* Players State Overlay */}
      <div className="flex flex-wrap gap-3 items-start justify-start w-full">
        {displayPlayers.map((player) => {
          const isLocal = player.id === localPlayerId;
          const bgStyle = isLocal 
            ? 'bg-white border-4 border-brutal-black shadow-[6px_6px_0px_rgba(255,99,33,1)]' 
            : 'bg-white border-4 border-brutal-black shadow-[4px_4px_0px_#1a1a1a] opacity-90';
          
          return (
            <div
              key={player.id}
              className={`p-3 w-full sm:w-56 pointer-events-auto border transition-all ${bgStyle}`}
            >
              {/* Header Info */}
              <div className="flex items-center gap-2 mb-2 border-b-2 border-dashed border-brutal-black pb-2">
                <span className="text-xl">🏃</span>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black truncate text-brutal-black max-w-[120px]">
                      {player.name}
                    </span>
                    {isLocal && (
                      <span className="text-[9px] bg-temu-orange text-white border-2 border-brutal-black font-black px-1.5 py-0.5 select-none leading-none uppercase animate-pulse">
                        ME
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-zinc-500 font-extrabold">🛒 특가 쇼핑 레이서</span>
                </div>
              </div>

              {/* Stats Meters */}
              <div className="grid grid-cols-2 gap-2 text-[10px] font-black uppercase text-brutal-black mb-2">
                <div className="flex items-center gap-1 bg-yellow-100/40 p-1.5 border-2 border-brutal-black">
                  <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                  <span>몫: {player.lives}</span>
                </div>
                <div className="flex items-center gap-1 bg-yellow-100/40 p-1.5 border-2 border-brutal-black">
                  <Award className="w-3.5 h-3.5 text-zinc-700" />
                  <span className="truncate">쿠폰: {player.couponCount}개</span>
                </div>
              </div>

              {/* Cash Saved score bar */}
              <div className="px-2 py-1.5 bg-orange-100 border-2 border-brutal-black text-brutal-black font-extrabold text-[10px] flex justify-between items-center mb-1.5 shadow-[2px_2px_0px_#1a1a1a]">
                <span>💰 절약 득템 금액:</span>
                <span className="text-sm font-black text-red-600">${player.score.toLocaleString()}</span>
              </div>

              {/* Active Powerups */}
              {player.powerup && player.powerup.visualActive && (
                <div className="flex items-center gap-1.5 py-1 px-1.5 bg-neon-yellow border-2 border-brutal-black text-brutal-black text-[9px] font-black animate-pulse shadow-[2px_2px_0px_#1a1a1a]">
                  {player.powerup.type === 'speed_shoes' && (
                    <>
                      <Zap className="w-3 h-3 text-red-650" />
                      <span>99% 전동 부스트 가속!</span>
                    </>
                  )}
                  {player.powerup.type === 'giant_foam' && (
                    <>
                      <Maximize className="w-3 h-3 text-[#1a1a1a]" />
                      <span>스펀지 자이언트 거대화!</span>
                    </>
                  )}
                  {player.powerup.type === 'lightning_shield' && (
                    <>
                      <ShieldCheck className="w-3 h-3 text-blue-600" />
                      <span>무료배송 패스 실드!</span>
                    </>
                  )}
                </div>
              )}

              {/* Status flags */}
              <div className="flex gap-1.5 mt-2">
                {player.isFinished && (
                  <span className="text-[8px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 border border-emerald-500 font-bold uppercase tracking-tight animate-pulse">
                    🏁 완주 완료! ({player.finishTime ? `${(player.finishTime / 1000).toFixed(2)}s` : ''})
                  </span>
                )}
                {player.isDead && (
                  <span className="text-[8px] bg-red-100 text-red-800 px-1.5 py-0.5 border border-red-500 font-bold uppercase tracking-tight">
                    💀 쇼핑 오버 (파산)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
