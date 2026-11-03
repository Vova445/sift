import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  OG_IMAGE,
  ROBOTS_CONFIG,
  SITE_URL,
  SITEMAP_ROUTES,
  STRUCTURED_DATA,
  absoluteSiteUrl,
  pageMetadata,
  serializeStructuredData,
} from '../lib/seo.ts';

test('SEO metadata resolves canonical, Open Graph and Twitter URLs against production origin',()=>{
  const metadata=pageMetadata('/terms','Умови користування — Sift','Правила Sift.');
  assert.equal(SITE_URL,'https://sift-app.reviewradar-vova445.workers.dev');
  assert.equal(metadata.alternates.canonical,'/terms');
  assert.equal(metadata.openGraph.url,'/terms');
  assert.equal(metadata.openGraph.images[0].url,OG_IMAGE);
  assert.equal(metadata.openGraph.images[0].width,1200);
  assert.equal(metadata.openGraph.images[0].height,630);
  assert.equal(metadata.twitter.card,'summary_large_image');
  assert.equal(absoluteSiteUrl('/sitemap.xml'),`${SITE_URL}/sitemap.xml`);
});

test('sitemap contains only public, canonical marketing and policy routes',()=>{
  const urls=SITEMAP_ROUTES.map(({path})=>absoluteSiteUrl(path));
  assert.deepEqual(urls,[
    `${SITE_URL}/`,
    `${SITE_URL}/legal`,
    `${SITE_URL}/privacy`,
    `${SITE_URL}/terms`,
    `${SITE_URL}/refund`,
  ]);
  assert.equal(new Set(urls).size,urls.length);
  assert.ok(urls.every((url)=>url.startsWith('https://')));
  assert.ok(!urls.some((url)=>/dashboard|api|reset-password|forgot-password/.test(url)));
});

test('robots allows public pages, blocks private APIs and advertises the sitemap',()=>{
  assert.equal(ROBOTS_CONFIG.rules.userAgent,'*');
  assert.equal(ROBOTS_CONFIG.rules.allow,'/');
  assert.deepEqual(ROBOTS_CONFIG.rules.disallow,['/api/','/health']);
  assert.equal(ROBOTS_CONFIG.sitemap,`${SITE_URL}/sitemap.xml`);
});

test('JSON-LD is valid JSON and describes the site and operator without invented ratings',()=>{
  const data=JSON.parse(serializeStructuredData());
  assert.deepEqual(data,STRUCTURED_DATA);
  assert.equal(data['@context'],'https://schema.org');
  const graph=data['@graph'];
  assert.ok(graph.some((node)=>node['@type']==='Organization'&&node.name==='AVEIron'));
  assert.ok(graph.some((node)=>node['@type']==='WebSite'&&node.name==='Sift'&&node.inLanguage==='uk-UA'));
  assert.ok(graph.every((node)=>!Object.hasOwn(node,'aggregateRating')));
  assert.ok(graph.every((node)=>!Object.hasOwn(node,'review')));
  assert.equal(graph.find((node)=>node['@type']==='Organization').logo.width,512);
});

test('Open Graph and organization images have their declared pixel dimensions',async()=>{
  const og=await readFile(new URL('../public/og-image.png',import.meta.url));
  const logo=await readFile(new URL('../public/sift-logo.png',import.meta.url));
  assert.equal(og.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(og.readUInt32BE(16),1200);
  assert.equal(og.readUInt32BE(20),630);
  assert.equal(logo.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(logo.readUInt32BE(16),512);
  assert.equal(logo.readUInt32BE(20),512);
});
