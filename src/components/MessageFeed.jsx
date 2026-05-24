import React, { useRef, useEffect } from 'react';

export default function MessageFeed({ messages }) {
  const feedRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (!messages || messages.length === 0) {
    return (
      <div className="w-full h-full border-2 border-gray-300 rounded-xl p-6 bg-white shadow-lg">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="text-6xl mb-4">🎤</div>
            <p className="text-xl text-gray-600 font-medium">Start speaking to see real-time transcription and translation</p>
            <p className="text-sm text-gray-400 mt-2">Your conversation will appear here</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={feedRef}
      className="w-full h-full border-2 border-gray-300 rounded-xl p-6 bg-white shadow-lg overflow-y-auto scrollbar-thin"
    >
      <div className="space-y-4">
        {messages.map((message, index) => (
          <div 
            key={message.id} 
            className={`bg-gray-50 rounded-xl p-6 border-2 ${
              index === messages.length - 1 
                ? 'border-blue-400 shadow-md bg-blue-50' 
                : 'border-gray-200'
            }`}
          >
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-gray-500 font-medium">
                {formatTime(message.timestamp)}
              </span>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-blue-500 text-white text-sm font-medium rounded-full">
                  {message.language?.toUpperCase() || 'Original'}
                </span>
                {message.targetLanguage && (
                  <span className="px-3 py-1 bg-green-500 text-white text-sm font-medium rounded-full">
                    {message.targetLanguage?.split('_')[0]?.toUpperCase() || 'Translation'}
                  </span>
                )}
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <span className="text-sm font-semibold text-gray-700 block mb-2">Original:</span>
                <p className="text-lg text-gray-900 leading-relaxed">{message.original}</p>
              </div>
              
              {message.translation && (
                <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
                  <span className="text-sm font-semibold text-green-700 block mb-2">Translation:</span>
                  <p className="text-lg text-gray-900 leading-relaxed">{message.translation}</p>
                </div>
              )}
              
              {!message.translation && (
                <div className="bg-gray-100 rounded-lg p-4 border border-gray-300">
                  <span className="text-sm font-semibold text-gray-500 block mb-2">Translation:</span>
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                    <p className="text-lg text-gray-400 italic">Translating...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
