let lastBroadcast = '';

export default function broadcast({ message, language, channel }) {
  const segmenter = new Intl.Segmenter(language, { granularity: 'sentence' });
  const iterator = segmenter.segment(message);
  const segments = Array.from(iterator);
  const lastSentence = segments[segments.length - 1].segment;
  if (lastSentence === lastBroadcast) return;
  console.log('broadcast', { message: lastSentence, language });
  channel.send({
    type: 'broadcast',
    event: 'transcript',
    payload: { message: lastSentence, language },
  });
  lastBroadcast = lastSentence;
}
