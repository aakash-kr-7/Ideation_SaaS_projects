import { MetadataRoute } from 'next'
 
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://signalfit.app';

  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/pricing', '/sample-report'],
      disallow: ['/dashboard', '/research/', '/compare/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
