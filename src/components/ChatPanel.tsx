import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare } from 'lucide-react';

interface ChatMessage {
  senderName: string;
  text: string;
  color: string;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  senderName: string;
}

export default function ChatPanel({ messages, onSendMessage, senderName }: ChatPanelProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <div className="flex flex-col h-full bg-white border-4 border-brutal-black shadow-[6px_6px_0px_#1a1a1a] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-neon-yellow border-b-4 border-brutal-black flex items-center gap-2 text-brutal-black select-none">
        <MessageSquare className="w-4 h-4 text-brutal-black animate-pulse" />
        <span className="font-display font-black text-xs tracking-tight uppercase text-brutal-black">
          특가 대기실 실시간 대화
        </span>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scroll text-sm bg-yellow-50/10">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs p-6 text-center italic font-bold">
            대화가 없습니다. 상대방을 자극하거나 <br /> 쇼핑 노하우를 공유해 보세요!
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className="flex flex-col text-xs leading-relaxed">
              <span className="font-black mb-1" style={{ color: msg.color }}>
                {msg.senderName} 
              </span>
              <span className="text-brutal-black bg-white px-2.5 py-1.5 border-2 border-brutal-black shadow-[2px_2px_0px_rgba(0,0,0,1)] inline-block self-start max-w-full break-words font-black">
                {msg.text}
              </span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Tray */}
      <form onSubmit={handleSubmit} className="p-3 bg-white border-t-4 border-brutal-black flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="메시지를 입력하세요..."
          className="flex-1 bg-white border-3 border-brutal-black text-xs font-black focus:bg-yellow-100 rounded-none px-3 outline-none text-brutal-black placeholder-zinc-400"
        />
        <button
          type="submit"
          id="chat-send-btn"
          className="p-2.5 bg-temu-orange text-white border-3 border-brutal-black shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer flex items-center justify-center"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </form>
    </div>
  );
}
