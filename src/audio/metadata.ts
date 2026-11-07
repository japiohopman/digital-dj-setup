/**
 * Structured metadata extracted locally from an audio file.
 */
export interface AudioMetadata {
  /** Track title, or fallback to cleaned filename. */
  title: string;
  /** Artist name, if present. */
  artist: string | null;
  /** Album name, if present. */
  album: string | null;
  /** Local object URL pointing to embedded cover artwork Blob, if present. */
  artworkUrl: string | null;
}

/**
 * Strips file extension and replaces common separators for clean display fallback.
 */
export function formatFilenameFallback(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, '');
  return withoutExt.replace(/[_-]+/g, ' ').trim();
}

/**
 * Parses ID3v2 tags from an MP3 ArrayBuffer.
 */
function parseID3v2(view: DataView): Partial<AudioMetadata> {
  const result: Partial<AudioMetadata> = {};
  if (view.byteLength < 10) return result;

  // Check for 'ID3' header
  if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) {
    return result;
  }

  const versionMajor = view.getUint8(3); // e.g. 3 for ID3v2.3, 4 for ID3v2.4
  const tagSize =
    ((view.getUint8(6) & 0x7f) << 21) |
    ((view.getUint8(7) & 0x7f) << 14) |
    ((view.getUint8(8) & 0x7f) << 7) |
    (view.getUint8(9) & 0x7f);

  const maxOffset = Math.min(view.byteLength, 10 + tagSize);
  let offset = 10;

  const decoder = new TextDecoder('utf-8');
  const latin1Decoder = new TextDecoder('iso-8859-1');

  while (offset + 10 <= maxOffset) {
    let frameId = '';
    for (let i = 0; i < 4; i++) {
      const charCode = view.getUint8(offset + i);
      if (charCode === 0) break;
      frameId += String.fromCharCode(charCode);
    }

    if (frameId.length < 4) break;

    const frameSize =
      versionMajor === 4
        ? ((view.getUint8(offset + 4) & 0x7f) << 21) |
          ((view.getUint8(offset + 5) & 0x7f) << 14) |
          ((view.getUint8(offset + 6) & 0x7f) << 7) |
          (view.getUint8(offset + 7) & 0x7f)
        : view.getUint32(offset + 4);

    const frameDataOffset = offset + 10;
    if (frameSize <= 0 || frameDataOffset + frameSize > maxOffset) {
      break;
    }

    const frameBytes = new Uint8Array(view.buffer, view.byteOffset + frameDataOffset, frameSize);

    if (frameId === 'TIT2' || frameId === 'TPE1' || frameId === 'TALB') {
      const encoding = frameBytes[0];
      const textBytes = frameBytes.subarray(1);
      const text = (encoding === 0 ? latin1Decoder : decoder).decode(textBytes).replace(/\0+$/, '');
      if (frameId === 'TIT2') result.title = text;
      if (frameId === 'TPE1') result.artist = text;
      if (frameId === 'TALB') result.album = text;
    } else if (frameId === 'APIC') {
      // APIC frame structure:
      // Text encoding (1 byte)
      // MIME type (null-terminated string)
      // Picture type (1 byte)
      // Description (null-terminated string)
      // Picture data
      let p = 1;
      let mime = '';
      while (p < frameBytes.length && frameBytes[p] !== 0) {
        mime += String.fromCharCode(frameBytes[p] ?? 0);
        p++;
      }
      p++; // Skip null terminator
      if (p < frameBytes.length) {
        p++; // Skip picture type (1 byte)
        // Skip description string until null terminator
        while (p < frameBytes.length && frameBytes[p] !== 0) {
          p++;
        }
        p++; // Skip null terminator
        if (p < frameBytes.length) {
          const picData = frameBytes.subarray(p);
          const mimeType = mime || 'image/jpeg';
          try {
            const copy = new Uint8Array(picData.length);
            copy.set(picData);
            const blob = new Blob([copy.buffer as ArrayBuffer], { type: mimeType });
            result.artworkUrl = URL.createObjectURL(blob);
          } catch {
            // Ignore blob creation error in unsupported mock environments
          }
        }
      }
    }

    offset += 10 + frameSize;
  }

  return result;
}

/**
 * Extracts metadata and embedded cover art from an audio file locally.
 */
export async function parseAudioMetadata(file: File): Promise<AudioMetadata> {
  const fallbackTitle = formatFilenameFallback(file.name);
  const metadata: AudioMetadata = {
    title: fallbackTitle,
    artist: null,
    album: null,
    artworkUrl: null,
  };

  try {
    // Read the first 256KB to inspect tags (sufficient for most ID3v2 headers and embedded art)
    const sliceSize = Math.min(file.size, 512 * 1024);
    const slice = file.slice(0, sliceSize);
    const arrayBuffer = await slice.arrayBuffer();
    const view = new DataView(arrayBuffer);

    const parsed = parseID3v2(view);
    if (parsed.title) metadata.title = parsed.title;
    if (parsed.artist) metadata.artist = parsed.artist;
    if (parsed.album) metadata.album = parsed.album;
    if (parsed.artworkUrl) metadata.artworkUrl = parsed.artworkUrl;
  } catch {
    // Gracefully retain fallback title if metadata parsing fails
  }

  return metadata;
}
