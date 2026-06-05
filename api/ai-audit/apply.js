const EXCLUDED_FILES=["next.config.js","next.config.ts","next.config.mjs","package.json","package-lock.json","yarn.lock","pnpm-lock.yaml","middleware.ts","middleware.js","middleware.tsx",".env",".env.local",".env.production",".env.development","vercel.json","tsconfig.json","tailwind.config.js","tailwind.config.ts","postcss.config.js","postcss.config.mjs",".gitignore",".eslintrc.js",".eslintrc.json","eslint.config.mjs","Dockerfile","docker-compose.yml","docker-compose.yaml","app/layout.tsx","app/layout.js","app/layout.jsx","pages/_app.tsx","pages/_app.js","pages/_document.tsx","pages/_document.js","app/manifest.json","public/manifest.json","android/app/build.gradle","ios/Podfile","capacitor.config.ts","capacitor.config.js","app.yaml","app.json"];
function isExcludedFile(f){var n=f.replace(/\\/g,"/").toLowerCase();for(var i=0;i<EXCLUDED_FILES.length;i++){if(n===EXCLUDED_FILES[i].toLowerCase()||n.endsWith("/"+EXCLUDED_FILES[i].toLowerCase()))return true}return false}
async function gh(url,token,opts){opts=opts||{};var h={"Authorization":"Bearer "+token,"Accept":"application/vnd.github.v3+json","User-Agent":"Gominers"};if(opts.body)h["Content-Type"]="application/json";var r=await fetch(url,{method:opts.method||"GET",headers:h,body:opts.body?JSON.stringify(opts.body):undefined});var d=await r.json();return{ok:r.ok,data:d}}
async function getTree(o,r,b,tk){var res=await gh("https://api.github.com/repos/"+o+"/"+r+"/git/trees/"+b+"?recursive=1",tk);if(!res.ok)return[];var sk=["node_modules",".git",".next","build","dist",".vercel"];return(res.data.tree||[]).filter(function(i){return i.type==="blob"&&!i.path.split("/").some(function(s){return sk.indexOf(s)>=0})}).map(function(i){return i.path})}
async function getFile(o,r,f,b,tk){var res=await gh("https://api.github.com/repos/"+o+"/"+r+"/contents/"+f+"?ref="+b,tk);if(!res.ok)return null;return{sha:res.data.sha,content:Buffer.from(res.data.content,"base64").toString("utf-8")}}
async function putFile(o,r,f,c,sha,b,msg,tk){return await gh("https://api.github.com/repos/"+o+"/"+r+"/contents/"+f,tk,{method:"PUT",body:{message:msg,content:Buffer.from(c).toString("base64"),sha:sha,branch:b}})}
async function makeBranch(o,r,b,sha,tk){return await gh("https://api.github.com/repos/"+o+"/"+r+"/git/refs",tk,{method:"POST",body:{ref:"refs/heads/"+b,sha:sha}})}
async function makePR(o,r,head,base,title,body,tk){return await gh("https://api.github.com/repos/"+o+"/"+r+"/pulls",tk,{method:"POST",body:{title:title,body:body,head:head,base:base}})}
module.exports=async function handler(req,res){
res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type");
if(req.method==="OPTIONS")return res.status(200).end();
if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
var cookies={};(req.headers.cookie||"").split(";").forEach(function(c){var p=c.trim().split("=");if(p[0])cookies[p[0].trim()]=p.slice(1).join("=").trim()});
var st=cookies["gmn_session"];if(!st)return res.status(401).json({error:"Unauthorized"});
try{var jose=await import("jose");var sec=new TextEncoder().encode(process.env.AUTH_SECRET||"fallback");await jose.jwtVerify(st,sec,{issuer:"gominers-ai-audit",audience:"gominers-dashboard"})}catch(e){return res.status(401).json({error:"Unauthorized"})}
try{
var body=typeof req.body==="string"?JSON.parse(req.body):req.body;
var repo_url=body.repo_url,gtk=body.github_token,fixes=body.fixes,b=body.branch,mode=body.mode;
if(!repo_url||!gtk)return res.status(400).json({error:"Repo URL and token required"});
if(!fixes||!fixes.length)return res.status(400).json({error:"No fixes"});
var m=repo_url.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
if(!m)return res.status(400).json({error:"Invalid GitHub URL"});
var owner=m[1],repo=m[2].replace(/\.git$/,""),base=b||"main";
var files=await getTree(owner,repo,base,gtk);

if(mode==="preview"){
var pv=[];
for(var i=0;i<fixes.length;i++){
var fx=fixes[i],file=fx.file;
if(!file){pv.push({fix_id:fx.issue_id,file:null,action:"skip",reason:"No file path"});continue}
if(isExcludedFile(file)){pv.push({fix_id:fx.issue_id,file:file,action:"skip",reason:"Excluded config"});continue}
if(!files.some(function(f){return f.toLowerCase()===file.toLowerCase()})){pv.push({fix_id:fx.issue_id,file:file,action:"skip",reason:"Not in repo"});continue}
if(!fx.fixed_snippet||fx.fixed_snippet.trim().length<5){pv.push({fix_id:fx.issue_id,file:file,action:"skip",reason:"No fix code"});continue}
var cur=await getFile(owner,repo,file,base,gtk);
if(!cur){pv.push({fix_id:fx.issue_id,file:file,action:"skip",reason:"Cannot read"});continue}
var orig=fx.original_snippet||"";
if(orig.length>10&&cur.content.includes(orig)){pv.push({fix_id:fx.issue_id,file:file,action:"edit",explanation:fx.explanation||""})}
else{pv.push({fix_id:fx.issue_id,file:file,action:"skip",reason:"Original not found in file"})}
}
var ed=pv.filter(function(p){return p.action==="edit"}).length;
var sk=pv.filter(function(p){return p.action==="skip"}).length;
return res.status(200).json({mode:"preview",total_fixes:fixes.length,will_edit:ed,will_skip:sk,preview:pv});
}

// APPLY MODE
var ts=new Date().toISOString().replace(/[:.]/g,"-").substring(0,19);
var prBranch="ai-audit/fix-"+ts;
var refRes=await gh("https://api.github.com/repos/"+owner+"/"+repo+"/git/ref/heads/"+base,gtk);
if(!refRes.ok)return res.status(500).json({error:"Cannot read branch"});
var mainSha=refRes.data.object.sha;
var brRes=await makeBranch(owner,repo,prBranch,mainSha,gtk);
if(!brRes.ok)return res.status(500).json({error:"Cannot create branch: "+JSON.stringify(brRes.data)});

var results=[],commits=[];
for(var j=0;j<fixes.length;j++){
var fx2=fixes[j],file2=fx2.file;
if(!file2){results.push({fix_id:fx2.issue_id,file:null,status:"skipped",reason:"No file"});continue}
if(isExcludedFile(file2)){results.push({fix_id:fx2.issue_id,file:file2,status:"skipped",reason:"Excluded"});continue}
if(!files.some(function(f){return f.toLowerCase()===file2.toLowerCase()})){results.push({fix_id:fx2.issue_id,file:file2,status:"skipped",reason:"Not in repo"});continue}
if(!fx2.fixed_snippet||fx2.fixed_snippet.trim().length<5){results.push({fix_id:fx2.issue_id,file:file2,status:"skipped",reason:"No fix code"});continue}
try{
var cur2=await getFile(owner,repo,file2,prBranch,gtk);
if(!cur2){results.push({fix_id:fx2.issue_id,file:file2,status:"skipped",reason:"Cannot read"});continue}
var nc=cur2.content,orig2=fx2.original_snippet||"",fix2=fx2.fixed_snippet||"";
if(orig2.length>10&&nc.includes(orig2)){nc=nc.replace(orig2,fix2)}else{results.push({fix_id:fx2.issue_id,file:file2,status:"skipped",reason:"Original not found"});continue}
if(nc===cur2.content){results.push({fix_id:fx2.issue_id,file:file2,status:"skipped",reason:"No change"});continue}
if(Math.abs(nc.length-cur2.content.length)/cur2.content.length>0.5){results.push({fix_id:fx2.issue_id,file:file2,status:"skipped",reason:"Too large"});continue}
var cmsg="fix("+(fx2.issue_id||"AI")+"): "+(fx2.explanation||"Auto-fix").substring(0,72);
var ur=await putFile(owner,repo,file2,nc,cur2.sha,prBranch,cmsg,gtk);
if(ur.ok){results.push({fix_id:fx2.issue_id,file:file2,status:"applied"});commits.push("- "+fx2.issue_id+": "+file2)}
else{results.push({fix_id:fx2.issue_id,file:file2,status:"error",reason:ur.data.message||"Failed"})}
}catch(e2){results.push({fix_id:fx2.issue_id,file:file2,status:"error",reason:e2.message.substring(0,100)})}
}

var ap=results.filter(function(r){return r.status==="applied"}).length;
var sk2=results.filter(function(r){return r.status==="skipped"}).length;
var er=results.filter(function(r){return r.status==="error"}).length;
var prUrl=null;
if(ap>0){
var prTitle="AI Audit: "+ap+" fixes ("+ts+")";
var prBody="## AI Audit Auto-Fix\n\n**"+ap+"** applied, **"+sk2+"** skipped, **"+er+"** errors\n\n### Changes:\n"+commits.join("\n")+"\n\n---\n### Safety:\n- Only existing files modified\n- Config files excluded\n- Changes < 50% of file size\n- Review before merging\n\n*Generated by Gominers AI Audit*";
var prR=await makePR(owner,repo,prBranch,base,prTitle,prBody,gtk);
if(prR.ok)prUrl=prR.data.html_url;
}
return res.status(200).json({summary:ap+" applied, "+sk2+" skipped, "+er+" errors",applied:ap,skipped:sk2,errors:er,results:results,pr_url:prUrl,pr_branch:prBranch});
}catch(e){return res.status(500).json({error:"Apply failed: "+e.message})}
};
