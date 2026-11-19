const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const pages=["index.html","discover.html","live-tv.html","account.html"];
test("all main routes use the same shared mobile navigation module and styles",()=>{
 for(const p of pages){
  const html=read(p);
  assert.match(html,/href="mobile-nav.css"/,p);
  assert.match(html,/src="mobile-nav.js"/,p);
 }
});
test("mobile navigation has exactly five consistent destinations",()=>{
 const js=read("mobile-nav.js");
 const links=[...js.matchAll(/\{id:"([^"]+)",href:"([^"]+)",glyph:"[^"]+",label:"([^"]+)"\}/g)];
 assert.deepEqual(links.map(x=>x[1]),["home","explore","library","live","favorites"]);
 assert.deepEqual(links.map(x=>x[3]),["Home","Explore","Library","Live TV","Saved"]);
});
test("mobile header hides crowded page-specific headers and menu stays fixed",()=>{
 const css=read("mobile-nav.css");
 assert.match(css,/\.topbar\{display:none!important\}/);
 assert.match(css,/\.discover-header\{display:none!important\}/);
 assert.match(css,/position:fixed;left:0;right:0;bottom:0/);
 assert.match(css,/env\(safe-area-inset-bottom/);
 assert.match(css,/body:has\(dialog\[open\]\)/);
});
test("old homepage navigation markup is removed to prevent duplicate bars",()=>{
 assert.doesNotMatch(read("index.html"),/<nav class="bottom-nav">/);
});
test("existing desktop layout remains available and mobile nav hidden on desktop",()=>{
 assert.match(read("mobile-nav.css"),/\.mb-mobile-header,\.mb-mobile-nav\{display:none\}/);
 assert.match(read("mobile-nav.css"),/@media\(max-width:700px\)/);
});
test("PWA caches both mobile navigation assets",()=>{
 const sw=read("sw.js");
 assert.match(sw,/"\.\/mobile-nav\.js"/);
 assert.match(sw,/"\.\/mobile-nav\.css"/);
});
