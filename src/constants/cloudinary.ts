// Cloudinary requires every chunk except the last to be strictly larger
// than 5MB — kept a little above that floor for safety margin.
export const CLOUDINARY_MIN_CHUNK_SIZE = 6 * 1024 * 1024;
