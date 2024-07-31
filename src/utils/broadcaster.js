function getLastFullSentence(message) {
  // Regular expression to match sentences ending with '.', '!', or '?'
  const sentenceRegex = /[^.!?]+[.!?]+/g;
  const sentences = message.match(sentenceRegex);

  // Return the last sentence if found, otherwise return an empty string
  return sentences ? sentences[sentences.length - 1].trim() : '';
}

let lastBroadcast = '';

export default function broadcast({ message, language, channel }) {
  // TDOD: better chinese handling as there's no punctuaction.
  const lastSentence =
    language === 'zh' ? message : getLastFullSentence(message);
  if (lastSentence === lastBroadcast) return;
  console.log('broadcast', { message: lastSentence, language });
  channel.send({
    type: 'broadcast',
    event: 'transcript',
    payload: { message: lastSentence, language },
  });
  lastBroadcast = lastSentence;
}
