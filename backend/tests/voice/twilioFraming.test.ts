import { describe, it, expect } from 'vitest';
import {
  decodeInboundMedia,
  encodeOutboundMedia,
  encodeMark,
} from '../../src/voice/twilioFraming.js';

describe('twilioFraming', () => {
  it('decodifica payload base64 a Buffer', () => {
    const ev = {
      event: 'media' as const,
      media: { payload: Buffer.from('hello').toString('base64') },
    };
    const buf = decodeInboundMedia(ev);
    expect(buf?.toString()).toBe('hello');
  });

  it('encode arma frame para Twilio', () => {
    const frame = encodeOutboundMedia('SID', Buffer.from([1, 2, 3]));
    expect(frame.event).toBe('media');
    expect(frame.streamSid).toBe('SID');
    expect(Buffer.from(frame.media.payload, 'base64')).toEqual(
      Buffer.from([1, 2, 3]),
    );
  });

  it('encodeMark genera mark', () => {
    const m = encodeMark('SID', 'flushed');
    expect(m).toEqual({ event: 'mark', streamSid: 'SID', mark: { name: 'flushed' } });
  });
});
