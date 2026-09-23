import { Lock, KeyRound, Users, History } from "lucide-react";

export const securityContent = {
  ar: {
    eyebrow: "الأمان والامتثال",
    title: "بيانات المرضى تستحق أعلى مستويات الحماية",
    lead: "بُنيت Clarity على مبدأ أن المعلومات السريرية حساسة في كل خطوة: من الإدخال حتى التخزين والمشاركة.",
    goalsTitle: "أهداف الامتثال",
    goalsNote: "معايير نعمل على الالتزام بها كجزء أساسي من تصميم المنصة.",
  },
  en: {
    eyebrow: "Security & Compliance",
    title: "Patient data deserves the highest level of protection",
    lead: "Clarity is built on the principle that clinical information is sensitive at every step: from entry to storage and sharing.",
    goalsTitle: "Compliance goals",
    goalsNote: "Standards we design toward as a core part of the platform.",
  },
};

export const securityPoints = {
  ar: [
    {
      icon: Lock,
      title: "الخصوصية بالتصميم",
      text: "تُعامل المعلومات السريرية كبيانات حساسة في كل خطوة، من الإدخال حتى التخزين.",
    },
    {
      icon: KeyRound,
      title: "وصول آمن",
      text: "اتصالات مشفَّرة ومصادقة آمنة تحمي كل جلسة عمل داخل المنصة.",
    },
    {
      icon: Users,
      title: "صلاحيات محكومة",
      text: "الوصول محدَّد حسب دور كل مستخدم، فلا تصل المعلومات إلا لمن يحق له.",
    },
    {
      icon: History,
      title: "قابلية التتبّع",
      text: "تُسجَّل أنشطة الإحالة، ليمكن مراجعة التغييرات والإجراءات عند الحاجة.",
    },
  ],
  en: [
    {
      icon: Lock,
      title: "Data privacy by design",
      text: "Clinical information is treated as sensitive at every step, from entry to storage.",
    },
    {
      icon: KeyRound,
      title: "Secure access",
      text: "Encrypted connections and secure authentication protect every session.",
    },
    {
      icon: Users,
      title: "Controlled permissions",
      text: "Access is scoped to each user\u2019s role, so information reaches only who it should.",
    },
    {
      icon: History,
      title: "Traceability",
      text: "Referral activity is logged, so changes and actions can be reviewed when needed.",
    },
  ],
};

export const complianceGoals = {
  ar: [
    "تعامل مع البيانات متوافق مع مبادئ HIPAA كهدف تصميمي",
    "مبادئ خصوصية متوافقة مع GDPR في المناطق المعنية",
    "تشفير البيانات أثناء النقل وأثناء التخزين",
    "سجلات تدقيق لكل عملية على الإحالات",
  ],
  en: [
    "HIPAA-aligned data handling as a design target",
    "GDPR-aligned privacy principles for applicable regions",
    "Encryption in transit and at rest",
    "Audit logs for every referral action",
  ],
};
