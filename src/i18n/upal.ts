import type { Locale } from "@/lib/locale";
import type { PageKind } from "@/lib/upal";

// U-Pal widget copy in the five UI languages: page greetings, suggested questions, invitations and widget chrome.
// UI text only: every answer comes from the assistant and its tools.

export type UPalCopy = {
  greeting: Record<PageKind, string>;
  suggestions: Record<PageKind, string[]>;
  invite: Partial<Record<PageKind, string>>;
};

export const UPAL_COPY: Record<Locale, UPalCopy> = {
  en: {
    greeting: {
      home: "Hey! What's on your mind? Looking for your next home? 🏡",
      market: "Curious about the property market? Let's explore! 📈",
      rent: "Looking for a place to rent? Tell me your budget and preferred area!",
      sell: "Thinking about selling? I can help you get started.",
      listing: "Like this property? Ask me anything about it!",
      ledger: "Want to know how your property transactions stay transparent?",
      assistant: "Hi! I'm U-Pal, your personal real estate consultant. What can I help you with?",
      other: "Hi! I'm U-Pal. How can I help you today?",
    },
    suggestions: {
      home: ["Find me a condo under ฿4M", "Can I afford to buy a home?", "Help me choose a neighborhood"],
      market: ["Are property prices going up?", "Which districts are growing?", "Is now a good time to buy?"],
      rent: ["Find me a condo under ฿8,000/month", "How much deposit will I need?", "Should I rent or buy?"],
      sell: ["How much is my property worth?", "What are the selling fees?", "How do I list my property?"],
      listing: ["Is this property fairly priced?", "Estimate my monthly mortgage", "What are the ownership costs?"],
      ledger: ["How does verification work?", "What does the ledger record?", "Can ownership records be changed?"],
      assistant: ["Find me a condo under ฿4M", "What are the selling fees?", "Can foreigners buy a condo in Thailand?"],
      other: ["Find me a condo under ฿4M", "How does U-Estate work?", "What are the selling fees?"],
    },
    invite: {
      home: "What's on your mind?",
      market: "Wanna talk about the market?",
      rent: "Looking for a rental?",
      sell: "Need help selling?",
      ledger: "Questions about transparency?",
      listing: "Want to know more about this home?",
    },
  },
  th: {
    greeting: {
      home: "สวัสดี! คิดอะไรอยู่? กำลังหาบ้านหลังใหม่อยู่หรือเปล่า 🏡",
      market: "อยากรู้เรื่องตลาดอสังหาฯ ไหม? มาดูกัน! 📈",
      rent: "กำลังหาที่เช่าอยู่ใช่ไหม? บอกงบและย่านที่อยากอยู่มาได้เลย!",
      sell: "กำลังคิดจะขายอยู่ใช่ไหม? ให้ฉันช่วยเริ่มต้นนะ",
      listing: "ชอบบ้านหลังนี้ไหม? ถามอะไรเกี่ยวกับมันได้เลย!",
      ledger: "อยากรู้ไหมว่าธุรกรรมอสังหาฯ ของคุณโปร่งใสอย่างไร?",
      assistant: "สวัสดี! ฉันคือ U-Pal ที่ปรึกษาอสังหาฯ ส่วนตัวของคุณ ให้ช่วยอะไรดี?",
      other: "สวัสดี! ฉันคือ U-Pal วันนี้ให้ช่วยอะไรดี?",
    },
    suggestions: {
      home: ["หาคอนโดราคาไม่เกิน ฿4 ล้านให้หน่อย", "ฉันมีกำลังซื้อบ้านไหม?", "ช่วยเลือกย่านที่อยู่ให้หน่อย"],
      market: ["ราคาอสังหาฯ กำลังขึ้นไหม?", "เขตไหนกำลังเติบโต?", "ตอนนี้เป็นเวลาที่ดีในการซื้อไหม?"],
      rent: ["หาคอนโดค่าเช่าไม่เกิน ฿8,000/เดือนให้หน่อย", "ต้องวางเงินประกันเท่าไร?", "ควรเช่าหรือซื้อดี?"],
      sell: ["ทรัพย์ของฉันมีมูลค่าเท่าไร?", "ค่าธรรมเนียมการขายเท่าไร?", "ลงประกาศขายอย่างไร?"],
      listing: ["ราคานี้สมเหตุสมผลไหม?", "ประมาณค่าผ่อนรายเดือนให้หน่อย", "ค่าใช้จ่ายในการถือครองมีอะไรบ้าง?"],
      ledger: ["การตรวจสอบทำงานอย่างไร?", "บัญชีบันทึกอะไรบ้าง?", "บันทึกกรรมสิทธิ์แก้ไขได้ไหม?"],
      assistant: ["หาคอนโดราคาไม่เกิน ฿4 ล้านให้หน่อย", "ค่าธรรมเนียมการขายเท่าไร?", "ชาวต่างชาติซื้อคอนโดในไทยได้ไหม?"],
      other: ["หาคอนโดราคาไม่เกิน ฿4 ล้านให้หน่อย", "U-Estate ทำงานอย่างไร?", "ค่าธรรมเนียมการขายเท่าไร?"],
    },
    invite: {
      home: "คิดอะไรอยู่?",
      market: "คุยเรื่องตลาดกันไหม?",
      rent: "กำลังหาที่เช่าอยู่ไหม?",
      sell: "ให้ช่วยเรื่องขายไหม?",
      ledger: "สงสัยเรื่องความโปร่งใสไหม?",
      listing: "อยากรู้เพิ่มเกี่ยวกับบ้านหลังนี้ไหม?",
    },
  },
  ar: {
    greeting: {
      home: "مرحبًا! بماذا تفكر؟ هل تبحث عن منزلك القادم؟ 🏡",
      market: "فضولي بشأن سوق العقارات؟ لنستكشف معًا! 📈",
      rent: "تبحث عن مكان للإيجار؟ أخبرني بميزانيتك والمنطقة التي تفضلها!",
      sell: "تفكر في البيع؟ يمكنني مساعدتك في البدء.",
      listing: "أعجبك هذا العقار؟ اسألني أي شيء عنه!",
      ledger: "هل تريد أن تعرف كيف تبقى معاملاتك العقارية شفافة؟",
      assistant: "مرحبًا! أنا U-Pal، مستشارك العقاري الشخصي. كيف يمكنني مساعدتك؟",
      other: "مرحبًا! أنا U-Pal. كيف يمكنني مساعدتك اليوم؟",
    },
    suggestions: {
      home: ["ابحث لي عن شقة بأقل من 4 ملايين ฿", "هل أستطيع شراء منزل؟", "ساعدني في اختيار حي"],
      market: ["هل أسعار العقارات في ارتفاع؟", "ما المناطق التي تنمو؟", "هل الآن وقت مناسب للشراء؟"],
      rent: ["ابحث لي عن شقة بأقل من 8,000 ฿ شهريًا", "كم التأمين الذي سأحتاجه؟", "هل أستأجر أم أشتري؟"],
      sell: ["كم تساوي ممتلكاتي؟", "ما رسوم البيع؟", "كيف أعرض عقاري؟"],
      listing: ["هل سعر هذا العقار عادل؟", "قدّر قسط الرهن الشهري", "ما تكاليف الملكية؟"],
      ledger: ["كيف يعمل التحقق؟", "ماذا يسجل السجل؟", "هل يمكن تغيير سجلات الملكية؟"],
      assistant: ["ابحث لي عن شقة بأقل من 4 ملايين ฿", "ما رسوم البيع؟", "هل يمكن للأجانب شراء شقة في تايلاند؟"],
      other: ["ابحث لي عن شقة بأقل من 4 ملايين ฿", "كيف يعمل U-Estate؟", "ما رسوم البيع؟"],
    },
    invite: {
      home: "بماذا تفكر؟",
      market: "هل تريد التحدث عن السوق؟",
      rent: "تبحث عن إيجار؟",
      sell: "تحتاج مساعدة في البيع؟",
      ledger: "أسئلة عن الشفافية؟",
      listing: "تريد معرفة المزيد عن هذا المنزل؟",
    },
  },
  "zh-Hant": {
    greeting: {
      home: "嗨！在想什麼呢？正在找下一個家嗎？🏡",
      market: "對房地產市場好奇嗎？一起來看看！📈",
      rent: "在找房子租嗎？告訴我您的預算和想住的區域！",
      sell: "考慮賣房嗎？我可以幫您開始。",
      listing: "喜歡這間房子嗎？有任何問題都可以問我！",
      ledger: "想知道您的房產交易如何保持透明嗎？",
      assistant: "嗨！我是 U-Pal，您的專屬房地產顧問。有什麼可以幫您？",
      other: "嗨！我是 U-Pal。今天有什麼可以幫您？",
    },
    suggestions: {
      home: ["幫我找 400 萬泰銖以下的公寓", "我買得起房子嗎？", "幫我挑選社區"],
      market: ["房價正在上漲嗎？", "哪些區域正在成長？", "現在是買房的好時機嗎？"],
      rent: ["幫我找月租 8,000 泰銖以下的公寓", "我需要付多少押金？", "該租還是該買？"],
      sell: ["我的房產值多少錢？", "賣房費用是多少？", "如何刊登我的房產？"],
      listing: ["這間房子的價格合理嗎？", "估算我的每月房貸", "持有成本有哪些？"],
      ledger: ["驗證是如何運作的？", "帳本記錄了什麼？", "產權紀錄可以被更改嗎？"],
      assistant: ["幫我找 400 萬泰銖以下的公寓", "賣房費用是多少？", "外國人可以在泰國買公寓嗎？"],
      other: ["幫我找 400 萬泰銖以下的公寓", "U-Estate 如何運作？", "賣房費用是多少？"],
    },
    invite: {
      home: "在想什麼呢？",
      market: "想聊聊市場嗎？",
      rent: "在找租屋嗎？",
      sell: "需要賣房協助嗎？",
      ledger: "對透明度有疑問嗎？",
      listing: "想多了解這個家嗎？",
    },
  },
  es: {
    greeting: {
      home: "¡Hola! ¿Qué tienes en mente? ¿Buscas tu próximo hogar? 🏡",
      market: "¿Te interesa el mercado inmobiliario? ¡Vamos a explorarlo! 📈",
      rent: "¿Buscas un lugar para alquilar? ¡Dime tu presupuesto y la zona que prefieres!",
      sell: "¿Piensas vender? Te ayudo a empezar.",
      listing: "¿Te gusta esta propiedad? ¡Pregúntame lo que quieras!",
      ledger: "¿Quieres saber cómo tus transacciones se mantienen transparentes?",
      assistant: "¡Hola! Soy U-Pal, tu asesor inmobiliario personal. ¿En qué te ayudo?",
      other: "¡Hola! Soy U-Pal. ¿Cómo te ayudo hoy?",
    },
    suggestions: {
      home: ["Búscame un condo por menos de ฿4M", "¿Puedo permitirme comprar una casa?", "Ayúdame a elegir un barrio"],
      market: ["¿Están subiendo los precios?", "¿Qué distritos están creciendo?", "¿Es buen momento para comprar?"],
      rent: ["Búscame un condo por menos de ฿8,000/mes", "¿Cuánto depósito necesitaré?", "¿Me conviene alquilar o comprar?"],
      sell: ["¿Cuánto vale mi propiedad?", "¿Cuáles son las comisiones de venta?", "¿Cómo publico mi propiedad?"],
      listing: ["¿Tiene un precio justo esta propiedad?", "Estima mi hipoteca mensual", "¿Cuáles son los costes de propiedad?"],
      ledger: ["¿Cómo funciona la verificación?", "¿Qué registra el libro?", "¿Se pueden cambiar los registros de propiedad?"],
      assistant: ["Búscame un condo por menos de ฿4M", "¿Cuáles son las comisiones de venta?", "¿Pueden los extranjeros comprar un condo en Tailandia?"],
      other: ["Búscame un condo por menos de ฿4M", "¿Cómo funciona U-Estate?", "¿Cuáles son las comisiones de venta?"],
    },
    invite: {
      home: "¿Qué tienes en mente?",
      market: "¿Hablamos del mercado?",
      rent: "¿Buscas un alquiler?",
      sell: "¿Necesitas ayuda para vender?",
      ledger: "¿Preguntas sobre transparencia?",
      listing: "¿Quieres saber más de esta casa?",
    },
  },
};

