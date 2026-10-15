// Shared helpers for opt-in hosted tests. Never print service keys, passwords or sessions.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
export { randomUUID };
if (!process.argv.includes('--allow-demo-writes')) throw new Error('Dedicated demo project only: pass --allow-demo-writes');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !secret) throw new Error('Missing Supabase configuration');
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}};
export const admin=createClient(url,secret,options);
export const guest=createClient(url,key,options);
export const sessions=[];
export const tag='qa-'+randomUUID().slice(0,8);
let passed=0,failed=0;
export function check(name,ok) { if(ok)passed++;else failed++;console.log(`${ok?'PASS':'FAIL'} ${name}`); }
export function must(result,step) { if(result.error)throw new Error(step);return result.data; }
export async function person(nationality='Thai') {
 const email=`${tag}-${randomUUID().slice(0,8)}@example.com`;
 const user=must(await admin.auth.admin.createUser({email,email_confirm:true,user_metadata:{name:`QA ${tag}`,nationality}}),'fixture user').user;
 must(await admin.from('profiles').update({utopia_member:true}).eq('id',user.id),'fixture member');
 const link=must(await admin.auth.admin.generateLink({type:'magiclink',email}),'fixture link');
 const client=createClient(url,key,options);sessions.push(client);
 must(await client.auth.verifyOtp({type:'email',token_hash:link.properties.hashed_token}),'fixture login');
 return {id:user.id,client};
}
export const createdListings=[];
export async function listing(owner,price=3000000,type='house') {
 return remember(must(await owner.client.rpc('listing_create',{p_kind:'sale',p_type:type,p_title:`QA ${tag} ${type}`,p_district:'Bang Yai',p_province:'Nonthaburi',p_area_sqm:100,p_price_thb:price,p_cobuy:true,...(type==='condo'?{p_building_total_sqm:1000,p_building_foreign_sqm:480}:{})}),'fixture listing'));
}
function remember(id){createdListings.push(id);return id;}
export async function group(user,id) {return must(await user.client.rpc('cobuy_create_group',{p_listing:id}),'fixture group');}
export const commit=(user,g,amount,request=randomUUID())=>user.client.rpc('cobuy_commit',{p_group:g,p_lane:'co_owner',p_amount:amount,p_request:request});
export async function parallel(jobs) {
 // All independent clients start behind the same release barrier.
 let release;const barrier=new Promise(resolve=>{release=resolve;});
 const pending=jobs.map(async job=>{await barrier;return job();});release();return Promise.all(pending);
}
export async function finish() {
 for(const client of sessions){await client.removeAllChannels();await client.auth.signOut({scope:'local'});}
 // Hide QA listings from the public site; history (ledger, offers, groups) stays for audit.
 if(createdListings.length){const r=await admin.from('listings').update({archived_at:new Date().toISOString()}).in('id',createdListings).is('archived_at',null);if(r.error)console.log('WARN could not archive QA listings');}
 console.log(`${passed} passed; ${failed} failed. QA fixtures archived (hidden, history kept); no shared seed reset.`);
 process.exitCode=failed?1:0;
}
