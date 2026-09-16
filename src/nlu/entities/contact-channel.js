import { bestPhraseMatch } from '../match.js';

const CHANNEL_PHRASES = [
  { id: 'phone', phrases: ['số điện thoại', 'điện thoại', 'sdt', 'gọi điện'] },
  { id: 'zalo', phrases: ['zalo'] },
  { id: 'whatsapp', phrases: ['whatsapp'] },
  { id: 'email', phrases: ['email'] },
  { id: 'maps', phrases: ['google maps', 'maps', 'bản đồ'] }
];

/**
 * Detect which contact channel the user is asking about.
 * @returns Array<{ id: 'phone'|'zalo'|'whatsapp'|'email'|'maps' }>
 */
export function extractContactChannels(tokens) {
  const matches = [];
  for (const channel of CHANNEL_PHRASES) {
    const hit = bestPhraseMatch(tokens, channel.phrases);
    if (hit) matches.push({ id: channel.id });
  }
  return matches;
}
