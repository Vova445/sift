import type {MetadataRoute} from 'next';
import {absoluteSiteUrl,SEO_CONTENT_UPDATED_AT,SITEMAP_ROUTES} from '../lib/seo';

export default function sitemap():MetadataRoute.Sitemap{
  return SITEMAP_ROUTES.map(route=>({
    url:absoluteSiteUrl(route.path),
    lastModified:new Date(SEO_CONTENT_UPDATED_AT),
    changeFrequency:route.changeFrequency,
    priority:route.priority,
  }));
}
