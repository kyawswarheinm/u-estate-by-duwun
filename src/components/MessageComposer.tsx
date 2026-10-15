"use client";
import { useActionState } from "react";
import { sendMessage } from "@/app/messages/actions";
import { backendText } from "@/i18n/backend";
import type { Profile } from "@/lib/types";
export function MessageComposer({id,requestId,locale}:{id:string;requestId:string;locale:Profile["locale"]}) {
 const [state,action,pending]=useActionState(sendMessage,null);const t=backendText(locale);
 return <form action={action} className="panel grid gap-3 p-4">
  <input type="hidden" name="conversationId" value={id}/><input type="hidden" name="requestId" value={requestId}/>
  <label htmlFor="message-body">{t.message}</label><textarea id="message-body" name="body" className="input" required maxLength={2000} rows={3}/>
  <button className="btn btn-primary" disabled={pending}>{pending?t.sending:t.send}</button>
  <p role="status">{state?.message}</p>
 </form>;
}
