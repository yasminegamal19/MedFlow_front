import { ShieldCheck, UserCheck2, Workflow } from "lucide-react";

export const trustPillars = {
  ar: [
    {
      icon: UserCheck2,
      title: "مبني بالتعاون مع الأطباء",
      text: "مصمَّم حول مسار الإحالة الحقيقي في العيادة، لا مجرد نموذج عام.",
    },
    {
      icon: Workflow,
      title: "مراجعة بشرية دائمًا",
      text: "كل إحالة يراجعها الطبيب ويعتمدها قبل إرسالها للأخصائي.",
    },
    {
      icon: ShieldCheck,
      title: "أمان بمعايير القطاع الصحي",
      text: "التحكم بالصلاحيات وخصوصية البيانات متطلبات أساسية في التصميم.",
    },
  ],
  en: [
    {
      icon: UserCheck2,
      title: "Built with physicians",
      text: "Designed around real referral workflows, not a generic form.",
    },
    {
      icon: Workflow,
      title: "Human review, always",
      text: "Every referral is reviewed and approved by the physician before it is sent.",
    },
    {
      icon: ShieldCheck,
      title: "Healthcare-first security",
      text: "Built with access control and data privacy as core requirements.",
    },
  ],
};
