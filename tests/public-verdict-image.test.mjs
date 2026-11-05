import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {publicVerdictImage} from '../lib/public-verdict-image.js';

const require=createRequire(import.meta.url);
const {ImageResponse}=require('../node_modules/next/dist/compiled/@vercel/og/index.node.js');

test('public verdict renderer produces a 1200x630 PNG with no report details',async()=>{
  const element=publicVerdictImage({score:72,decision:'wait'}),markup=JSON.stringify(element);
  assert.ok(markup.includes('72'));
  assert.equal(markup.includes('Private Service'),false);
  assert.equal(markup.includes('private.example'),false);
  const response=new ImageResponse(element,{width:1200,height:630});
  assert.equal(response.headers.get('content-type'),'image/png');
  const png=new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...png.slice(0,8)],[137,80,78,71,13,10,26,10]);
  const view=new DataView(png.buffer,png.byteOffset,png.byteLength);
  assert.equal(view.getUint32(16),1200);
  assert.equal(view.getUint32(20),630);
});
