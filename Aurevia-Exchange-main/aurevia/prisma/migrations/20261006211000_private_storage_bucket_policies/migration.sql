DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (VALUES
            ('kyc-documents', 10485760::BIGINT),
            ('profile-avatars', 5242880::BIGINT),
            ('wallet-receipts', 10485760::BIGINT),
            ('support-attachments', 10485760::BIGINT)
        ) AS expected(id, file_size_limit)
        LEFT JOIN storage.buckets bucket ON bucket.id = expected.id
        WHERE bucket.id IS NULL
           OR bucket.public IS DISTINCT FROM FALSE
           OR bucket.file_size_limit IS DISTINCT FROM expected.file_size_limit
    ) THEN
        RAISE EXCEPTION 'Expected private Aurevia Storage buckets and configured size limits are required before applying policies.';
    END IF;
END $$;

CREATE POLICY aurevia_kyc_documents_block_client_access
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (bucket_id <> 'kyc-documents')
WITH CHECK (bucket_id <> 'kyc-documents');

CREATE POLICY aurevia_profile_avatars_block_client_access
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (bucket_id <> 'profile-avatars')
WITH CHECK (bucket_id <> 'profile-avatars');

CREATE POLICY aurevia_wallet_receipts_block_client_access
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (bucket_id <> 'wallet-receipts')
WITH CHECK (bucket_id <> 'wallet-receipts');

CREATE POLICY aurevia_support_attachments_block_client_access
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (bucket_id <> 'support-attachments')
WITH CHECK (bucket_id <> 'support-attachments');
