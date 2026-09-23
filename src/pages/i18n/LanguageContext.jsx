import React, { createContext, useState, useContext, useEffect } from "react";

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem("medflow.lang") || "en";
  });

  useEffect(() => {
    localStorage.setItem("medflow.lang", lang);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);

  const toggleLang = () => {
    setLang((prev) => (prev === "en" ? "ar" : "en"));
  };

  const isRTL = lang === "ar";

  const pick = (objOrEn, arStr) => {
    if (
      typeof objOrEn === "object" &&
      objOrEn !== null &&
      ("en" in objOrEn || "ar" in objOrEn)
    ) {
      return lang === "ar"
        ? objOrEn.ar !== undefined
          ? objOrEn.ar
          : objOrEn.en
        : objOrEn.en;
    }
    return lang === "ar" ? (arStr !== undefined ? arStr : objOrEn) : objOrEn;
  };

  return (
    <LanguageContext.Provider
      value={{ lang, setLang, toggleLang, isRTL, pick }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLang = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLang must be used within a LanguageProvider");
  }
  return context;
};
