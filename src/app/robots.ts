import type { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dina-kalendar.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard/', '/admin/', '/ucenik/', '/api/'] },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
