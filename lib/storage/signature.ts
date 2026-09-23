import "server-only";

import { getSupabaseStorageClient } from "@/lib/storage/supabase";
import { env } from "@/lib/env";

// Mirrors lib/storage/logo.ts exactly — same bucket (no separate
// "business-signatures" bucket; one public bucket, prefixed filenames),
// same size/type limits, same timestamped-not-upserted path so a stale
// cached copy never lingers after a replace.
const MAX_SIGNATURE_BYTES = 5 * 1024 * 1024; // 5MB
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

  // Signatures need to be publicly readable too — they render in
  // generated PDFs and the unauthenticated public share view, same as
  // the logo (see lib/storage/logo.ts's own comment).
  const { error } = await supabase.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: MAX_SIGNATURE_BYTES,
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

export async function uploadBusinessSignature(
  businessId: string,
  file: File,
): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Signature must be a PNG, JPEG, WebP, or SVG image.");
  }
  if (file.size > MAX_SIGNATURE_BYTES) {
    throw new Error("Signature must be smaller than 5MB.");
  }

  const bucket = env.SUPABASE_STORAGE_BUCKET;
  await ensureBucketExists(bucket);

  const supabase = getSupabaseStorageClient();
  const extension = file.name.split(".").pop() || "png";
  const path = `${businessId}/signature-${Date.now()}.${extension}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
  });
  if (error) {
    throw new Error(`Failed to upload signature: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// Best-effort, same rationale as deleteBusinessLogoAtUrl.
export async function deleteBusinessSignatureAtUrl(
  signatureUrl: string,
): Promise<void> {
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = signatureUrl.indexOf(marker);
  if (index === -1) return;

  const path = signatureUrl.slice(index + marker.length);
  const supabase = getSupabaseStorageClient();
  await supabase.storage.from(bucket).remove([path]);
}
