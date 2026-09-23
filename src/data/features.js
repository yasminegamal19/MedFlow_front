import {
  ScanText,
  FileStack,
  UserCheck,
  Contact,
  ListChecks,
  MessagesSquare,
  ShieldCheck,
  BellRing,
} from "lucide-react";

export const featuresContent = {
  ar: {
    eyebrow: "المميزات",
    title: "كل ما تحتاجه لإدارة الإحالات بثقة",
    lead: "أدوات مصمَّمة لمسار العمل السريري اليومي: دقيقة، منظَّمة، وتحت سيطرة الطبيب بالكامل.",
  },
  en: {
    eyebrow: "Features",
    title: "Everything you need to manage referrals with confidence",
    lead: "Tools designed around the daily clinical workflow: precise, structured, and fully physician-controlled.",
  },
};

export const features = {
  ar: [
    {
      icon: ScanText,
      title: "استخلاص ذكي للمعلومات",
      text: "تقرأ Clarity الملاحظات السريرية وتُبرز التفاصيل المهمة لبناء الإحالة.",
    },
    {
      icon: FileStack,
      title: "إحالات منظَّمة",
      text: "تُرتَّب المعلومات في صيغة متسقة وجاهزة للأخصائي في كل مرة.",
    },
    {
      icon: UserCheck,
      title: "مراجعة الطبيب",
      text: "لا تُرسل أي إحالة قبل أن يراجعها الطبيب ويؤكد محتواها النهائي.",
    },
    {
      icon: Contact,
      title: "دليل الأخصائيين",
      text: "اعثر على الأخصائي المناسب ووجّه الإحالة إليه بسرعة ودقة.",
    },
    {
      icon: ListChecks,
      title: "إدارة الإحالات",
      text: "تابع كل إحالة في مكان واحد، من المسودة حتى قبول الأخصائي لها.",
    },
    {
      icon: MessagesSquare,
      title: "تواصل سريري واضح",
      text: "امنح الأخصائي السياق الكافي ليتصرف بثقة من أول رسالة.",
    },
    {
      icon: ShieldCheck,
      title: "تعامل آمن مع البيانات",
      text: "تُدار المعلومات السريرية بضوابط وصول مصمَّمة لبيئات الرعاية الصحية.",
    },
    {
      icon: BellRing,
      title: "تتبّع الحالة",
      text: "اعرف موضع كل إحالة بدقة، مع تنبيهات فورية عند تغيّر حالتها.",
    },
  ],
  en: [
    {
      icon: ScanText,
      title: "Intelligent information extraction",
      text: "Clarity reads through clinical notes and surfaces the details that matter for a referral.",
    },
    {
      icon: FileStack,
      title: "Structured referrals",
      text: "Information is organized into a consistent, specialist-ready format every time.",
    },
    {
      icon: UserCheck,
      title: "Physician review",
      text: "Nothing is sent without the physician reviewing and confirming the final referral.",
    },
    {
      icon: Contact,
      title: "Specialist directory",
      text: "Find and route referrals to the right specialist quickly and accurately.",
    },
    {
      icon: ListChecks,
      title: "Referral management",
      text: "Track every referral in one place, from draft to specialist acceptance.",
    },
    {
      icon: MessagesSquare,
      title: "Clear clinical communication",
      text: "Give specialists the context they need to act with confidence, from the first message.",
    },
    {
      icon: ShieldCheck,
      title: "Secure data handling",
      text: "Clinical information is handled with access controls built for healthcare settings.",
    },
    {
      icon: BellRing,
      title: "Status tracking",
      text: "Know exactly where each referral stands, with updates as its status changes.",
    },
  ],
};
