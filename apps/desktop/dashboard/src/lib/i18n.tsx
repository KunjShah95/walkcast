import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "en" | "hi" | "ta" | "te";

export const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
];

const STORAGE_KEY = "walkcast:lang";

const dict: Record<Lang, Record<string, string>> = {
  en: {
    "app.settings": "Settings",
    "language": "Language",
    "language.help": "Choose the language for the interface. Saved in this browser.",
    "settings.title": "Your",
    "settings.dim": "settings.",
    "settings.description": "Your account, how new walkthroughs are recorded, and what this deployment can do.",
    "dashboard.prompt": "What should we walk next?",
    "dashboard.latestWalkthrough": "Latest walkthrough",
    "dashboard.openInStudio": "open in the studio",
    "dashboard.readOnlySnapshot": "This is a read-only snapshot.",
    "common.save": "Save",
    "common.cancel": "Cancel",
  },
  hi: {
    "app.settings": "सेटिंग्स",
    "language": "भाषा",
    "language.help": "इंटरफ़ेस की भाषा चुनें. इस ब्राउज़र में सहेजा जाता है.",
    "settings.title": "आपकी",
    "settings.dim": "सेटिंग्स.",
    "settings.description": "आपका खाता, नए वॉकथ्रू कैसे रिकॉर्ड होते हैं, और यह डिप्लॉयमेंट क्या कर सकता है.",
    "dashboard.prompt": "आगे क्या देखें?",
    "dashboard.latestWalkthrough": "नवीनतम वॉकथ्रू",
    "dashboard.openInStudio": "स्टूडियो में खोलें",
    "dashboard.readOnlySnapshot": "यह एक केवल-पढ़ने वाला स्नैपशॉट है.",
    "common.save": "सहेजें",
    "common.cancel": "रद्द करें",
  },
  ta: {
    "app.settings": "அமைப்புகள்",
    "language": "மொழி",
    "language.help": "இடைமுகத்தின் மொழியைத் தேர்வு செய்க. இந்த உலாவியில் சேமிக்கப்படும்.",
    "settings.title": "உங்கள்",
    "settings.dim": "அமைப்புகள்.",
    "settings.description": "உங்கள் கணக்கு, புதிய வாக்த்ரூகள் எவ்வாறு பதிவு செய்யப்படுகின்றன, மற்றும் இந்த வெளியீடு என்ன செய்ய முடியும்.",
    "dashboard.prompt": "அடுத்து என்ன பார்க்கலாம்?",
    "dashboard.latestWalkthrough": "சமீபத்திய வாக்த்ரூ",
    "dashboard.openInStudio": "ஸ்டுடியோவில் திற",
    "dashboard.readOnlySnapshot": "இது படிக்க மட்டுமான ஸ்னாப்ஷாட்.",
    "common.save": "சேமி",
    "common.cancel": "ரத்து",
  },
  te: {
    "app.settings": "సెట్టింగ్స్",
    "language": "భాష",
    "language.help": "ఇంటర్ఫేస్ భాషను ఎంచుకోండి. ఈ బ్రౌజర్‌లో సేవ్ చేయబడుతుంది.",
    "settings.title": "మీ",
    "settings.dim": "సెట్టింగ్స్.",
    "settings.description": "మీ ఖాతా, కొత్త వాక్‌థ్రూలు ఎలా రికార్డ్ చేయబడతాయి, మరియు ఈ డిప్లాయ్‌మెంట్ ఏమి చేయగలదు.",
    "dashboard.prompt": "తర్వాత ఏమి చూద్దాం?",
    "dashboard.latestWalkthrough": "తాజా వాక్‌థ్రూ",
    "dashboard.openInStudio": "స్టూడియోలో తెరువు",
    "dashboard.readOnlySnapshot": "ఇది చదవడానికి మాత్రమే స్నాప్‌షాట్.",
    "common.save": "సేవ్",
    "common.cancel": "రద్దు",
  },
};

function readLang(): Lang {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (raw === "en" || raw === "hi" || raw === "ta" || raw === "te")) return raw as Lang;
  } catch {
    /* ignore */
  }
  return "en";
}

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const t = useCallback((key: string) => dict[lang][key] ?? dict.en[key] ?? key, [lang]);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT(): (key: string) => string {
  return useI18n().t;
}