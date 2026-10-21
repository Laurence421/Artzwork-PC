-- Pen test 2026-10-21: the bucket also accepted SVG and ICO files. SVG can carry scripts,
-- and the app only ever uploads JPG, PNG and WebP, so the bucket now accepts only those.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'store-assets';
