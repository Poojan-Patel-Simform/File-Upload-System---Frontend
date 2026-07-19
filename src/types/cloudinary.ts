// Signing material returned by our backend's /uploads/cloudinary/init, read
// back off session.meta by the Cloudinary ChunkSender for every chunk POST.
export type CloudinarySigningMeta = {
  cloudName: string;
  apiKey: string;
  uploadUrl: string;
  uniqueUploadId: string;
  publicId: string;
  timestamp: number;
  signature: string;
};

export type CloudinaryAsset = {
  publicId: string;
  secureUrl: string;
  bytes: number;
  format: string;
  etag: string;
};

// Cloudinary's own response body for a chunk POST.
export type CloudinaryChunkUploadResult = {
  done: boolean;
  public_id?: string;
  secure_url?: string;
  bytes?: number;
  format?: string;
  etag?: string;
};
