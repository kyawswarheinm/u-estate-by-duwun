import {admin,guest,check,must,person,listing,randomUUID,finish} from './hosted-harness.mjs';
const uploads=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function subscribe(user,conversation,events) {
 const channel=user.client.channel('qa-'+randomUUID(),{config:{postgres_changes_options:{wait:true}}}).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`conversation_id=eq.${conversation}`},p=>events.messages.push(p.new))
 .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications'},p=>events.notifications.push(p.new));
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Realtime subscribe timeout')),25000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timeout);resolve();}else if(status==='CHANNEL_ERROR'){clearTimeout(timeout);reject(new Error('Realtime subscription failed'));}});});
 return channel;
}
async function until(predicate) {for(let i=0;i<100;i++){if(predicate())return true;await pause(100);}return false;}
try {
 const seller=await person(),buyer=await person(),outsider=await person();
 const id=await listing(seller);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=','base64');
 const photo=`${seller.id}/${id}/${randomUUID()}.png`,deed=`${seller.id}/${id}/${randomUUID()}.png`;
 must(await seller.client.storage.from('listing-photos').upload(photo,png,{contentType:'image/png'}),'photo upload');uploads.push(['listing-photos',photo]);
 const publicUrl=seller.client.storage.from('listing-photos').getPublicUrl(photo).data.publicUrl;
 const visible=await fetch(publicUrl);check('real uploaded photo publicly displays',visible.ok && visible.headers.get('content-type')?.includes('image/png'));
 must(await seller.client.storage.from('deeds').upload(deed,png,{contentType:'image/png'}),'deed upload');uploads.push(['deeds',deed]);
 const recordArgs={p_owner:seller.id,p_listing:id,p_path:deed,p_extraction:{fixture:true},p_flags:[{severity:'warning',message:'QA fixture, no AI verification performed'}],p_outcome:'needs_review'};
 check('ordinary users cannot invoke privileged deed write-back',Boolean((await seller.client.rpc('save_document_check',recordArgs)).error));
 const document=must(await admin.rpc('save_document_check',recordArgs),'atomic deed fixture');
 check('hosted deed check persists with owner privacy',must(await seller.client.from('documents').select('id').eq('id',document),'owner document').length===1 && must(await outsider.client.from('documents').select('id').eq('id',document),'outsider document').length===0);
 check('hosted deed result updates listing badge',must(await admin.from('listings').select('verification_status').eq('id',id).single(),'deed badge').verification_status==='needs_review');
 const reviewer=await person();must(await admin.from('profiles').update({is_reviewer:true}).eq('id',reviewer.id),'reviewer fixture');
 check('reviewer can read private deed',!(await reviewer.client.storage.from('deeds').download(deed)).error);
 check('ordinary user cannot reset demo',Boolean((await seller.client.rpc('demo_reset',{p_request:randomUUID(),p_dry_run:true})).error));
 check('reviewer reset preview works without resetting shared data',must(await reviewer.client.rpc('demo_reset',{p_request:randomUUID(),p_dry_run:true}),'reset preview').eligible===true);
 check('owner can read private deed',!(await seller.client.storage.from('deeds').download(deed)).error);
 check('outsider cannot read private deed',Boolean((await outsider.client.storage.from('deeds').download(deed)).error));
 check('guest cannot read private deed',Boolean((await guest.storage.from('deeds').download(deed)).error));
 check('outsider cannot overwrite owner photo',Boolean((await outsider.client.storage.from('listing-photos').upload(photo,png,{contentType:'image/png',upsert:true})).error));
 check('outsider cannot write into owner deed folder',Boolean((await outsider.client.storage.from('deeds').upload(`${seller.id}/${id}/outsider.png`,png,{contentType:'image/png'})).error));
 check('invalid MIME rejected by real Storage',Boolean((await seller.client.storage.from('listing-photos').upload(`${seller.id}/${id}/invalid.txt`,'text',{contentType:'text/plain'})).error));
 check('over-5MB upload rejected by real Storage',Boolean((await seller.client.storage.from('listing-photos').upload(`${seller.id}/${id}/oversized.png`,new Uint8Array(5242881),{contentType:'image/png'})).error));
 const signed=must(await seller.client.storage.from('deeds').createSignedUrl(deed,5),'signed deed URL');
 check('private signed URL works initially',(await fetch(signed.signedUrl)).ok);
 await pause(6500);check('private signed URL expires',!(await fetch(signed.signedUrl,{cache:'no-store'})).ok);
 const conversation=must(await buyer.client.rpc('conversation_start',{p_listing:id,p_body:''}),'conversation');
 const sellerEvents={messages:[],notifications:[]},buyerEvents={messages:[],notifications:[]},outsideEvents={messages:[],notifications:[]};
 const channels=await Promise.all([subscribe(seller,conversation,sellerEvents),subscribe(buyer,conversation,buyerEvents),subscribe(outsider,conversation,outsideEvents)]);
 const first=must(await buyer.client.from('messages').insert({conversation_id:conversation,body_original:'QA realtime first message'}).select('id').single(),'send first');
 check('two independent sessions receive the message live',await until(()=>sellerEvents.messages.some(m=>m.id===first.id)&&buyerEvents.messages.some(m=>m.id===first.id)));
 check('seller receives message notification live',await until(()=>sellerEvents.notifications.some(n=>n.link===`/messages/${conversation}`)));
 await pause(2000);check('outsider receives neither private messages nor notifications',outsideEvents.messages.length===0&&outsideEvents.notifications.length===0);
 check('outsider cannot read persisted thread',must(await outsider.client.from('messages').select('id').eq('conversation_id',conversation),'outsider read').length===0);
 check('outsider cannot post to thread',Boolean((await outsider.client.from('messages').insert({conversation_id:conversation,body_original:'intrusion'})).error));
 must(await seller.client.rpc('conversation_mark_read',{p_conversation:conversation}),'mark thread read');
 must(await seller.client.rpc('notifications_mark_read'),'mark notifications read');
 check('notification unread count clears',must(await seller.client.from('notifications').select('id').is('read_at',null),'unread count').length===0);
 const member=must(await seller.client.from('conversation_members').select('last_read_at').eq('conversation_id',conversation).eq('user_id',seller.id).single(),'read watermark');
 check('thread read watermark persists',Boolean(member.last_read_at));
 await seller.client.removeChannel(channels[0]);
 const missed=must(await buyer.client.from('messages').insert({conversation_id:conversation,body_original:'QA sent while disconnected'}).select('id').single(),'disconnected message');
 await subscribe(seller,conversation,sellerEvents);
 check('reconnect can recover missed persisted messages',must(await seller.client.from('messages').select('id').eq('conversation_id',conversation),'recover messages').some(m=>m.id===missed.id));
 const after=must(await buyer.client.from('messages').insert({conversation_id:conversation,body_original:'QA sent after reconnect'}).select('id').single(),'reconnected message');
 check('reconnected session receives new message live',await until(()=>sellerEvents.messages.some(m=>m.id===after.id)));
 check('reconnected session receives event once',sellerEvents.messages.filter(m=>m.id===after.id).length===1);
} catch(error) {check(`Hosted services completed (${error.message})`,false);} finally {
 for(const [bucket,path] of uploads)await admin.storage.from(bucket).remove([path]);
 await finish();
}
