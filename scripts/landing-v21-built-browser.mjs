import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium, expect} from '@playwright/test';
import {startVisualBuiltServer} from './test-visual-built.mjs';
import {resolvePlaywrightLaunchOptions} from './lib/playwright-chrome.mjs';

// A static loopback build and synthetic API only: no backend, dotenv, DB or credentials.
const require=createRequire(import.meta.url);
const widths=[320,360,375,390,412,430,768,1440];
const artifacts=path.resolve('artifacts/landing-v21-browser');
await fs.mkdir(artifacts,{recursive:true});
const server=await startVisualBuiltServer(path.resolve('dist-local/public'));
const browser=await chromium.launch(resolvePlaywrightLaunchOptions());
const checks=[];
const pass=value=>{checks.push(value);console.log(`PASS ${value}`);};
const failures=[];
const fixtureRoute=route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.origin!==server.origin){failures.push(`Off-origin ${url.origin}`);return route.abort();}
 if(url.pathname==='/api/health'&&request.method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'ok',ready:true})});
 if(url.pathname.startsWith('/api/'))return route.fulfill({status:url.pathname==='/api/me'?401:404,contentType:'application/json',body:JSON.stringify({ok:false,message:'Isolated landing fixture'})});
 if(!['GET','HEAD'].includes(request.method())){failures.push('Unexpected mutation');return route.abort();}
 return route.continue();
};
let page;
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.addInitScript(()=>{
   // Record the first committed app DOM so resource hints must start before
   // React asks for the lazy landing, rather than merely existing eventually.
   const observer=new MutationObserver(()=>{
    if(!document.getElementById('root')?.childElementCount)return;
    window.__landingFirstAppCommit=performance.now();
    observer.disconnect();
   });
   observer.observe(document,{childList:true,subtree:true});
   window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
   const theme=sessionStorage.getItem('landing-test-theme') || 'light';
   localStorage.setItem('theme',theme);
   const applyTheme=()=>{
    document.documentElement.classList.toggle('dark',theme==='dark');
    document.documentElement.dataset.theme=theme;
    document.documentElement.style.colorScheme=theme;
   };
   if(document.documentElement)applyTheme();
   document.addEventListener('DOMContentLoaded',applyTheme,{once:true});
   Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>Number(sessionStorage.getItem('landing-test-cores') || 8)});
   Object.defineProperty(navigator,'deviceMemory',{get:()=>8});
 });
 await context.route('**/*',fixtureRoute);
 await context.routeWebSocket('**/*',socket=>socket.close());
 page=await context.newPage();
 const assetRequests=[];
 page.on('request',request=>assetRequests.push(new URL(request.url()).pathname));
 page.on('pageerror',error=>failures.push(error.message));
 page.on('response',response=>{if(response.status()>=400&&!new URL(response.url()).pathname.startsWith('/api/'))failures.push(`Asset ${response.status()} ${new URL(response.url()).pathname}`);});
 await page.goto(server.origin+'/login');
 await expect(page.getByTestId('input-username')).toBeVisible();
 const landingPaths=await page.locator('meta[name="sqr-landing-script"], meta[name="sqr-landing-style"]').evaluateAll(elements=>elements.map(element=>element.content));
 assert.ok(landingPaths.some(asset=>asset.endsWith('.js'))&&landingPaths.some(asset=>asset.endsWith('.css')),'Built HTML must advertise emitted landing resources');
 // Shared helpers can legitimately be used by Login too; only the landing
 // component and its page stylesheet must stay out of the login request graph.
 const landingOnlyPaths=landingPaths.filter(asset=>/^\/assets\/Landing-/.test(asset));
 assert.ok(landingOnlyPaths.length>=2);
 assert.deepEqual(assetRequests.filter(asset=>landingOnlyPaths.includes(asset)),[],'Direct login must not download the public landing');
 const loginLandingHints=await page.locator('link[rel="modulepreload"], link[rel="preload"]').evaluateAll((elements,assets)=>elements.filter(element=>assets.includes(new URL(element.href).pathname)).map(element=>element.rel),landingOnlyPaths);
 assert.deepEqual(loginLandingHints,[],'Public login must not activate landing preload metadata');
 pass('direct login keeps landing scripts and styles out of its request graph');
 const loginBefore=await page.getByTestId('input-username').evaluate(el=>{const s=getComputedStyle(el);return {height:s.height,fontSize:s.fontSize,color:s.color,background:s.backgroundColor,border:s.borderRadius};});
 await page.goto(server.origin);
 await expect(page.locator('.sqr-landing h1')).toHaveText('Operational data, structuredfor faster decisions.');
 await expect(page.locator('#boot-shell')).toHaveCount(0);
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 const landingPreloads=await page.evaluate(()=>{
  const firstCommit=window.__landingFirstAppCommit;
  return [...document.querySelectorAll('meta[name="sqr-landing-script"], meta[name="sqr-landing-style"]')].map(meta=>{
   const url=new URL(meta.content,location.href).href;
   const isScript=meta.name==='sqr-landing-script';
   const hint=[...document.querySelectorAll(`link[rel="${isScript?'modulepreload':'preload'}"]`)].find(link=>link.href===url);
   const resources=performance.getEntriesByName(url,'resource');
   return {path:meta.content,isScript,rel:hint?.rel,as:hint?.as,crossOrigin:hint?.crossOrigin,firstCommit,startTime:resources[0]?.startTime,fetchCount:resources.length};
  });
 });
 for(const hint of landingPreloads){
  assert.match(hint.path,hint.isScript?/^\/assets\/[A-Za-z0-9_-]+\.js$/:/^\/assets\/[A-Za-z0-9_-]+\.css$/);
  assert.equal(hint.rel,hint.isScript?'modulepreload':'preload');
  if(!hint.isScript)assert.equal(hint.as,'style');
  assert.equal(hint.crossOrigin,'anonymous','Resource hint credentials must match Vite resource loading');
  assert.ok(Number.isFinite(hint.firstCommit)&&Number.isFinite(hint.startTime)&&hint.startTime<hint.firstCommit,`${hint.path}: landing preload must start before the first React commit`);
  assert.equal(hint.fetchCount,1,`${hint.path}: Vite must reuse its preloaded resource instead of fetching twice`);
  assert.equal((await context.request.get(server.origin+hint.path)).status(),200,'Preload metadata must name an emitted asset');
 }
 pass('anonymous root starts reusable landing resource hints before React rendering');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await expect(page.locator('.sqr-landing')).not.toHaveClass(/(?:low-spec|motion-paused)/);
 const firstFrameText=await page.locator('.sqr-landing .hero h1, .sqr-landing .hero > div > p').evaluateAll(elements=>elements.map(element=>{
  const animations=element.getAnimations();
  for(const animation of animations){animation.pause();animation.currentTime=0;}
  const style=getComputedStyle(element);
  const result={opacity:style.opacity,visibility:style.visibility,display:style.display,height:element.getBoundingClientRect().height};
  for(const animation of animations)animation.play();
  return result;
 }));
 assert.equal(firstFrameText.length,2);
 for(const text of firstFrameText){
  assert.equal(text.opacity,'1','Normal-motion hero copy must be visible at animation time zero');
  assert.notEqual(text.visibility,'hidden');assert.notEqual(text.display,'none');assert.ok(text.height>0);
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 pass('normal-motion hero heading and description paint without an entrance delay');
 const schema=await page.locator('#sqr-application-schema').textContent();
 assert.equal(JSON.parse(schema)['@type'],'SoftwareApplication');
 await expect(page).toHaveTitle('SQR — Sumbangan Query Rahmah');
 for(const selector of ['meta[property="og:image"]','link[rel="apple-touch-icon"]']){
  const asset=await page.locator(selector).getAttribute(selector.startsWith('meta')?'content':'href');
  const response=await context.request.get(server.origin+new URL(asset,server.origin).pathname);
  assert.equal(response.status(),200);
 }
 pass('approved public metadata and existing deployed assets');
 for(const width of widths){
  await page.setViewportSize({width,height:900});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.locator('#tab-overview').click();
  for(const name of ['overview','search','analysis']){
   await page.locator(`#tab-${name}`).click();
   await expect(page.locator(`#view-${name}`)).toBeVisible();
   assert.equal(await page.locator('.preview-view:visible').count(),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`No overflow ${width}/${name}`);
  }
  await page.locator('#tab-overview').click();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(artifacts,`landing-${width}.png`),fullPage:true,animations:'disabled'});
  pass(`layout and all preview tabs ${width}px`);
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#tab-overview').focus();
 await page.keyboard.press('ArrowRight');
 await expect(page.locator('#tab-search')).toBeFocused();
 await expect(page.locator('#tab-search')).toHaveAttribute('aria-selected','true');
 await page.keyboard.press('End');
 await expect(page.locator('#tab-analysis')).toBeFocused();
 await page.keyboard.press('Home');
 await expect(page.locator('#tab-overview')).toBeFocused();
 pass('roving tab keyboard navigation');
 const track=page.locator('#testimonial-track');
 await track.scrollIntoViewIfNeeded();
 await track.focus();
 await page.keyboard.press('End');
 await expect(page.locator('#testimonial-current')).toHaveText('5');
 await expect(page.locator('.testimonial-next')).toBeDisabled();
 await page.keyboard.press('Home');
 await expect(page.locator('#testimonial-current')).toHaveText('1');
 await page.locator('.testimonial-next').click();
 await expect(page.locator('#testimonial-current')).toHaveText('2');
 await page.getByRole('button',{name:'Comment 5',exact:true}).click();
 await expect(page.locator('#testimonial-current')).toHaveText('5');
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});
  await track.focus();await page.keyboard.press('End');
  await expect(page.locator('.testimonial-next')).toBeDisabled();
  await track.dispatchEvent('wheel');
  await track.evaluate(el=>el.scrollTo({left:0,behavior:'instant'}));
  await expect(page.locator('#testimonial-current')).toHaveText('1');
  for(const index of [2,3,4,5,4,3,2,1]){
   await page.getByRole('button',{name:`Comment ${index}`,exact:true}).click();
   await expect(page.locator('#testimonial-current')).toHaveText(String(index));
   await expect(page.getByRole('button',{name:`Comment ${index}`,exact:true})).toHaveAttribute('aria-current','true');
  }
 }
 pass('carousel buttons, keyboard, native scroll and end-of-track indicator');
 for(const id of ['features','security','about','product-preview']){
  await page.locator(`a[href="#${id}"]`).first().click();
  assert.equal(new URL(page.url()).hash,'#'+id);
  await expect.poll(()=>page.locator('#'+id).evaluate(el=>el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(70);
  const top=await page.locator('#'+id).evaluate(el=>el.getBoundingClientRect().top);
  assert(top<200,`${id} sticky-header offset ${top}`);
 }
 pass('internal anchors clear the sticky header');
 const axe=await fs.readFile(require.resolve('axe-core/axe.min.js'),'utf8');
 await page.addScriptTag({content:axe});
 const violations=await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})));
 assert.deepEqual(violations,[],'Landing WCAG violations');
 pass('WCAG accessibility scan');
 await page.locator('.nav-actions a[href="/login"]').click();
 await expect(page.getByTestId('input-username')).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('lang','ms');
 await expect(page.locator('#sqr-application-schema')).toHaveCount(0);
 const loginAfter=await page.getByTestId('input-username').evaluate(el=>{const s=getComputedStyle(el);return {height:s.height,fontSize:s.fontSize,color:s.color,background:s.backgroundColor,border:s.borderRadius};});
 assert.deepEqual(loginAfter,loginBefore,'No landing CSS leakage into login');
 await page.getByRole('button',{name:'Laman utama',exact:true}).click();
 await expect(page.locator('.sqr-landing')).toBeVisible();
 await expect(page.locator('#sqr-application-schema')).toHaveCount(1);
 pass('SPA login round-trip, language/schema cleanup and CSS isolation');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#product-preview').scrollIntoViewIfNeeded();
 await page.mouse.move(0,0);
 await page.locator('.nav-actions a[href="/login"]').focus();
 await expect(page.locator('#product-preview')).toHaveClass(/preview-running/);
 await page.locator('.preview-pause-toggle').click();
 await expect(page.locator('.preview-pause-toggle')).toHaveAttribute('aria-pressed','true');
 const pausedTab=await page.locator('[role="tab"][aria-selected="true"]').getAttribute('id');
 await page.mouse.move(0,0);
 await page.locator('.nav-actions a[href="/login"]').focus();
 await expect(page.locator('#product-preview')).toHaveClass(/is-idle/);
 await page.waitForTimeout(5800);
 await expect(page.locator(`#${pausedTab}`)).toHaveAttribute('aria-selected','true');
 await page.locator('.preview-pause-toggle').click();
 await page.mouse.move(0,0);await page.locator('.nav-actions a[href="/login"]').focus();
 const nextTab={"tab-overview":"tab-search","tab-search":"tab-analysis","tab-analysis":"tab-overview"}[pausedTab];
 await expect(page.locator(`#${nextTab}`)).toHaveAttribute('aria-selected','true',{timeout:10000});
 await page.locator('footer').scrollIntoViewIfNeeded();
 await expect(page.locator('#product-preview')).toHaveClass(/is-idle/);
 await page.locator('#product-preview').scrollIntoViewIfNeeded();
 await expect(page.locator('#product-preview')).toHaveClass(/preview-running/);
 await page.evaluate(()=>{
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await expect(page.locator('#product-preview')).toHaveClass(/is-idle/);
 await page.evaluate(()=>{
  delete document.hidden;
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await expect(page.locator('#product-preview')).toHaveClass(/preview-running/);
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(page.locator('#product-preview')).toHaveClass(/is-idle/);
 pass('persistent pause, automatic rotation, offscreen/visibility events and reduced-motion preference');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>sessionStorage.setItem('landing-test-cores','2'));
 await page.reload();
 await expect(page.locator('.sqr-landing')).toHaveClass(/low-spec/);
 await expect(page.locator('.sqr-landing h1')).toBeVisible();
 await expect(page.locator('.sqr-landing h1')).toHaveCSS('opacity','1');
 await page.locator('#tab-analysis').click();
 await expect(page.locator('#view-analysis')).toBeVisible();
 pass('low-spec content remains visible and interactive');
 await page.evaluate(()=>{
  sessionStorage.setItem('landing-test-cores','8');
  sessionStorage.setItem('landing-test-theme','dark');
  localStorage.setItem('perf_mode','low');
 });
 await page.reload();
 await expect(page.locator('html')).toHaveClass(/dark/);
 await expect(page.locator('.sqr-landing')).toHaveClass(/low-spec/);
 await expect(page.locator('.sqr-landing h1')).toHaveCSS('opacity','1');
 await expect(page.locator('.sqr-landing')).toHaveCSS('color-scheme','light');
 await page.locator('#tab-analysis').click();
 await expect(page.locator('#view-analysis')).toBeVisible();
 await page.screenshot({path:path.join(artifacts,'landing-saved-dark-low-spec.png'),fullPage:true,animations:'disabled'});
 pass('saved dark theme and explicit low-spec preference preserve the light landing');
 // Exercise actual script/style/Trusted Types restrictions separately from axe,
 // whose injected test script intentionally cannot run under a strict policy.
 const strictPage=await context.newPage();
 const cspViolations=[];
 strictPage.on('pageerror',error=>failures.push(error.message));
 await strictPage.exposeFunction('recordLandingCspViolation',value=>cspViolations.push(value));
 await strictPage.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{
  window.recordLandingCspViolation(`${event.effectiveDirective}: ${event.blockedURI}`);
 }));
 await strictPage.route('**/*',async route=>{
  if(route.request().resourceType()!=='document')return route.fallback();
  const response=await route.fetch();
  await route.fulfill({response,headers:{...response.headers(),
   'Content-Security-Policy':"default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-elem 'self'; style-src-attr 'none'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; trusted-types default sqr-ui dompurify; require-trusted-types-for 'script'"
  }});
 });
 await strictPage.goto(server.origin);
 await expect(strictPage.locator('.sqr-landing h1')).toBeVisible();
 await strictPage.locator('#tab-analysis').click();
 await expect(strictPage.locator('#view-analysis')).toBeVisible();
 await strictPage.locator('.nav-actions a[href="/login"]').click();
 await expect(strictPage.getByTestId('input-username')).toBeVisible();
 await strictPage.getByRole('button',{name:'Laman utama',exact:true}).click();
 await expect(strictPage.locator('#sqr-application-schema')).toHaveCount(1);
 assert.deepEqual(cspViolations,[],'Strict production-like CSP and Trusted Types');
 await strictPage.close();
 pass('strict script/style CSP and Trusted Types across preview and login round-trip');
 const touchContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
 await touchContext.route('**/*',fixtureRoute);
 await touchContext.routeWebSocket('**/*',socket=>socket.close());
 const touchPage=await touchContext.newPage();
 touchPage.on('pageerror',error=>failures.push(error.message));
 await touchPage.goto(server.origin);
 await expect(touchPage.locator('.sqr-landing')).toHaveClass(/touch-ui/);
 await touchPage.screenshot({path:path.join(artifacts,'landing-mobile-hero.png'),animations:'disabled'});
 await touchPage.locator('#tab-search').tap();
 await expect(touchPage.locator('#view-search')).toBeVisible();
 await touchPage.locator('#security').screenshot({path:path.join(artifacts,'landing-mobile-security.png'),animations:'disabled'});
 const touchTrack=touchPage.locator('#testimonial-track');
 await touchTrack.scrollIntoViewIfNeeded();
 const rect=await touchTrack.boundingBox();
 assert.ok(rect);
 const client=await touchContext.newCDPSession(touchPage);
 const y=Math.min(800,Math.max(60,rect.y+rect.height/2));
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width*.85,y}]});
 for(const part of [.7,.5,.3,.15])await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+rect.width*part,y}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>touchTrack.evaluate(el=>el.scrollLeft)).toBeGreaterThan(20);
 await expect(touchPage.locator('#testimonial-current')).not.toHaveText('1');
 await touchPage.getByRole('button',{name:'Comment 5',exact:true}).tap();
 await expect(touchPage.locator('#testimonial-current')).toHaveText('5');
 const target=await touchPage.getByRole('button',{name:'Comment 5',exact:true}).boundingBox();
 assert.ok(target.width>=24&&target.height>=24,'Carousel minimum touch target');
 assert.equal(await touchPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await touchPage.addScriptTag({content:axe});
 const mobileViolations=await touchPage.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id));
 assert.deepEqual(mobileViolations,[],'Mobile WCAG accessibility scan');
 await touchContext.close();
 pass('mobile touch preview, native carousel swipe, target size and accessibility');
 assert.deepEqual(failures,[],'No page errors or failed/off-origin assets');
 await fs.writeFile(path.join(artifacts,'report.json'),JSON.stringify({status:'PASS',checks,widths,failures},null,2));
 console.log(`LANDING_V21_BUILT_PASS (${checks.length} checks)`);
} catch(error){
 if(page)await page.screenshot({path:path.join(artifacts,'failure.png'),fullPage:true}).catch(()=>{});
 console.error(error); process.exitCode=1;
} finally {await browser.close();await server.close();}
