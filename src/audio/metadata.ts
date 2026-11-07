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
 *
 * @param filename - Base name of the file (e.g. "01-super_seal_break.mp3")
 * @returns Cleaned title string (e.g. "01 super seal break")
 */
export function formatFilenameFallback(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, '');
  return withoutExt.replace(/[_-]+/g, ' ').trim();
}

/**
 * Parses ID3v2 (ID3v2.3 and ID3v2.4) tags from a DataView buffer.
 * Supports Latin1 (ISO-8859-1), UTF-8, and UTF-16 text encodings for TIT2, TPE1, and TALB,
 * and extracts APIC embedded cover artwork.
 *
 * Note: Non-ID3 containers (pure WAV without ID3, FLAC Vorbis comments) fallback gracefully
 * to filename extraction.
 *
 * @param view - DataView of the audio file's initial bytes.
 * @returns Parsed metadata fields.
 */
export function parseID3v2(view: DataView): Partial<AudioMetadata> {
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
      let rawText: string;
      if (encoding === 0) {
        rawText = latin1Decoder.decode(textBytes);
      } else if (encoding === 1 || encoding === 2) {
        try {
          rawText = new TextDecoder(encoding === 2 ? 'utf-16be' : 'utf-16').decode(textBytes);
        } catch {
          rawText = decoder.decode(textBytes);
        }
      } else {
        rawText = decoder.decode(textBytes);
      }
      const text = rawText.replace(/\0+$/, '').trim();
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
 *
 * Inspects initial bytes for ID3v2 tags (TIT2, TPE1, TALB, and APIC cover images),
 * falling back gracefully to the cleaned filename if no tags are present or supported.
 *
 * @param file - The audio file selected or dropped onto the deck.
 * @returns Parsed AudioMetadata object with title, artist, album, and artwork Blob URL.
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
