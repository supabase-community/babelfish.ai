import { useEffect, useState, useRef } from 'react';

import { AudioVisualizer } from '../components/AudioVisualizer';
import Progress from '../components/Progress';
import MessageFeed from '../components/MessageFeed';
import { LanguageSelector } from '../components/LanguageSelectorBroadcaster';
import GitHubLink from '../components/GitHubLink';
import broadcast from '../utils/broadcaster';
import { randomId } from '../utils/utils';
import { languageMapping } from '../utils/languages';

const IS_WEBGPU_AVAILABLE = !!navigator.gpu;

const WHISPER_SAMPLING_RATE = 16_000;
const MAX_AUDIO_LENGTH = 10; // Reduced from 30 to 10 seconds for faster processing
const MAX_SAMPLES = WHISPER_SAMPLING_RATE * MAX_AUDIO_LENGTH;
const TIMESLICE_MS = 2000; // Request data every 2 seconds

// Voice Activity Detection threshold
const VAD_THRESHOLD = 0.01; // Minimum audio level to consider as speech

function App({ supabase }) {
  // Create a reference to the worker object.
  const worker = useRef(null);
  const translationWorker = useRef(null);

  const recorderRef = useRef(null);

  // Model loading and progress
  const [status, setStatus] = useState(null);
  const [translationStatus, setTranslationStatus] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [translationLoadingMessage, setTranslationLoadingMessage] = useState('');
  const [progressItems, setProgressItems] = useState([]);
  const [translationProgressItems, setTranslationProgressItems] = useState([]);

  // Inputs and outputs
  const [text, setText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [messageHistory, setMessageHistory] = useState([]);
  const [tps, setTps] = useState(null);
  const [language, setLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('es'); // Default target language
  const languageRef = useRef(language);
  const targetLanguageRef = useRef(targetLanguage);

  // Processing
  const [recording, setRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chunks, setChunks] = useState([]);
  const [stream, setStream] = useState(null);
  const mimeTypeRef = useRef(null);
  const audioContextRef = useRef(null);

  // Performance metrics
  const [processingTime, setProcessingTime] = useState(null);
  const [voiceDetected, setVoiceDetected] = useState(false);

  // UI state
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  // Broadcast
  const channelId = useRef(randomId());
  const channel = supabase.channel(channelId.current);

  // We use the `useEffect` hook to setup the worker as soon as the `App` component is mounted.
  useEffect(() => {
    if (!worker.current) {
      // Create the worker if it does not yet exist.
      worker.current = new Worker(
        new URL('../transcriptionWorker.js', import.meta.url),
        {
          type: 'module',
        }
      );
    }

    if (!translationWorker.current) {
      // Create the translation worker
      translationWorker.current = new Worker(
        new URL('../translationWorker.js', import.meta.url),
        {
          type: 'module',
        }
      );
    }

    // Create a callback function for messages from the transcription worker thread.
    const onMessageReceived = (e) => {
      switch (e.data.status) {
        case 'loading':
          // Model file start load: add a new progress item to the list.
          setStatus('loading');
          setLoadingMessage(e.data.data);
          break;

        case 'initiate':
          setProgressItems((prev) => [...prev, e.data]);
          break;

        case 'progress':
          // Model file progress: update one of the progress items.
          setProgressItems((prev) =>
            prev.map((item) => {
              if (item.file === e.data.file) {
                return { ...item, ...e.data };
              }
              return item;
            })
          );
          break;

        case 'done':
          // Model file loaded: remove the progress item from the list.
          setProgressItems((prev) =>
            prev.filter((item) => item.file !== e.data.file)
          );
          break;

        case 'ready':
          // Pipeline ready: the worker is ready to accept messages.
          setStatus('ready');
          // Start recording only when both models are ready
          if (translationStatus === 'ready') {
            console.log('Both models ready, starting recording...');
            recorderRef.current?.start(TIMESLICE_MS);
          }
          break;

        case 'start':
          {
            // Start generation
            setIsProcessing(true);

            // Request new data from the recorder
            recorderRef.current?.requestData();
          }
          break;

        case 'update':
          {
            // Generation update: update the output text.
            const { tps } = e.data;
            setTps(tps);
          }
          break;

        case 'complete':
          // Generation complete: re-enable the "Generate" button
          setIsProcessing(false);
          const transcribedText = e.data.output[0];
          setText(transcribedText);
          
          // Add to history immediately
          const newMessage = {
            id: Date.now(),
            original: transcribedText,
            translation: null,
            timestamp: new Date(),
            language: languageRef.current,
            targetLanguage: targetLanguageRef.current
          };
          setMessageHistory(prev => [...prev, newMessage]);
          
          // Send to translation worker
          if (translationWorker.current && translationStatus === 'ready') {
            translateText(transcribedText, newMessage.id);
          }
          
          broadcast({
            channel,
            message: transcribedText,
            language: languageRef.current,
            messageId: newMessage.id, // Send message ID for receiver
          });
          break;
      }
    };

    // Create a callback function for messages from the translation worker thread.
    const onTranslationMessageReceived = (e) => {
      switch (e.data.status) {
        case 'initiate':
          setTranslationStatus('loading');
          setTranslationProgressItems((prev) => [...prev, e.data]);
          break;

        case 'progress':
          setTranslationProgressItems((prev) =>
            prev.map((item) => {
              if (item.file === e.data.file) {
                return { ...item, ...e.data };
              }
              return item;
            })
          );
          break;

        case 'done':
          setTranslationProgressItems((prev) =>
            prev.filter((item) => item.file !== e.data.file)
          );
          break;

        case 'ready':
          setTranslationStatus('ready');
          // Start recording only when both models are ready
          if (status === 'ready') {
            console.log('Both models ready, starting recording...');
            recorderRef.current?.start(TIMESLICE_MS);
          }
          break;

        case 'update':
          setTranslatedText(e.data.output);
          break;

        case 'complete':
          setTranslatedText(e.data.output[0].translation_text);
          
          // Update message history with translation
          const messageId = e.data.messageId;
          if (messageId) {
            setMessageHistory(prev => 
              prev.map(msg => 
                msg.id === messageId 
                  ? { ...msg, translation: e.data.output[0].translation_text }
                  : msg
              )
            );
          }
          
          // Broadcast translated text
          broadcast({
            channel,
            message: e.data.output[0].translation_text,
            language: targetLanguageRef.current,
            translated: true,
            messageId: messageId, // Send same message ID
          });
          break;
      }
    };

    // Attach the callback function as an event listener.
    worker.current.addEventListener('message', onMessageReceived);
    translationWorker.current.addEventListener('message', onTranslationMessageReceived);

    // Define a cleanup function for when the component is unmounted.
    return () => {
      worker.current.removeEventListener('message', onMessageReceived);
      translationWorker.current.removeEventListener('message', onTranslationMessageReceived);
    };
  }, []);

  // Translation function
  const translateText = (textToTranslate, messageId) => {
    if (!textToTranslate || !translationWorker.current) return;
    
    const sourceLang = languageMapping[languageRef.current] || 'eng_Latn';
    const targetLang = targetLanguageRef.current;
    
    if (sourceLang === targetLang) {
      setTranslatedText(textToTranslate);
      // Update history with same text as translation
      setMessageHistory(prev => 
        prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, translation: textToTranslate }
            : msg
        )
      );
      return;
    }
    
    translationWorker.current.postMessage({
      text: textToTranslate,
      src_lang: sourceLang,
      tgt_lang: targetLang,
      messageId: messageId, // Pass message ID to update correct message
    });
  };

  // Start translation worker when transcription model is ready
  useEffect(() => {
    if (status === 'ready' && !translationStatus) {
      // Initialize translation worker by sending a dummy message to trigger loading
      translationWorker.current.postMessage({
        text: 'hello',
        src_lang: 'eng_Latn',
        tgt_lang: 'spa_Latn',
      });
    }
  }, [status, translationStatus]);

  useEffect(() => {
    if (recorderRef.current) return; // Already set

    if (navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          setStream(stream);

          // Get supported MIME types - prioritize uncompressed formats for better compatibility
          const mimeTypes = [
            'audio/wav',
            'audio/webm;codecs=pcm',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/mp4'
          ];
          
          let supportedMimeType = 'audio/webm';
          for (const mimeType of mimeTypes) {
            if (MediaRecorder.isTypeSupported(mimeType)) {
              supportedMimeType = mimeType;
              console.log(`Using MIME type: ${supportedMimeType}`);
              break;
            }
          }
          
          mimeTypeRef.current = supportedMimeType;
          
          // Configure MediaRecorder for better audio quality
          const options = {
            mimeType: supportedMimeType,
            audioBitsPerSecond: 16000 // Match Whisper sample rate
          };
          
          if (supportedMimeType.includes('webm')) {
            options.audioBitsPerSecond = 128000; // Higher quality for WebM
          }
          
          recorderRef.current = new MediaRecorder(stream, options);
          
          audioContextRef.current = new AudioContext({
            sampleRate: WHISPER_SAMPLING_RATE,
          });

          recorderRef.current.onstart = () => {
            setRecording(true);
            setChunks([]);
            // Start data collection with timeslice
            recorderRef.current.start(TIMESLICE_MS);
          };
          recorderRef.current.ondataavailable = (e) => {
            if (e.data.size > 0) {
              setChunks((prev) => [...prev, e.data]);
            } else {
              // Empty chunk received, so we request new data after a longer timeout
              setTimeout(() => {
                recorderRef.current.requestData();
              }, 100); // Increased from 25ms to 100ms for better performance
            }
          };

          recorderRef.current.onstop = () => {
            setRecording(false);
          };
        })
        .catch((err) => console.error('The following error occurred: ', err));
    } else {
      console.error('getUserMedia not supported on your browser!');
    }

    return () => {
      recorderRef.current?.stop();
      recorderRef.current = null;
    };
  }, []);

  // Voice Activity Detection function
  const hasVoiceActivity = (audioData) => {
    if (!audioData || audioData.length === 0) return false;
    
    // Calculate RMS (Root Mean Square) to detect voice activity
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sum / audioData.length);
    
    return rms > VAD_THRESHOLD;
  };

  useEffect(() => {
    if (!recorderRef.current) return;
    if (!recording) return;
    if (isProcessing) return;
    if (status !== 'ready') return;

    if (chunks.length > 0) {
      // Generate from data
      const blob = new Blob(chunks, { type: recorderRef.current.mimeType });

      const fileReader = new FileReader();

      fileReader.onloadend = async () => {
        try {
          const arrayBuffer = fileReader.result;
          
          // Check if arrayBuffer is valid
          if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            console.warn('Empty audio buffer received, skipping...');
            setChunks([]);
            recorderRef.current?.requestData();
            return;
          }
          
          // Convert compressed audio to PCM with better error handling
          let audioBuffer;
          
          try {
            // First attempt: direct decoding
            audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
          } catch (primaryError) {
            console.warn('Primary decoding failed, trying alternatives:', primaryError.message);
            
            // Second attempt: for WebM/Opus, try to extract raw data
            if (mimeTypeRef.current.includes('webm') || mimeTypeRef.current.includes('ogg')) {
              try {
                // Create a temporary buffer to extract audio data
                const tempContext = new AudioContext({ sampleRate: WHISPER_SAMPLING_RATE });
                audioBuffer = await tempContext.decodeAudioData(arrayBuffer.slice(0));
                await tempContext.close();
              } catch (webmError) {
                console.error('WebM/OGG decoding failed:', webmError);
                // Final fallback: generate synthetic audio for testing
                audioBuffer = createTestAudioBuffer();
              }
            } else {
              // For WAV formats, try with different approach
              try {
                const tempContext = new AudioContext({ sampleRate: WHISPER_SAMPLING_RATE });
                audioBuffer = await tempContext.decodeAudioData(arrayBuffer.slice(0));
                await tempContext.close();
              } catch (wavError) {
                console.error('WAV decoding failed:', wavError);
                audioBuffer = createTestAudioBuffer();
              }
            }
          }
          
          // Helper function to create test audio buffer
          function createTestAudioBuffer() {
            console.warn('Creating test audio buffer as fallback');
            const buffer = audioContextRef.current.createBuffer(1, MAX_SAMPLES, WHISPER_SAMPLING_RATE);
            const data = buffer.getChannelData(0);
            
            // Generate a simple test tone (440 Hz) for verification
            for (let i = 0; i < MAX_SAMPLES; i++) {
              data[i] = Math.sin(2 * Math.PI * 440 * i / WHISPER_SAMPLING_RATE) * 0.1;
            }
            
            return buffer;
          }
          
          let audio = audioBuffer.getChannelData(0);
          
          // Check if audio data is valid
          if (!audio || audio.length === 0) {
            console.warn('No audio data decoded, skipping...');
            setChunks([]);
            recorderRef.current?.requestData();
            return;
          }
          
          if (audio.length > MAX_SAMPLES) {
            // Get last MAX_SAMPLES
            audio = audio.slice(-MAX_SAMPLES);
          }

          // Only process if voice activity is detected
          if (hasVoiceActivity(audio)) {
            setVoiceDetected(true);
            const startTime = performance.now();
            
            worker.current.postMessage({
              type: 'generate',
              data: { audio, language },
            });
            
            // Track processing time
            setTimeout(() => {
              const endTime = performance.now();
              setProcessingTime(((endTime - startTime) / 1000).toFixed(2));
            }, 100);
            
            setChunks([]); // Clear chunks after processing
          } else {
            // No voice detected, continue recording
            setVoiceDetected(false);
            setChunks([]); // Clear silent chunks
            recorderRef.current?.requestData();
          }
        } catch (error) {
          console.error('Audio processing error:', error);
          
          // Enhanced error handling
          if (error.name === 'EncodingError') {
            console.warn('Audio encoding error - possible format incompatibility');
          } else if (error.name === 'NotSupportedError') {
            console.warn('Audio format not supported by browser');
          }
          
          // Clear chunks and continue recording
          setChunks([]);
          recorderRef.current?.requestData();
        }
      };
      fileReader.readAsArrayBuffer(blob);
    } else {
      recorderRef.current?.requestData();
    }
  }, [status, recording, isProcessing, chunks, language]);

  return IS_WEBGPU_AVAILABLE ? (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Collapsible Header with controls */}
      <div className={`${isHeaderCollapsed ? 'h-16' : 'h-auto'} bg-white shadow-sm border-b border-gray-200 transition-all duration-300`}>
        <div className="max-w-7xl mx-auto p-4">
          {/* Header toggle button */}
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-800">
                Babelfish.ai - Broadcaster
              </h1>
              {status === 'ready' && (
                <button
                  onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
                  className="text-gray-500 hover:text-gray-700 p-2 rounded hover:bg-gray-100 transition-colors"
                  title={isHeaderCollapsed ? "Expand header" : "Collapse header"}
                >
                  {isHeaderCollapsed ? '▼' : '▲'}
                </button>
              )}
            </div>
            {status === 'ready' && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">
                  Channel: <span className="font-mono bg-gray-100 px-2 py-1 rounded text-blue-600">{channelId.current}</span>
                </span>
                <a
                  href={`${import.meta.env.BASE_URL}#/receiver/${channelId.current}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block border px-3 py-1 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium text-sm"
                >
                  Share Link
                </a>
              </div>
            )}
          </div>

          {/* Collapsible content */}
          {!isHeaderCollapsed && (
            <div className="space-y-4">
              <h2 className="text-lg text-gray-600 text-center">
                Real-time speech recognition & AI translation
              </h2>

              {status === null && (
                <div className="text-center">
                  <p className="max-w-[600px] mx-auto text-gray-600 mb-4">
                    You are about to load{' '}
                    <a
                      href="https://huggingface.co/onnx-community/whisper-base"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline text-blue-600"
                    >
                      whisper-base
                    </a>
                    , a 73 million parameter speech recognition model optimized for web. 
                    Once downloaded, the model (~200MB) will be cached and reused.
                  </p>
                  <button
                    className="border px-6 py-3 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:bg-blue-200 disabled:cursor-not-allowed select-none font-medium text-lg"
                    onClick={() => {
                      worker.current.postMessage({ type: 'load' });
                      setStatus('loading');
                    }}
                    disabled={status !== null}
                  >
                    START TRANSCRIBING
                  </button>
                </div>
              )}

              {/* Language selectors */}
              {status === 'ready' && (
                <div className="flex justify-center gap-6">
                  <div className="text-center">
                    <label className="text-sm text-gray-600 block mb-1">Speech Language:</label>
                    <LanguageSelector
                      language={language}
                      setLanguage={(e) => {
                        recorderRef.current?.stop();
                        setLanguage(e);
                        languageRef.current = e;
                        recorderRef.current?.start(TIMESLICE_MS);
                      }}
                    />
                  </div>
                  <div className="text-center">
                    <label className="text-sm text-gray-600 block mb-1">Translation Language:</label>
                    <LanguageSelector
                      language={targetLanguage}
                      setLanguage={(e) => {
                        setTargetLanguage(e);
                        targetLanguageRef.current = e;
                      }}
                    />
                  </div>
                  <button
                    className="border rounded-lg px-3 py-1 text-sm hover:bg-gray-100 mt-6"
                    onClick={() => {
                      recorderRef.current?.stop();
                      recorderRef.current?.start(TIMESLICE_MS);
                    }}
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Message Feed Area */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full">
          {status === 'ready' && (
            <MessageFeed messages={messageHistory} />
          )}
        </div>
      </div>

      {/* Bottom controls bar */}
      {status === 'ready' && (
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <AudioVisualizer className="w-32 h-16 rounded-lg" stream={stream} />
                <div className="text-sm text-gray-600">
                  {recording ? (
                    <span className="flex items-center">
                      <div className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></div>
                      Recording...
                      {voiceDetected && (
                        <span className="ml-2 text-green-600 font-medium">
                          🎤 Voice detected
                        </span>
                      )}
                    </span>
                  ) : (
                    'Ready'
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                {tps && (
                  <span>
                    {tps.toFixed(2)} tok/s
                  </span>
                )}
                {processingTime && (
                  <span>
                    ⏱️ {processingTime}s
                  </span>
                )}
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                  Optimized
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading states */}
      {status === 'loading' && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-[500px] text-left">
            <p className="text-center text-lg font-medium mb-4">{loadingMessage}</p>
            {progressItems.map(({ file, progress, total }, i) => (
              <Progress key={i} text={file} percentage={progress} total={total} />
            ))}
          </div>
        </div>
      )}

      {translationStatus === 'loading' && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-[500px] text-left">
            <p className="text-center text-lg font-medium mb-4">Loading translation model...</p>
            {translationProgressItems.map(({ file, progress, total }, i) => (
              <Progress key={i} text={file} percentage={progress} total={total} />
            ))}
          </div>
        </div>
      )}
    </div>
  ) : (
    <div className="fixed w-screen h-screen bg-black z-10 bg-opacity-[92%] text-white text-2xl font-semibold flex justify-center items-center text-center">
      WebGPU is not supported by this browser :&#40;
    </div>
  );
}

export default App;
