
import {
    AutoTokenizer,
    AutoProcessor,
    WhisperForConditionalGeneration,
} from '@xenova/transformers';


const MAX_NEW_TOKENS = 32; // Reduced from 64 for faster processing

/**
 * This class uses the Singleton pattern to ensure that only one instance of the model is loaded.
 */
class AutomaticSpeechRecognitionPipeline {
    static model_id = null;
    static tokenizer = null;
    static processor = null;
    static model = null;

    static async getInstance(progress_callback = null) {
        this.model_id = 'Xenova/whisper-tiny';

        try {
            // Load tokenizer and processor in parallel
            const [tokenizer, processor] = await Promise.all([
                AutoTokenizer.from_pretrained(this.model_id, {
                    progress_callback,
                }),
                AutoProcessor.from_pretrained(this.model_id, {
                    progress_callback,
                })
            ]);
            
            this.tokenizer = tokenizer;
            this.processor = processor;

            if (!this.model) {
                try {
                    console.log('Attempting to load model with WebGPU...');
                    this.model = await WhisperForConditionalGeneration.from_pretrained(this.model_id, {
                        dtype: {
                            encoder_model: 'fp32',
                            decoder_model_merged: 'q4',
                        },
                        device: 'webgpu',
                        progress_callback,
                        // Suppress warnings
                        quiet: true
                    });
                    console.log('Model loaded successfully with WebGPU');
                } catch (error) {
                    console.warn('WebGPU failed, falling back to WASM:', error.message);
                    this.model = await WhisperForConditionalGeneration.from_pretrained(this.model_id, {
                        dtype: {
                            encoder_model: 'fp32',
                            decoder_model_merged: 'q4',
                        },
                        device: 'wasm',
                        progress_callback,
                        quiet: true
                    });
                    console.log('Model loaded successfully with WASM fallback');
                }
            }
        } catch (error) {
            console.error('Failed to load tokenizer/processor:', error);
            throw error;
        }

        return this;
    }
}

let processing = false;
async function generate({ audio, language }) {
    if (processing) return;
    processing = true;

    // Tell the main thread we are starting
    self.postMessage({ status: 'start' });

    // Retrieve the text-generation pipeline.
    const pipeline = await AutomaticSpeechRecognitionPipeline.getInstance();

    const inputs = await pipeline.processor(audio);

    const outputs = await pipeline.model.generate(inputs.input_features, {
        max_new_tokens: MAX_NEW_TOKENS,
        language,
        // Optimized parameters for faster processing
        num_beams: 1, // Use greedy decoding instead of beam search
        temperature: 1.0, // Lower temperature for more deterministic output
        do_sample: false, // Disable sampling for faster processing
    });

    const outputText = pipeline.tokenizer.batch_decode(outputs, { skip_special_tokens: true });

    // Send the output back to the main thread
    self.postMessage({
        status: 'complete',
        output: outputText,
    });
    processing = false;
}

async function load() {
    self.postMessage({
        status: 'loading',
        data: 'Loading model...'
    });

    // Load the pipeline and save it for future use.
    const [tokenizer, processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance(x => {
        // We also add a progress callback to the pipeline so that we can
        // track model loading.
        self.postMessage(x);
    });

    self.postMessage({ status: 'ready' });
}
// Listen for messages from the main thread
self.addEventListener('message', async (e) => {
    const { type, data } = e.data;

    switch (type) {
        case 'load':
            load();
            break;

        case 'generate':
            generate(data);
            break;
    }
});
