import { useEffect, useRef, useState } from 'react';
import LanguageSelector from '../components/LanguageSelectorReceiver';
import Progress from '../components/Progress';
import GitHubLink from '../components/GitHubLink';
import { LANGUAGES, languageMapping } from '../utils/languages';
import { useParams } from 'react-router-dom';

function App({ supabase }) {
  // Model loading
  const [ready, setReady] = useState(null);
  const disabled = useRef(false);
  const [progressItems, setProgressItems] = useState([]);

  // Inputs and outputs
  const [input, setInput] = useState('Hallo.');
  const inputRef = useRef(input);
  const [sourceLanguage, setSourceLanguage] = useState('deu_Latn');
  const sourceLanguageRef = useRef(sourceLanguage);
  const [targetLanguage, setTargetLanguage] = useState('eng_Latn');
  const targetLanguageRef = useRef(targetLanguage);
  const [output, setOutput] = useState('');

  // Broadcast
  const { channelId } = useParams();

  // Create a reference to the worker object.
  const worker = useRef(null);

  // We use the `useEffect` hook to setup the worker as soon as the `App` component is mounted.
  useEffect(() => {
    if (!worker.current) {
      // Create the worker if it does not yet exist.
      worker.current = new Worker(
        new URL('../translationWorker.js', import.meta.url),
        {
          type: 'module',
        }
      );
    }

    // Create a callback function for messages from the worker thread.
    const onMessageReceived = (e) => {
      switch (e.data.status) {
        case 'initiate':
          // Model file start load: add a new progress item to the list.
          setReady(false);
          setProgressItems((prev) => [...prev, e.data]);
          break;

        case 'progress':
          // Model file progress: update one of the progress items.
          setProgressItems((prev) =>
            prev.map((item) => {
              if (item.file === e.data.file) {
                return { ...item, progress: e.data.progress };
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
          setReady(true);
          break;

        case 'update':
          // Generation update: update the output text.
          setOutput(e.data.output);
          break;

        case 'complete':
          setOutput(e.data.output[0].translation_text);
          disabled.current = false;
          break;
      }
    };

    // Attach the callback function as an event listener.
    worker.current.addEventListener('message', onMessageReceived);

    // Define a cleanup function for when the component is unmounted.
    return () =>
      worker.current.removeEventListener('message', onMessageReceived);
  });

  const translate = () => {
    if (disabled.current) return;
    if (sourceLanguageRef.current === targetLanguageRef.current) {
      setOutput(inputRef.current);
      return;
    }
    disabled.current = true;
    console.log('Translating...');
    worker.current.postMessage({
      text: inputRef.current,
      src_lang: sourceLanguageRef.current,
      tgt_lang: targetLanguageRef.current,
    });
  };

  // Start on load
  useEffect(() => {
    translate();
    // Subscribe to Supabase realtime broadcast
    const channel = supabase.channel(channelId);
    channel
      .on('broadcast', { event: 'transcript' }, ({ payload }) => {
        setInput(payload.message);
        inputRef.current = payload.message;
        setSourceLanguage(languageMapping[payload.language]);
        sourceLanguageRef.current = languageMapping[payload.language];
        translate();
      })
      .subscribe();
  }, []);

  return (
    <div className="flex flex-col h-screen mx-auto justify-end text-gray-800 bg-white">
      <div className="h-full overflow-auto scrollbar-thin flex justify-center items-center flex-col relative">
        <GitHubLink url="https://github.com/supabase-community/babelfish.ai" />
        <div className="flex flex-col items-center mb-1 max-w-[400px] text-center">
          <h1 className="text-4xl font-bold mb-1">Babelfish.ai - Receiver</h1>
          <h2 className="text-xl font-semibold">
            Real-time in-browser speech recognition & decentralized in-browser
            AI translation.
          </h2>
        </div>

        <div className="w-[500px] p-2">
          <div className="relative">
            <h3 className="text-l font-semibold">
              Transcript:{' '}
              {
                Object.entries(LANGUAGES).find(
                  ([key, val]) => val === sourceLanguage
                )?.[0]
              }
            </h3>
          </div>

          <p className="w-full h-[80px] overflow-y-auto overflow-wrap-anywhere border rounded-lg p-2">
            {input}
          </p>

          <div className="textbox-container">
            <LanguageSelector
              type={'Target'}
              defaultLanguage={targetLanguage}
              onChange={(x) => {
                setTargetLanguage(x.target.value);
                targetLanguageRef.current = x.target.value;
              }}
            />
          </div>

          <p className="w-full h-[80px] overflow-y-auto overflow-wrap-anywhere border rounded-lg p-2">
            {output}
          </p>
        </div>

        <div className="progress-bars-container">
          {ready === false && <label>Loading models... (only run once)</label>}
          {progressItems.map((data) => (
            <div key={data.file}>
              <Progress text={data.file} percentage={data.progress} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
