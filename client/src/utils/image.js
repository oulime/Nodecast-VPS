export function resolveImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  
  if (trimmed.startsWith('/') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  // Insecure HTTP URLs (like http://51.158.145.100/picons/...) are blocked by browsers; route through server image proxy
  if (trimmed.startsWith('http://')) {
    return `/api/proxy/image?url=${encodeURIComponent(trimmed)}`;
  }

  return trimmed;
}
