import { describe, expect, it } from 'vitest';
import { formatFilenameFallback, parseID3v2, parseAudioMetadata } from './metadata';

describe('formatFilenameFallback', () => {
  it('strips extensions and replaces underscores/hyphens with spaces', () => {
    expect(formatFilenameFallback('01_Grandmaster_Flash-The_Adventures.mp3')).toBe(
      '01 Grandmaster Flash The Adventures',
    );
    expect(formatFilenameFallback('scratch_break_battle.wav')).toBe('scratch break battle');
    expect(formatFilenameFallback('clean-filename.flac')).toBe('clean filename');
  });
});

describe('parseID3v2', () => {
  const createID3v23Buffer = (
    frames: Array<{ id: string; encoding: number; data: string | Uint8Array }>,
  ): DataView => {
    // Construct frame byte buffers
    const encodedFrames: Uint8Array[] = [];
    for (const frame of frames) {
      const idBytes = [
        frame.id.charCodeAt(0),
        frame.id.charCodeAt(1),
        frame.id.charCodeAt(2),
        frame.id.charCodeAt(3),
      ];

      let frameData: Uint8Array;
      if (typeof frame.data === 'string') {
        const textEncoder = new TextEncoder();
        const strBytes = textEncoder.encode(frame.data);
        frameData = new Uint8Array(1 + strBytes.length);
        frameData[0] = frame.encoding;
        frameData.set(strBytes, 1);
      } else {
        frameData = frame.data;
      }

      const frameSize = frameData.length;
      const header = new Uint8Array(10);
      header.set(idBytes, 0);
      // ID3v2.3 32-bit frame size (big endian)
      header[4] = (frameSize >> 24) & 0xff;
      header[5] = (frameSize >> 16) & 0xff;
      header[6] = (frameSize >> 8) & 0xff;
      header[7] = frameSize & 0xff;

      const fullFrame = new Uint8Array(10 + frameSize);
      fullFrame.set(header, 0);
      fullFrame.set(frameData, 10);
      encodedFrames.push(fullFrame);
    }

    const totalPayload = encodedFrames.reduce((acc, f) => acc + f.length, 0);
    const tagSize = totalPayload; // syncsafe in real tags, we encode syncsafe

    const tagHeader = new Uint8Array(10);
    tagHeader[0] = 0x49; // 'I'
    tagHeader[1] = 0x44; // 'D'
    tagHeader[2] = 0x33; // '3'
    tagHeader[3] = 0x03; // version 2.3
    tagHeader[4] = 0x00; // revision
    tagHeader[5] = 0x00; // flags

    // 4 syncsafe bytes
    tagHeader[6] = (tagSize >> 21) & 0x7f;
    tagHeader[7] = (tagSize >> 14) & 0x7f;
    tagHeader[8] = (tagSize >> 7) & 0x7f;
    tagHeader[9] = tagSize & 0x7f;

    const fullTag = new Uint8Array(10 + totalPayload);
    fullTag.set(tagHeader, 0);
    let offset = 10;
    for (const frame of encodedFrames) {
      fullTag.set(frame, offset);
      offset += frame.length;
    }

    return new DataView(fullTag.buffer);
  };

  it('correctly parses TIT2, TPE1, and TALB text frames with Latin1 and UTF-8', () => {
    const view = createID3v23Buffer([
      { id: 'TIT2', encoding: 0, data: 'The Payback' },
      { id: 'TPE1', encoding: 3, data: 'James Brown' },
      { id: 'TALB', encoding: 3, data: 'The Payback Album' },
    ]);

    const result = parseID3v2(view);
    expect(result.title).toBe('The Payback');
    expect(result.artist).toBe('James Brown');
    expect(result.album).toBe('The Payback Album');
  });

  it('extracts APIC cover artwork into a Blob URL', () => {
    // Construct APIC frame payload:
    // [encoding(0)] + "image/jpeg" + [0] + [picType(3)] + "Cover" + [0] + [fake Jpeg bytes 0xFF, 0xD8]
    const mime = new TextEncoder().encode('image/jpeg');
    const desc = new TextEncoder().encode('Cover');
    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    const apicPayload = new Uint8Array(1 + mime.length + 1 + 1 + desc.length + 1 + fakeJpeg.length);
    let p = 0;
    apicPayload[p++] = 0; // Latin1 encoding
    apicPayload.set(mime, p);
    p += mime.length;
    apicPayload[p++] = 0; // null terminator
    apicPayload[p++] = 3; // Cover front
    apicPayload.set(desc, p);
    p += desc.length;
    apicPayload[p++] = 0; // null terminator
    apicPayload.set(fakeJpeg, p);

    const view = createID3v23Buffer([
      { id: 'TIT2', encoding: 3, data: 'Battle Breaks' },
      { id: 'APIC', encoding: 0, data: apicPayload },
    ]);

    const result = parseID3v2(view);
    expect(result.title).toBe('Battle Breaks');
    expect(result.artworkUrl).toBeDefined();
    expect(typeof result.artworkUrl).toBe('string');
  });

  it('returns empty partial metadata for non-ID3 files without errors', () => {
    const emptyView = new DataView(new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer); // 'RIFF' header
    const result = parseID3v2(emptyView);
    expect(result).toEqual({});
  });

  it('parseAudioMetadata falls back to filename when no tags exist', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'my_favorite_scratch.wav', {
      type: 'audio/wav',
    });
    const meta = await parseAudioMetadata(file);

    expect(meta.title).toBe('my favorite scratch');
    expect(meta.artist).toBeNull();
    expect(meta.album).toBeNull();
    expect(meta.artworkUrl).toBeNull();
  });
});
