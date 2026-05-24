let lastBroadcast = '';

export default async function translate({
  translator,
  message,
  language,
  targetLanguage,
  setTranslation,
}) {
  const segmenter = new Intl.Segmenter(language, { granularity: 'sentence' });
  const iterator = segmenter.segment(message);
  const segments = Array.from(iterator);
  const lastSentence = segments[segments.length - 1].segment;
  if (lastSentence === lastBroadcast) return;
  console.log('broadcast', { message: lastSentence, language, targetLanguage });
  const translation = await translator.translate(lastSentence);
  setTranslation(translation);
  lastBroadcast = lastSentence;
}
