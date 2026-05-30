import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Trash2, Zap, Shield, Gift, AlertTriangle } from 'lucide-react';

interface TemuWheelProps {
  isOpen: boolean;
  onSpinComplete: (itemType: string, title: string, desc: string) => void;
  onClose: () => void;
  isSpinningExternally?: boolean;
}

export const WHEEL_ITEMS = [
  { item: 'speed_shoes', title: '99% 전동 슈즈', desc: '초고속 스피드 부스터!', color: '#ff6600', icon: Zap },
  { item: 'giant_foam', title: '스펀지 킹 슈트', desc: '거인화! 벽돌 격파 가능', color: '#fb923c', icon: Sparkles },
  { item: 'lightning_shield', title: '무료배송 쉴드', desc: '1회 데미지 완전 방어', color: '#f97316', icon: Shield },
  { item: 'popup_attack', title: '악질 팝업 폭탄', desc: '상대방 화면에 팝업 테러', color: '#ef4444', icon: Trash2 },
  { item: 'coupon_rain', title: '쿠폰 소나기', desc: '즉시 쿠폰 카운트 +10', color: '#10b981', icon: Gift },
  { item: 'scam_box', title: '반품 박스 꽝', desc: '상상의 속도 제어 불능!', color: '#6b7280', icon: AlertTriangle },
];

export default function TemuWheel({ isOpen, onSpinComplete, onClose, isSpinningExternally = false }: TemuWheelProps) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<typeof WHEEL_ITEMS[number] | null>(null);

  const spinTheWheel = () => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);

    // Turn multiple full rounds + a random slice
    const bonusRounds = 5 + Math.floor(Math.random() * 5);
    const itemIndex = Math.floor(Math.random() * WHEEL_ITEMS.length);
    const degreePerItem = 360 / WHEEL_ITEMS.length;
    // Align target item in the top spinner position (270 degrees adjustment)
    const targetDeg = 360 * bonusRounds + (360 - itemIndex * degreePerItem);
    
    setRotation(targetDeg);

    setTimeout(() => {
      setSpinning(false);
      const chosen = WHEEL_ITEMS[itemIndex];
      setResult(chosen);
      onSpinComplete(chosen.item, chosen.title, chosen.desc);
    }, 4500); // 4.5 seconds spinning
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 h-full w-full">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="relative flex flex-col items-center max-w-md w-full bg-white border-8 border-brutal-black p-6 text-center text-brutal-black overflow-hidden shadow-[10px_10px_0px_rgba(0,0,0,1)]"
          >
            {/* Ambient flashing lights */}
            <div className="absolute inset-x-0 top-0 h-2.5 bg-brutal-black" />
            
            <h2 className="font-display text-2xl md:text-3xl font-black text-brutal-black uppercase tracking-tight mt-2 mb-1">
              🌟 회원 대박 무료 룰렛 🌟
            </h2>
            <p className="text-xs font-bold text-zinc-500 bg-zinc-100 border-2 border-brutal-black px-2 py-0.5 inline-block">
              남은 유효 시간: <span className="text-red-600 font-extrabold underline animate-pulse">00:49</span>초! 마감 임박 무료 슬롯
            </p>

            {/* The Wheel */}
            <div className="relative w-72 h-72 md:w-80 md:h-80 flex items-center justify-center mb-6">
              {/* Spinner Needle */}
              <div className="absolute top-0 z-20 w-8 h-10 flex flex-col items-center">
                <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[20px] border-t-brutal-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
                <div className="w-4 h-4 bg-temu-orange rounded-full border-2 border-brutal-black -mt-1" />
              </div>

              {/* Rotating Canvas Wheel */}
              <motion.div
                style={{ rotate: rotation }}
                animate={spinning ? { rotate: rotation } : undefined}
                transition={{ duration: 4.5, ease: [0.12, 0.8, 0.15, 1] }}
                className="w-full h-full rounded-full border-8 border-brutal-black bg-white overflow-hidden relative shadow-[4px_4px_0_#1a1a1a]"
              >
                {/* Visual Segments */}
                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                  {WHEEL_ITEMS.map((item, index) => {
                    const angle = 360 / WHEEL_ITEMS.length;
                    const startAngle = index * angle;
                    const endAngle = startAngle + angle;
                    const rad1 = (startAngle * Math.PI) / 180;
                    const rad2 = (endAngle * Math.PI) / 180;
                    const x1 = 50 + 50 * Math.cos(rad1);
                    const y1 = 50 + 50 * Math.sin(rad1);
                    const x2 = 50 + 50 * Math.cos(rad2);
                    const y2 = 50 + 50 * Math.sin(rad2);

                    return (
                      <g key={index}>
                        <path
                          d={`M50,50 L${x1},${y1} A50,50 0 0,1 ${x2},${y2} Z`}
                          fill={index % 2 === 0 ? '#ff6321' : '#faff14'}
                          stroke="#000"
                          strokeWidth="1"
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* Segment Text and Icons */}
                {WHEEL_ITEMS.map((item, index) => {
                  const angle = 360 / WHEEL_ITEMS.length;
                  const itemRotation = index * angle + angle / 2;
                  const IconComponent = item.icon;

                  return (
                    <div
                      key={index}
                      style={{
                        transform: `rotate(${itemRotation}deg) translateY(-85px)`,
                        transformOrigin: '50% 50%',
                      }}
                      className="absolute inset-0 flex flex-col items-center justify-start pt-6 text-[10px] md:text-xs font-black text-brutal-black drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]"
                    >
                      <IconComponent className="w-4 h-4 md:w-5 md:h-5 text-brutal-black mb-0.5" />
                      <span className="max-w-[50px] leading-tight text-center">{item.title.split(' ').join('\n')}</span>
                    </div>
                  );
                })}

                {/* Inner Ring Circle */}
                <div className="absolute inset-[38%] rounded-full bg-white border-6 border-brutal-black flex flex-col items-center justify-center">
                  <span className="text-[10px] font-black text-brutal-black tracking-tighter text-center leading-none">FREE</span>
                  <span className="text-[7px] text-zinc-500 font-extrabold font-mono">TEMU</span>
                </div>
              </motion.div>
            </div>

            {/* Control & Result display */}
            <AnimatePresence mode="wait">
              {!result ? (
                <button
                  type="button"
                  id="spin-trigger-btn"
                  onClick={spinTheWheel}
                  disabled={spinning || isSpinningExternally}
                  className="w-full py-4 bg-neon-yellow hover:bg-white text-brutal-black border-4 border-brutal-black font-black text-md cursor-pointer shadow-[4px_4px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#1a1a1a] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all select-none uppercase tracking-wide"
                >
                  {spinning ? '인생역전 보상 선별 중...' : '공짜 100% 당첨 룰렛 돌리기!'}
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center p-4 bg-yellow-50 border-4 border-brutal-black rounded-none w-full shadow-[4px_4px_0_#000]"
                >
                  <div className="flex items-center gap-2 mb-1.5 text-red-650">
                    {React.createElement(result.icon, { className: "w-5 h-5 animate-bounce" })}
                    <span className="font-black text-lg">{result.title}</span>
                  </div>
                  <p className="text-xs text-zinc-650 font-extrabold px-3 mb-4">{result.desc}</p>
                  
                  <button
                    type="button"
                    id="spin-close-btn"
                    onClick={onClose}
                    className="w-full py-2 bg-white hover:bg-zinc-50 text-brutal-black border-3 border-brutal-black text-xs font-black transition-all cursor-pointer shadow-[2px_2px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                  >
                    특가 적용하여 닫기 🛒
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
