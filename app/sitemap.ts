import type {MetadataRoute} from 'next';
import {absoluteSiteUrl,SEO_CONTENT_UPDATED_AT,SITEMAP_ROUTES} from '../lib/seo';
import {publicDomainProfiles} from '../lib/domain-index';

export const dynamic='force-dynamic';

export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  let domains:string[]=[];
  try{domains=(await publicDomainProfiles()).map(profile=>profile.domain)}catch{/* An unavailable D1 binding must not break the base sitemap. */}
  const staticItems=SITEMAP_ROUTES.map(route=>({
    url:absoluteSiteUrl(route.path),
    lastModified:new Date(SEO_CONTENT_UPDATED_AT),
    changeFrequency:route.changeFrequency,
    priority:route.priority,
  }));
  return[...staticItems,...domains.map(domain=>({url:absoluteSiteUrl(`/domains/${encodeURIComponent(domain)}`),lastModified:new Date(),changeFrequency:'weekly' as const,priority:0.6}))];
}
