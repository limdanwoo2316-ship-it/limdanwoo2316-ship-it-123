import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, X, AlertOctagon, HelpCircle, CheckCircle } from 'lucide-react';

interface CouponPopupProps {
  isOpen: boolean;
  type: 'wheel' | 'survey' | 'deal' | 'click_bomb';
  onForceClose: () => void;
}

export default function CouponPopupRoom({ isOpen, type, onForceClose }: CouponPopupProps) {
  const [clicksCount, setClicksCount] = useState(0);
  const targetClicks = 10;
  const [surveyAnswer, setSurveyAnswer] = useState<string | null>(null);

  // Reset counters when opened
  useEffect(() => {
    if (isOpen) {
      setClicksCount(0);
      setSurveyAnswer(null);
    }
  }, [isOpen]);

  const handleBombClick = () => {
    if (clicksCount + 1 >= targetClicks) {
      onForceClose();
    } else {
      setClicksCount((prev) => prev + 1);
    }
  };

  const handleSurveySelect = (ans: string) => {
    setSurveyAnswer(ans);
    setTimeout(() => {
      onForceClose();
    }, 450);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 h-full w-full">
          {/* Main Popup Modal */}
          <motion.div
            initial={{ scale: 0.3, y: 100, rotate: -10, opacity: 0 }}
            animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.2, y: -200, opacity: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            className="relative max-w-sm w-full bg-white border-8 border-brutal-black p-6 text-brutal-black text-center shadow-[10px_10px_0px_#1a1a1a]"
          >
            {/* The Fake Little 'X' button that moves away, which is classic Temu/ad scam! */}
            <button
              type="button"
              id="fake-close-ad"
              onClick={() => {
                // Clicking this increments clicksCount immediately to make them click the main button
                setClicksCount((prev) => Math.max(prev + 1, 1));
              }}
              className="absolute top-2.5 right-2.5 bg-yellow-300 hover:bg-white text-brutal-black border-3 border-brutal-black p-1 transition-all cursor-pointer shadow-[2px_2px_0px_#000]"
            >
              <X className="w-4 h-4" />
            </button>

            {type === 'click_bomb' || clicksCount > 0 ? (
              // BOMB TYPE
              <div className="flex flex-col items-center">
                <AlertOctagon className="w-14 h-14 text-red-650 animate-bounce mb-3" />
                <h3 className="text-xl font-black tracking-tight text-brutal-black mb-2 leading-none">
                  ⚠️ [경고] 과부하 트래픽 감지! ⚠️
                </h3>
                <p className="text-xs text-zinc-650 font-extrabold px-4 mb-4">
                  무료 리워드 혜택 정보를 승인 보존하려면 <br />
                  <span className="text-white font-black bg-temu-orange border-2 border-brutal-black px-1.5 py-0.5 mx-0.5 inline-block uppercase animate-pulse">
                    닫기 버튼을 {targetClicks}번 타격하세요!
                  </span>
                </p>

                {/* Meter Progress */}
                <div className="w-full bg-zinc-200 border-4 border-brutal-black h-6 relative overflow-hidden mb-6">
                  <div
                    className="bg-neon-yellow h-full transition-all duration-100 ease-out border-r-4 border-brutal-black"
                    style={{ width: `${(clicksCount / targetClicks) * 100}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-brutal-black mix-blend-difference">
                    {clicksCount} / {targetClicks} 번 연타 완료
                  </div>
                </div>

                <button
                  type="button"
                  id="bomb-click-btn"
                  onClick={handleBombClick}
                  className="w-full py-4 bg-neon-yellow hover:bg-white text-brutal-black border-4 border-brutal-black font-black text-lg cursor-pointer shadow-[4px_4px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_#000] transition-all select-none"
                >
                  🔋 탈출 버튼 연타 박살!!!
                </button>
              </div>
            ) : type === 'survey' ? (
              // SURVEY TYPE
              <div className="flex flex-col items-center">
                <HelpCircle className="w-14 h-14 text-blue-600 animate-pulse mb-3" />
                <h3 className="text-xl font-black tracking-tight text-brutal-black mb-1.5 leading-none">
                  억만장자 설문 조사 💸
                </h3>
                <p className="text-xs text-zinc-500 font-bold mb-5 leading-normal">
                  설문에 응모하시면 게임 내 화면의 모든 화물 몬스터가 즉각 1초 간 전신 마비 상태가 됩니다!
                </p>

                <div className="flex flex-col gap-2.5 w-full mb-2">
                  {[
                    '테무 쇼핑 없이는 숨도 쉴 수 없다',
                    '내 용돈을 털어 0.1달러 드론을 살 것이다',
                    '무료 배송 슬라임에 파묻혀 잠들고 싶다',
                  ].map((ans, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSurveySelect(ans)}
                      className="px-4 py-3 bg-white hover:bg-yellow-50 text-left text-xs font-black text-brutal-black border-3 border-brutal-black shadow-[3px_3px_0px_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_#1a1a1a] transition-all cursor-pointer"
                    >
                      {idx + 1}. {ans}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              // DEAL TYPE (FLASHING MARKETING JOKE)
              <div className="flex flex-col items-center">
                <ShieldAlert className="w-14 h-14 text-temu-orange animate-spin-slow mb-3" />
                <h3 className="text-2xl font-black text-brutal-black mb-1 text-transparent bg-clip-text bg-gradient-to-r from-red-650 to-orange-655 uppercase tracking-wide">
                  🎉 당 첨 축 하 🎉
                </h3>
                <h4 className="text-sm font-black text-orange-600 mb-2 leading-none">
                  0.01$ 포터블 공중부양 초소형 드론!
                </h4>
                <p className="text-[10px] text-zinc-500 font-extrabold px-3 mb-5 leading-normal">
                  * 주의: 해당 스마트 기기는 99% 모조 종이 장난감이며 글로벌 벌크 특송 배송에 최대 120일 소요됩니다.
                </p>

                <button
                  type="button"
                  id="claim-deal-btn"
                  onClick={onForceClose}
                  className="w-full py-3.5 bg-neon-yellow hover:bg-white text-brutal-black border-4 border-brutal-black font-black text-xs cursor-pointer shadow-[4px_4px_0px_#000] transition-all mb-3.5"
                >
                  기쁜 마음으로 사은품 승인 🎁
                </button>
                <button
                  type="button"
                  id="decline-deal-btn"
                  onClick={() => {
                    // Changing style to force clicks
                    setClicksCount(1);
                  }}
                  className="text-xs text-red-650 hover:text-black hover:underline font-black transition-all"
                >
                  거절하고 무료 공짜 아이템 버리기
                </button>
              </div>
            )}
            
            {/* Coupon footers */}
            <div className="mt-5 border-t-2 border-dashed border-zinc-200 pt-3 text-[10px] text-zinc-500 font-black flex items-center justify-center gap-1.5">
              <span>✓ 쇼핑 공식 검증인 • 안전 배송 통과</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
