// Re-encodes a photo in the browser before upload so none of its metadata —
// EXIF (including GPS location), XMP, IPTC, embedded thumbnails — leaves the
// device. The pixels are redrawn upright (EXIF orientation applied) onto a
// canvas capped at MAX_SIDE px on the long side and saved as a fresh JPEG.
//
// If the browser can't decode the file (e.g. HEIC outside Safari):
//  - allowOriginal: true  → the original file is returned unchanged (only for
//    private photos, which other members never see);
//  - allowOriginal: false → throws UnsupportedImageError (for anything shown
//    to other members).

const MAX_SIDE = 2560;
const QUALITY = 0.88;
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif|tiff?)$/i;

export class UnsupportedImageError extends Error {
  constructor(name) {
    super(`Couldn’t read ${name || 'that photo'}. Please choose a JPEG or PNG image.`);
    this.name = 'UnsupportedImageError';
  }
}

const isImage = (file) => /^image\//.test(file?.type || '') || IMAGE_EXT.test(file?.name || '');

function decodeWithImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older browsers without createImageBitmap options: an <img> applies the
    // EXIF orientation itself.
    return decodeWithImageElement(file);
  }
}

function jpegName(name) {
  const base = String(name || 'photo').replace(/\.[^./\\]+$/, '') || 'photo';
  return `${base}.jpg`;
}

export async function stripImageMetadata(file, { allowOriginal = true } = {}) {
  if (!isImage(file)) {
    if (allowOriginal) return file;
    throw new UnsupportedImageError(file?.name);
  }
  let source;
  try {
    source = await decode(file);
    const w0 = source.width || source.naturalWidth;
    const h0 = source.height || source.naturalHeight;
    if (!w0 || !h0) throw new Error('empty image');
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    // JPEG has no transparency: put transparent PNG/WebP areas on white, not black.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) throw new Error('encode failed');
    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    if (allowOriginal) return file;
    throw new UnsupportedImageError(file?.name);
  } finally {
    source?.close?.();
  }
}
