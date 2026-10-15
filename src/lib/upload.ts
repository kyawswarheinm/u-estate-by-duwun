import "server-only";
export const MAX_IMAGE_BYTES=5*1024*1024;
/** Inspect magic bytes as well as the browser-supplied MIME type. */
export function imageExtension(bytes: Uint8Array, mime: string): "png"|"jpg"|"webp"|null {
 if(mime==="image/png" && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return "png";
 if(mime==="image/jpeg" && bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return "jpg";
 if(mime==="image/webp" && Buffer.from(bytes.slice(0,4)).toString()==="RIFF" && Buffer.from(bytes.slice(8,12)).toString()==="WEBP")return "webp";
 return null;
}
