const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const discover=fs.readFileSync(path.join(__dirname,"..","discover.js"),"utf8");
const home=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const markup=fs.readFileSync(path.join(__dirname,"..","discover.html"),"utf8");
const css=fs.readFileSync(path.join(__dirname,"..","discover.css"),"utf8");
function pureFunction(name,nextName){
 const start=discover.indexOf("function "+name+"(");
 const end=discover.indexOf("function "+nextName+"(",start);
 assert.ok(start>=0&&end>start,"functions "+name+" and "+nextName+" exist");
 return discover.slice(start,end);
}
const logic=pureFunction("normalizedTitle","candidateMatch")+pureFunction("candidateMatch","cachedRecommendations");
const {normalizedTitle,candidateMatch}=new Function(logic+"return {normalizedTitle,candidateMatch};")();
function title(type,year,name){return{id:"catalog-id",provider:"moviebox",title:name,type,year}}
test("all four recommendation shelves are present and render live results",()=>{
 for(const id of ["hollywood","bollywood","indian-series","series"])assert.match(markup,new RegExp('id="reco-'+id+'"'));
 assert.match(discover,/requestJSON\("\/api\/search\?provider=moviebox&query="/);
 assert.match(discover,/return list\.find\(item=>candidateMatch\(item,seed,category\)\)\|\|null/);
});
test("recommendations load lazily and cache each shelf independently",()=>{
 assert.match(discover,/RECO_MAX_CONCURRENT=4/);
 assert.match(discover,/RECO_SEARCH_TIMEOUT=8000/);
 assert.match(discover,/RECO_TTL=24\*60\*60\*1000/);
 assert.match(discover,/new IntersectionObserver\(/);
 assert.match(discover,/rootMargin:"300px 0px"/);
 assert.match(discover,/const stale=allCategories\.filter\(/);
 assert.match(discover,/cacheRecommendationCategory\(category,found\.slice\(0,4\)\)/);
 assert.doesNotMatch(discover,/const tasks=categories\.map\(category=>loadRecommendationCategory/);
});
test("catalog matching requires exact title and right type",()=>{
 assert.equal(candidateMatch(title("Movie","2026","Project Hail Mary"),"Project Hail Mary","hollywood"),true);
 assert.equal(candidateMatch(title("Movie","2025","Project Hail Mary 2"),"Project Hail Mary","hollywood"),false);
 assert.equal(candidateMatch(title("TV Show","2026","Project Hail Mary"),"Project Hail Mary","hollywood"),false);
 assert.equal(candidateMatch(title("TV Show","2025","Wednesday"),"Wednesday","series"),true);
 assert.equal(candidateMatch(title("TV Show","2025","Black Warrant"),"Black Warrant","indian-series"),true);
 assert.equal(candidateMatch(title("Movie","2025","Black Warrant"),"Black Warrant","indian-series"),false);
 assert.equal(candidateMatch(title("Movie","2019","Border 2"),"Border 2","bollywood"),false);
 assert.equal(candidateMatch({id:"catalog-id",provider:"other",title:"Border 2",type:"Movie",year:"2026"},"Border 2","bollywood"),false);
});
test("recommendation Watch Now bypasses detail modal and opens source picker",()=>{
 assert.match(discover,/if\(goStraightToWatch\)\{openWatch\(true\);return;\}/);
 assert.match(discover,/if\(button\.dataset\.recoWatch\)await detail\(id,true\)/);
 assert.match(discover,/const data=await requestJSON\("\/api\/details\?provider="/);
 assert.match(discover,/watch\.textContent="▶ Watch Now"/);
 assert.match(discover,/if\(autoFind&&\$\("#watch-token"\)\.value\.trim\(\)\.length>=24\)/);
});
test("saved Home movie uses stable MovieBox ID rather than searching by title",()=>{
 assert.match(home,/discover\.html\?item=/);
 assert.match(home,/class="home-title-watch"/);
 assert.match(home,/watchHref=title\.provider&&title\.id\?searchHref\+"&watch=1"/);
 assert.match(home,/encodeURIComponent\(title\.provider\+":"\+title\.id\)/);
 assert.match(discover,/if\(requestedItem&&saved\[requestedItem\]\)detail\(requestedItem,queryParams\.get\("watch"\)==="1"\)/);
 assert.match(discover,/function findItem\(id\)\{return results\.find/);
});
test("Saved tab includes MovieBox watchlist with direct details and Watch Now",()=>{
 assert.match(home,/if\(route==="favorites"\)\{/);
 assert.match(home,/getSavedTitles\(250\)/);
 assert.match(home,/Your MovieBox watchlist/);
 assert.match(home,/movieboxTitles\.map\(homeTitleCard\)/);
 assert.match(home,/class="home-title-watch"/);
});
test("recommendations are horizontally swipeable on mobile",()=>{
 assert.match(css,/grid-auto-flow:column/);
 assert.match(css,/scroll-snap-type:x mandatory/);
});
test("no provider media URL or private token is stored in recommendation cache",()=>{
 assert.match(discover,/const RECO_STORAGE="moviebox-recommendations-v3"/);
 assert.match(discover,/JSON\.stringify\(\{version:RECO_VERSION,categories,checkedAt\}\)/);
 assert.doesNotMatch(discover.slice(discover.indexOf("const RECOMMENDATION_SEEDS"),discover.indexOf('$("#discover-form")')),/resolver_url|STREAM_ACCESS_TOKEN|sessionToken/);
});