/** Widget chrome, per language. */
export const UPAL_UI: Record<Locale, Record<
  "open" | "subtitle" | "minimize" | "close" | "placeholder" | "send" | "startVoice" | "endVoice" | "mute" | "unmute" | "listening" | "speaking" | "connecting" | "thinking" | "dismiss" | "suggested" | "you" | "listen" | "inCall" | "disclaimer" | "micDenied" | "voiceError" | "disconnected",
  string
>> = {
  en: {
    open: "Ask U-Pal", subtitle: "Your real estate companion", minimize: "Minimize", close: "Close", placeholder: "Ask U-Pal anything…", send: "Send",
    startVoice: "Start a voice conversation", endVoice: "End voice conversation", mute: "Mute mic", unmute: "Unmute mic", listening: "Listening", speaking: "U-Pal is speaking",
    connecting: "Connecting…", thinking: "U-Pal is thinking", dismiss: "Dismiss", suggested: "Suggested questions", you: "You", listen: "Listen", inCall: "In a call",
    disclaimer: "Answers use U-Estate data through tools. Estimates, not financial or legal advice.",
    micDenied: "Microphone permission is needed for voice. You can keep typing instead.", voiceError: "Voice is unavailable right now. You can keep typing.", disconnected: "Voice call ended.",
  },
  th: {
    open: "ถาม U-Pal", subtitle: "เพื่อนคู่คิดเรื่องอสังหาฯ", minimize: "ย่อ", close: "ปิด", placeholder: "ถาม U-Pal ได้ทุกเรื่อง…", send: "ส่ง",
    startVoice: "เริ่มคุยด้วยเสียง", endVoice: "จบการคุยด้วยเสียง", mute: "ปิดไมค์", unmute: "เปิดไมค์", listening: "กำลังฟัง", speaking: "U-Pal กำลังพูด",
    connecting: "กำลังเชื่อมต่อ…", thinking: "U-Pal กำลังคิด", dismiss: "ปิด", suggested: "คำถามแนะนำ", you: "คุณ", listen: "ฟัง", inCall: "กำลังคุย",
    disclaimer: "คำตอบใช้ข้อมูลของ U-Estate ผ่านเครื่องมือ เป็นการประมาณ ไม่ใช่คำแนะนำทางการเงินหรือกฎหมาย",
    micDenied: "ต้องอนุญาตไมโครโฟนเพื่อคุยด้วยเสียง พิมพ์ต่อได้เลย", voiceError: "ตอนนี้ใช้เสียงไม่ได้ พิมพ์ต่อได้เลย", disconnected: "จบการคุยด้วยเสียงแล้ว",
  },
  ar: {
    open: "اسأل U-Pal", subtitle: "رفيقك العقاري", minimize: "تصغير", close: "إغلاق", placeholder: "اسأل U-Pal أي شيء…", send: "إرسال",
    startVoice: "ابدأ محادثة صوتية", endVoice: "أنهِ المحادثة الصوتية", mute: "كتم الميكروفون", unmute: "إلغاء الكتم", listening: "يستمع", speaking: "U-Pal يتحدث",
    connecting: "جارٍ الاتصال…", thinking: "U-Pal يفكر", dismiss: "تجاهل", suggested: "أسئلة مقترحة", you: "أنت", listen: "استمع", inCall: "في مكالمة",
    disclaimer: "تستخدم الإجابات بيانات U-Estate عبر الأدوات. تقديرات، وليست نصيحة مالية أو قانونية.",
    micDenied: "يلزم إذن الميكروفون للمحادثة الصوتية. يمكنك متابعة الكتابة.", voiceError: "الصوت غير متاح الآن. يمكنك متابعة الكتابة.", disconnected: "انتهت المكالمة الصوتية.",
  },
  "zh-Hant": {
    open: "詢問 U-Pal", subtitle: "您的房地產好夥伴", minimize: "最小化", close: "關閉", placeholder: "問 U-Pal 任何問題…", send: "傳送",
    startVoice: "開始語音對話", endVoice: "結束語音對話", mute: "麥克風靜音", unmute: "取消靜音", listening: "聆聽中", speaking: "U-Pal 正在說話",
    connecting: "連線中…", thinking: "U-Pal 思考中", dismiss: "關閉", suggested: "建議問題", you: "您", listen: "收聽", inCall: "通話中",
    disclaimer: "回答透過工具使用 U-Estate 資料。僅為估算，並非財務或法律建議。",
    micDenied: "語音對話需要麥克風權限。您可以繼續打字。", voiceError: "目前無法使用語音。您可以繼續打字。", disconnected: "語音通話已結束。",
  },
  es: {
    open: "Pregunta a U-Pal", subtitle: "Tu compañero inmobiliario", minimize: "Minimizar", close: "Cerrar", placeholder: "Pregúntale lo que quieras a U-Pal…", send: "Enviar",
    startVoice: "Iniciar conversación por voz", endVoice: "Terminar conversación por voz", mute: "Silenciar micro", unmute: "Activar micro", listening: "Escuchando", speaking: "U-Pal está hablando",
    connecting: "Conectando…", thinking: "U-Pal está pensando", dismiss: "Descartar", suggested: "Preguntas sugeridas", you: "Tú", listen: "Escuchar", inCall: "En llamada",
    disclaimer: "Las respuestas usan datos de U-Estate mediante herramientas. Son estimaciones, no asesoría financiera ni legal.",
    micDenied: "Se necesita permiso de micrófono para la voz. Puedes seguir escribiendo.", voiceError: "La voz no está disponible ahora. Puedes seguir escribiendo.", disconnected: "La llamada de voz terminó.",
  },
};
