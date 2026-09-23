export const workflowContent = {
  ar: {
    eyebrow: "مساعدة ذكية بقيادة الطبيب",
    title: "Clarity تساعد… والطبيب يقرّر",
    lead: "تدعم Clarity المسار بين الملاحظات السريرية والإحالة النهائية، ولا تتخذ أي قرار سريري بمفردها.",
  },
  en: {
    eyebrow: "AI-assisted, physician-led",
    title: "Clarity assists. The physician decides.",
    lead: "Clarity supports the workflow between clinical notes and a finished referral. It never makes a clinical decision on its own.",
  },
};

export const workflowStages = {
  ar: [
    { label: "ملاحظات سريرية", detail: "المعلومات كما أدخلها الطبيب" },
    { label: "تحليل ذكي", detail: "تحديد التفاصيل السريرية ذات الصلة" },
    { label: "معلومات مرتبطة", detail: "تنظيم النتائج الأساسية حسب التصنيف" },
    { label: "إحالة منظَّمة", detail: "تجميع مسودة إحالة مكتملة" },
    { label: "مراجعة الطبيب", detail: "الطبيب يؤكد قبل الإرسال" },
  ],
  en: [
    { label: "Clinical notes", detail: "Raw information as entered by the physician" },
    { label: "AI analysis", detail: "Clarity identifies relevant clinical details" },
    { label: "Relevant information", detail: "Key findings are organized by category" },
    { label: "Structured referral", detail: "A complete draft referral is assembled" },
    { label: "Physician review", detail: "The physician confirms before it is sent" },
  ],
};
