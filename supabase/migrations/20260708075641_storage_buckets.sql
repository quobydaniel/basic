-- Public read
CREATE POLICY "Public can view product-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-media');

CREATE POLICY "Public can view store-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'store-assets');

-- Sellers write to their store folder (first path segment = store id owned by user)
CREATE POLICY "Store owners upload product-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-media'
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid())
  );

CREATE POLICY "Store owners update product-media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-media'
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid())
  );

CREATE POLICY "Store owners delete product-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-media'
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid())
  );

CREATE POLICY "Store owners upload store-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store-assets'
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid())
  );

CREATE POLICY "Store owners update store-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'store-assets'
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid())
  );

CREATE POLICY "Store owners delete store-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'store-assets'
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid())
  );
