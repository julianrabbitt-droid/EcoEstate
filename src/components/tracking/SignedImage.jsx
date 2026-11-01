import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Renders a private uploaded file by resolving a short-lived signed URL.
export default function SignedImage({ uri, className, alt = '' }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!uri) return undefined;
    base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 })
      .then((r) => alive && setUrl(r.signed_url))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uri]);

  if (!url) return <div className={`${className} bg-secondary/60`} />;
  return <img src={url} alt={alt} className={className} />;
}
