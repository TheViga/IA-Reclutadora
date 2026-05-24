export type TwilioInboundMessage =
  | { event: 'connected' }
  | { event: 'start'; start: { streamSid: string; callSid: string } }
  | { event: 'media'; media: { payload: string } }
  | { event: 'mark'; mark: { name: string } }
  | { event: 'stop' };

export function decodeInboundMedia(msg: TwilioInboundMessage): Buffer | null {
  if (msg.event !== 'media') return null;
  return Buffer.from(msg.media.payload, 'base64');
}

export function encodeOutboundMedia(streamSid: string, mulaw: Buffer) {
  return {
    event: 'media',
    streamSid,
    media: { payload: mulaw.toString('base64') },
  };
}

export function encodeMark(streamSid: string, name: string) {
  return { event: 'mark', streamSid, mark: { name } };
}
