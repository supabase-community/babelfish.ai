import { useEffect, useRef, useState } from 'react';
import MessageFeed from '../components/MessageFeed';
import GitHubLink from '../components/GitHubLink';
import { useParams } from 'react-router-dom';

function App({ supabase }) {
  // Message history
  const [messageHistory, setMessageHistory] = useState([]);

  // UI state
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  // Broadcast
  const { channelId } = useParams();

  // Subscribe to Supabase realtime broadcast
  useEffect(() => {
    const channel = supabase.channel(channelId);
    channel
      .on('broadcast', { event: 'transcript' }, ({ payload }) => {
        if (payload.translated) {
          // This is a translated message - update existing message by ID
          setMessageHistory(prev => 
            prev.map(msg => 
              msg.id === payload.messageId
                ? { ...msg, translation: payload.message }
                : msg
            )
          );
        } else {
          // This is an original transcript - add new message with broadcaster ID
          const newMessage = {
            id: payload.messageId, // Use ID from broadcaster
            original: payload.message,
            translation: null,
            timestamp: new Date(),
            language: payload.language,
            targetLanguage: null // Will be known when translation arrives
          };
          setMessageHistory(prev => [...prev, newMessage]);
        }
      })
      .subscribe();
  }, [channelId, supabase]);

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Collapsible Header */}
      <div className={`${isHeaderCollapsed ? 'h-16' : 'h-auto'} bg-white shadow-sm border-b border-gray-200 transition-all duration-300`}>
        <div className="max-w-7xl mx-auto p-4">
          {/* Header toggle button */}
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-800">
                Babelfish.ai - Receiver
              </h1>
              <button
                onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
                className="text-gray-500 hover:text-gray-700 p-2 rounded hover:bg-gray-100 transition-colors"
                title={isHeaderCollapsed ? "Expand header" : "Collapse header"}
              >
                {isHeaderCollapsed ? '▼' : '▲'}
              </button>
            </div>
            <div className="text-sm text-gray-500">
              Channel: <span className="font-mono bg-gray-100 px-2 py-1 rounded text-blue-600">{channelId}</span>
            </div>
          </div>

          {/* Collapsible content */}
          {!isHeaderCollapsed && (
            <div className="text-center">
              <h2 className="text-lg text-gray-600">
                Real-time speech recognition & AI translation
              </h2>
            </div>
          )}
        </div>
      </div>

      {/* Main Message Feed Area */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full">
          <MessageFeed messages={messageHistory} />
        </div>
      </div>
    </div>
  );
}

export default App;
