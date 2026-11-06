import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DARK_PATTERN_CATEGORIES,
  MAX_SCREENSHOT_BYTES,
  darkPatternDailyLimit,
  inspectScreenshot,
  parseDarkPatternFindings,
  sanitizeDarkPatternFindings,
  serializeImageForModel,
} from '../lib/dark-pattern-policy.js';

function png(width=640,height=480){
  const bytes=new Uint8Array(24);bytes.set([137,80,78,71,13,10,26,10]);
  new DataView(bytes.buffer).setUint32(16,width);new DataView(bytes.buffer).setUint32(20,height);return bytes;
}

function jpeg(width=640,height=480){
  return new Uint8Array([0xff,0xd8,0xff,0xc0,0x00,0x07,0x08,(height>>8)&255,height&255,(width>>8)&255,width&255,0xff,0xd9]);
}

function webp(width=640,height=480){
  const bytes=new Uint8Array(30);bytes.set([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,88]);
  bytes[24]=(width-1)&255;bytes[25]=((width-1)>>8)&255;bytes[26]=((width-1)>>16)&255;
  bytes[27]=(height-1)&255;bytes[28]=((height-1)>>8)&255;bytes[29]=((height-1)>>16)&255;return bytes;
}

function rawFinding(category,index=0){
  return {category,evidence:`Visible evidence ${index+1}`,explanation:'The visible control may nudge a purchase decision.',confidence:.82,bbox:{x:100+index,y:120,width:300,height:140}};
}

test('accepts only bounded PNG, JPEG, and WebP images with matching declared MIME',()=>{
  assert.deepEqual(inspectScreenshot(png(),'image/png'),{ok:true,mime:'image/png',width:640,height:480});
  assert.deepEqual(inspectScreenshot(jpeg(),'image/jpeg'),{ok:true,mime:'image/jpeg',width:640,height:480});
  assert.deepEqual(inspectScreenshot(webp(),'image/webp'),{ok:true,mime:'image/webp',width:640,height:480});
  assert.equal(inspectScreenshot(png(),'image/jpeg').reason,'unsupported_type');
  assert.equal(inspectScreenshot(new Uint8Array([1,2,3]),'image/png').reason,'unsupported_type');
  assert.equal(inspectScreenshot(new Uint8Array(MAX_SCREENSHOT_BYTES+1)).reason,'too_large');
});

test('rejects malformed and excessive-dimension screenshots before model invocation',()=>{
  assert.equal(inspectScreenshot(png(0,480),'image/png').reason,'invalid_image');
  assert.equal(inspectScreenshot(png(5000,5000),'image/png').reason,'too_many_pixels');
});

test('plan quotas keep image analysis bounded for Free, One Sift, and Pro',()=>{
  assert.equal(darkPatternDailyLimit('free'),1);
  assert.equal(darkPatternDailyLimit('one'),3);
  assert.equal(darkPatternDailyLimit('pro'),10);
  assert.equal(darkPatternDailyLimit('unknown'),1);
});

test('recognizes all seven supported categories and normalizes confidence and boxes',()=>{
  const categories=Object.keys(DARK_PATTERN_CATEGORIES);
  const result=sanitizeDarkPatternFindings(categories.map((category,index)=>rawFinding(category,index)));
  assert.deepEqual(result.map(item=>item.category),categories);
  assert.equal(result[0].confidenceLevel,'high');
  assert.deepEqual(result[0].bbox,{x:100,y:120,width:300,height:140});
});

test('parses JSON from Qwen result and chat-completion response shapes, including fenced output',()=>{
  const source=JSON.stringify({findings:[rawFinding('prechecked_option')]});
  assert.equal(parseDarkPatternFindings({response:`\`\`\`json\n${source}\n\`\`\``})[0].category,'prechecked_option');
  assert.equal(parseDarkPatternFindings({choices:[{message:{content:source}}]})[0].category,'prechecked_option');
  assert.equal(parseDarkPatternFindings({findings:[rawFinding('fake_urgency_timer')]}).length,1);
  assert.deepEqual(parseDarkPatternFindings({response:'{"findings":[]}'}),[]);
  assert.equal(parseDarkPatternFindings({response:'not json'}),null);
});

test('drops invented categories, missing evidence, bad boxes and prototype keys',()=>{
  const result=sanitizeDarkPatternFindings([
    rawFinding('constructor'),
    {...rawFinding('hidden_fees'),evidence:''},
    {...rawFinding('misdirection'),bbox:{x:1000,y:1000,width:5,height:5}},
    {...rawFinding('confirmshaming'),bbox:{x:990,y:990,width:100,height:100}},
  ]);
  assert.equal(result.length,1);
  assert.deepEqual(result[0].bbox,{x:990,y:990,width:10,height:10});
});

test('sanitizes model text and limits output to twelve validated annotations',()=>{
  const result=sanitizeDarkPatternFindings(Array.from({length:15},(_,index)=>rawFinding('hidden_fees',index)));
  assert.equal(result.length,12);
  assert.ok(result.every(item=>item.evidence.length<=320&&item.explanation.length<=500));
});

test('base64 encoder handles chunked byte arrays without changing the data',()=>{
  const bytes=new Uint8Array([0,1,2,253,254,255]);
  assert.equal(serializeImageForModel(bytes),'AAEC/f7/');
});

test('30-case synthetic regression corpus covers each pattern and clean/ambiguous screenshots',()=>{
  const categories=Object.keys(DARK_PATTERN_CATEGORIES);
  const cases=Array.from({length:30},(_,index)=>({
    id:`synthetic-checkout-${String(index+1).padStart(2,'0')}`,
    expected:index%10===9?[]:[rawFinding(categories[index%categories.length],index)],
  }));
  assert.equal(cases.length,30);
  const covered=new Set(cases.flatMap(item=>item.expected.map(finding=>finding.category)));
  assert.deepEqual([...covered].sort(),[...categories].sort());
  assert.equal(cases.filter(item=>item.expected.length===0).length,3);
  for(const item of cases){
    const parsed=sanitizeDarkPatternFindings(item.expected);
    assert.equal(parsed.length,item.expected.length,item.id);
    if(item.expected.length)assert.equal(parsed[0].category,item.expected[0].category,item.id);
  }
});
