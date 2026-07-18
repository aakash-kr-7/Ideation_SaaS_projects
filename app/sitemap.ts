import { MetadataRoute } from 'next'
 
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://shouldbuild.app';
  
  return [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/sample-report`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    ...['/legal/terms', '/legal/privacy', '/legal/refunds', '/support'].map(path => ({
      url: `${baseUrl}${path}`,
      lastModified: new Date('2026-07-18'),
      changeFrequency: 'monthly' as const,
      priority: path === '/support' ? 0.5 : 0.4,
    })),
  ]
}
