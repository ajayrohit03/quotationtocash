import "server-only";

import { getSupabaseStorageClient } from "@/lib/storage/supabase";
import { env } from "@/lib/env";

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];

async function ensureBucketExists(bucket: string) {
  const supabase = getSupabaseStorageClient();
  const { data } = await supabase.storage.getBucket(bucket);
  if (data) return;

  // Logos need to be publicly readable — they render in generated PDFs
  // and the unauthenticated public share view (see Phase 8).
  const { error } = await supabase.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: MAX_LOGO_BYTES,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  });
  if (error) {
    // Lost a race to create it — fine as long as it exists now.
    const { data: retryData } = await supabase.storage.getBucket(bucket);
    if (!retryData) {
      throw new Error(
        `Failed to create storage bucket "${bucket}": ${error.message}`,
      );
    }
  }
}

export async function uploadBusinessLogo(
  businessId: string,
  file: File,
): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Logo must be a PNG, JPEG, WebP, or SVG image.");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("Logo must be smaller than 5MB.");
  }

  const bucket = env.SUPABASE_STORAGE_BUCKET;
  await ensureBucketExists(bucket);

  const supabase = getSupabaseStorageClient();
  const extension = file.name.split(".").pop() || "png";
  // Timestamped, not upserted at a fixed name, so a stale cached copy of
  // the old logo never lingers behind a CDN/browser cache after a change.
  const path = `${businessId}/logo-${Date.now()}.${extension}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
  });
  if (error) {
    throw new Error(`Failed to upload logo: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// Best-effort: if the URL isn't one of ours (or the object is already
// gone), this quietly does nothing rather than blocking the caller from
// clearing Business.logoUrl.
export async function deleteBusinessLogoAtUrl(logoUrl: string): Promise<void> {
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = logoUrl.indexOf(marker);
  if (index === -1) return;

  const path = logoUrl.slice(index + marker.length);
  const supabase = getSupabaseStorageClient();
  await supabase.storage.from(bucket).remove([path]);
}
