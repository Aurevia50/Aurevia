INSERT INTO storage.buckets (id, name, public, file_size_limit, owner, owner_id, created_at, updated_at, avif_autodetection)
VALUES ('client-stories', 'client-stories', false, 5242880, NULL, NULL, NOW(), NOW(), false)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    updated_at = NOW();

CREATE POLICY aurevia_client_stories_block_client_access
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (bucket_id <> 'client-stories')
WITH CHECK (bucket_id <> 'client-stories');
