import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_BUCKET = (process.env.SUPABASE_STORAGE_BUCKET || 'cad-uploads').trim();

let supabaseClient: SupabaseClient | null = null;
let bucketVerified = false;

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    return supabaseClient;
  } catch (err) {
    console.warn('Supabase client initialization skipped:', err);
    return null;
  }
}

async function ensureSupabaseBucket(client: SupabaseClient): Promise<void> {
  if (bucketVerified) return;
  try {
    const { data: buckets } = await client.storage.listBuckets();
    const exists = Array.isArray(buckets) && buckets.some((b) => b.name === SUPABASE_BUCKET);
    if (!exists) {
      await client.storage.createBucket(SUPABASE_BUCKET, {
        public: true,
        fileSizeLimit: 52428800, // 50 MB
      });
    }
    bucketVerified = true;
  } catch {
    // Ignore if using non-admin key without bucket creation permission
    bucketVerified = true;
  }
}

export async function uploadToSupabaseStorage(params: {
  storagePath: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ publicUrl: string; storagePath: string } | null> {
  const client = getSupabaseAdminClient();
  if (!client) return null;

  try {
    await ensureSupabaseBucket(client);
    const { error } = await client.storage
      .from(SUPABASE_BUCKET)
      .upload(params.storagePath, params.buffer, {
        contentType: params.mimeType,
        upsert: true,
        cacheControl: '31536000',
      });

    if (error) {
      console.warn('Supabase Storage upload fallback to PostgreSQL byte storage:', error.message);
      return null;
    }

    const { data } = client.storage.from(SUPABASE_BUCKET).getPublicUrl(params.storagePath);
    if (data?.publicUrl) {
      return {
        publicUrl: data.publicUrl,
        storagePath: params.storagePath,
      };
    }
    return null;
  } catch (err) {
    console.warn('Supabase Storage upload exception (falling back to PostgreSQL storage):', err);
    return null;
  }
}

export async function deleteFromSupabaseStorage(storagePaths: string[]): Promise<void> {
  const client = getSupabaseAdminClient();
  if (!client || storagePaths.length === 0) return;

  try {
    await client.storage.from(SUPABASE_BUCKET).remove(storagePaths);
  } catch (err) {
    console.warn('Supabase Storage remove warning:', err);
  }
}
