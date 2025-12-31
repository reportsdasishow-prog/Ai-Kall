
import React, { useEffect, useState } from 'react';

export const VoiceIndicator: React.FC<{ isRecording: boolean }> = ({ isRecording }) => {
  const [bars, setBars] = useState<number[]>([10, 20, 15, 25, 10]);

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setBars(prev => prev.map(() => Math.floor(Math.random() * 30) + 5));
      }, 100);
    } else {
      setBars([10, 10, 10, 10, 10]);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  return (
    <div className="flex items-center justify-center gap-1 h-8">
      {bars.map((height, i) => (
        <div
          key={i}
          className={`w-1 rounded-full transition-all duration-100 ${
            isRecording ? 'bg-indigo-500' : 'bg-slate-300'
          }`}
          style={{ height: `${height}px` }}
        />
      ))}
    </div>
  );
};
