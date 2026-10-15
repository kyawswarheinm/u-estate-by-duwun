"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { backendText } from "@/i18n/backend";
import type { Profile } from "@/lib/types";
export function PhotoUploader({listings,selected,locale}:{listings:{id:string;title:string}[];selected?:string;locale:Profile["locale"]}) {
 const t=backendText(locale);const router=useRouter();const [pending,setPending]=useState(false);const [message,setMessage]=useState("");
 return <form className="panel grid gap-3 p-5" onSubmit={async event=>{
  event.preventDefault();const form=event.currentTarget;const data=new FormData(form);const file=data.get("photo");
  if(!(file instanceof File)||!file.size||file.size>5242880||!["image/png","image/jpeg","image/webp"].includes(file.type)){setMessage(t.fileError);return;}
  setPending(true);setMessage("");try{const response=await fetch("/api/listing-photos",{method:"POST",body:data});if(!response.ok)throw new Error();setMessage(t.uploaded);form.reset();router.refresh();}catch{setMessage(t.failed);}finally{setPending(false);}
 }}><h2 className="text-xl font-bold">{t.photos}</h2><label htmlFor="photo-listing">{t.listing}</label><select id="photo-listing" name="listingId" className="input" defaultValue={selected}>{listings.map(l=><option key={l.id} value={l.id}>{l.title}</option>)}</select>
 <label htmlFor="listing-photo">{t.photo}</label><input id="listing-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required/>
 <button className="btn btn-primary" disabled={pending}>{pending?t.uploading:t.upload}</button><p role="status">{message}</p></form>;
}
