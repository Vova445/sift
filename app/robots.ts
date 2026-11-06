import type {MetadataRoute} from 'next';
import {ROBOTS_CONFIG} from '../lib/seo';

export default function robots():MetadataRoute.Robots{
  return {
    rules:{
      userAgent:ROBOTS_CONFIG.rules.userAgent,
      allow:ROBOTS_CONFIG.rules.allow,
      disallow:[...ROBOTS_CONFIG.rules.disallow],
    },
    sitemap:ROBOTS_CONFIG.sitemap,
  };
}
