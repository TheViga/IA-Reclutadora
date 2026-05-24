export interface TwilioMediaSocket {
  readonly streamSid: string;
  onInboundAudio(cb: (mulaw: Buffer) => void): void;
  onClose(cb: () => void): void;
  sendOutboundAudio(mulaw: Buffer): void;
  sendMark(name: string): void;
  close(): void;
}
