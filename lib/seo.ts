import type {Metadata} from 'next';

export const SITE_URL='https://sift-app.reviewradar-vova445.workers.dev';
export const SITE_NAME='Sift';
export const OG_IMAGE='/og-image.png';
export const OG_IMAGE_ALT='Sift допомагає перевірити ціну, автопродовження та повернення перед оплатою.';
export const SEO_CONTENT_UPDATED_AT='2026-11-03T00:00:00.000Z';

export const SITEMAP_ROUTES=[
  {path:'/',changeFrequency:'weekly',priority:1},
  {path:'/legal',changeFrequency:'monthly',priority:0.6},
  {path:'/privacy',changeFrequency:'yearly',priority:0.4},
  {path:'/terms',changeFrequency:'yearly',priority:0.4},
  {path:'/refund',changeFrequency:'yearly',priority:0.4},
] as const;

export function absoluteSiteUrl(path=''){
  return new URL(path,`${SITE_URL}/`).toString();
}

export const ROBOTS_CONFIG={
  rules:{userAgent:'*',allow:'/',disallow:['/api/','/health']},
  sitemap:absoluteSiteUrl('/sitemap.xml'),
} as const;

export const STRUCTURED_DATA={
  '@context':'https://schema.org',
  '@graph':[
    {
      '@type':'Organization',
      '@id':absoluteSiteUrl('/#organization'),
      name:'AVEIron',
      alternateName:SITE_NAME,
      url:SITE_URL,
      email:'support@sift.app',
      brand:{'@type':'Brand',name:SITE_NAME},
      logo:{
        '@type':'ImageObject',
        url:absoluteSiteUrl('/sift-logo.png'),
        contentUrl:absoluteSiteUrl('/sift-logo.png'),
        width:512,
        height:512,
      },
    },
    {
      '@type':'WebSite',
      '@id':absoluteSiteUrl('/#website'),
      url:SITE_URL,
      name:SITE_NAME,
      alternateName:'Sift — know before you pay',
      description:'Перевірте ціну, автопродовження, повернення та умови скасування перед оплатою.',
      inLanguage:'uk-UA',
      publisher:{'@id':absoluteSiteUrl('/#organization')},
    },
  ],
} as const;

export function serializeStructuredData(){
  return JSON.stringify(STRUCTURED_DATA).replace(/</g,'\\u003c');
}

export function pageMetadata(path:string,title:string,description:string):Metadata{
  return{
    title,
    description,
    alternates:{canonical:path},
    openGraph:{
      type:'website',
      locale:'uk_UA',
      siteName:SITE_NAME,
      title,
      description,
      url:path,
      images:[{url:OG_IMAGE,width:1200,height:630,alt:OG_IMAGE_ALT}],
    },
    twitter:{
      card:'summary_large_image',
      title,
      description,
      images:[OG_IMAGE],
    },
  };
}
